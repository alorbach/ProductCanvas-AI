'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { Agent } = require('undici');
const paths = require('../paths');
const debugLog = require('../debug/logger');

const APP_ORIGIN = 'http://127.0.0.1:9473';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 1800000;
const STATUS_TIMEOUT_MS = 60000;

const dispatchers = new Map();

function getDispatcher(timeoutMs) {
  const key = String(timeoutMs);
  if (!dispatchers.has(key)) {
    dispatchers.set(key, new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: 60000,
    }));
  }
  return dispatchers.get(key);
}

function wrapFetchError(err, route, timeoutMs) {
  if (err?.name === 'AbortError') {
    const e = new Error(`Zeitüberschreitung nach ${Math.round(timeoutMs / 60000)} Min. (${route})`);
    e.code = 'BRIDGE_TIMEOUT';
    return e;
  }
  const causeCode = err?.cause?.code || '';
  if (causeCode === 'UND_ERR_HEADERS_TIMEOUT' || causeCode === 'UND_ERR_BODY_TIMEOUT') {
    const e = new Error(
      'Die Bridge hat zu lange nicht geantwortet. Bei Bildgenerierung kann das mehrere Minuten dauern – Bridge-Status im Tray prüfen und erneut versuchen.',
    );
    e.code = 'BRIDGE_HEADERS_TIMEOUT';
    e.route = route;
    return e;
  }
  if (String(err?.message || '').toLowerCase().includes('fetch failed')) {
    const e = new Error('Verbindung zur Codex Local Bridge fehlgeschlagen. Läuft die Bridge auf Port 8765?');
    e.code = 'BRIDGE_FETCH_FAILED';
    e.route = route;
    e.cause = err.cause || err;
    return e;
  }
  return err;
}

function loadBridgeState() {
  try {
    return JSON.parse(fs.readFileSync(paths.bridgeStatePath(), 'utf8'));
  } catch {
    return { bridgeUrl: DEFAULT_BRIDGE_URL, token: '', origin: APP_ORIGIN };
  }
}

function saveBridgeState(state) {
  fs.mkdirSync(paths.userDataRoot(), { recursive: true });
  fs.writeFileSync(paths.bridgeStatePath(), JSON.stringify(state, null, 2));
}

async function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

class BridgeClient {
  constructor(options = {}) {
    const state = loadBridgeState();
    this.bridgeUrl = (options.bridgeUrl || state.bridgeUrl || DEFAULT_BRIDGE_URL).replace(/\/$/, '');
    this.origin = options.origin || state.origin || APP_ORIGIN;
    this.token = options.token || state.token || '';
    this.abortControllers = new Map();
    this._capabilities = null;
  }

  setToken(token) {
    this.token = token;
    const state = loadBridgeState();
    state.token = token;
    state.origin = this.origin;
    state.bridgeUrl = this.bridgeUrl;
    saveBridgeState(state);
  }

  clearToken() {
    this.token = '';
    const state = loadBridgeState();
    state.token = '';
    saveBridgeState(state);
  }

  static isPairingError(err) {
    const msg = String(err?.message || '').toLowerCase();
    const status = err?.status;
    return status === 403 && (
      msg.includes('not paired')
      || msg.includes('pairing')
      || msg.includes('invalid') && msg.includes('token')
    );
  }

  headers(requestId) {
    const h = {
      'Content-Type': 'application/json',
      Origin: this.origin,
      'X-Alorbach-Request-Id': requestId || crypto.randomUUID(),
    };
    if (this.token) {
      h['X-Alorbach-Bridge-Token'] = this.token;
    }
    return h;
  }

  async fetchJson(route, options = {}) {
    const requestId = options.requestId || crypto.randomUUID();
    const controller = new AbortController();
    if (options.signalKey) {
      this.abortControllers.set(options.signalKey, controller);
    }
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeout);
    let bodyStr = '';
    try {
      if (options.body) {
        bodyStr = JSON.stringify(options.body);
        debugLog.info('bridge-client', `${options.method || 'GET'} ${route}`, {
          requestId,
          bodyBytes: Buffer.byteLength(bodyStr, 'utf8'),
          timeoutMs: timeout,
        });
      }
      const response = await fetch(`${this.bridgeUrl}${route}`, {
        method: options.method || 'GET',
        headers: this.headers(requestId),
        body: bodyStr || undefined,
        signal: controller.signal,
        dispatcher: getDispatcher(timeout),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.message || `${response.status} ${response.statusText}`);
        err.details = data;
        err.status = response.status;
        err.route = route;
        err.requestId = requestId;
        if (BridgeClient.isPairingError(err) && this.token) {
          this.clearToken();
          err.needsPairing = true;
        }
        debugLog.error('bridge-client', `Bridge-Fehler ${route}`, {
          requestId,
          status: response.status,
          message: err.message,
          bodyBytes: bodyStr ? Buffer.byteLength(bodyStr, 'utf8') : 0,
          debug_help: data.debug_help,
        });
        throw err;
      }
      return data;
    } catch (err) {
      const wrapped = wrapFetchError(err, route, timeout);
      if (wrapped !== err) {
        debugLog.error('bridge-client', `Bridge-Netzwerkfehler ${route}`, {
          requestId,
          message: wrapped.message,
          cause: err.cause?.code || err.message,
        });
      }
      throw wrapped;
    } finally {
      clearTimeout(timer);
      if (options.signalKey) {
        this.abortControllers.delete(options.signalKey);
      }
    }
  }

  abort(signalKey) {
    const c = this.abortControllers.get(signalKey);
    if (c) {
      c.abort();
    }
  }

  async getStatus() {
    return this.fetchJson('/v1/status', { timeout: STATUS_TIMEOUT_MS });
  }

  async getCapabilities(forceRefresh = false) {
    if (!forceRefresh && this._capabilities) {
      return this._capabilities;
    }
    this._capabilities = await this.fetchJson('/v1/capabilities', { timeout: STATUS_TIMEOUT_MS });
    return this._capabilities;
  }

  supportsImageReferenceAttachments() {
    return this._capabilities?.features?.image_reference_attachments === true;
  }

  async pair(pairingCode) {
    const result = await this.fetchJson('/v1/pair', {
      method: 'POST',
      body: { origin: this.origin, pairing_code: String(pairingCode || '').trim() },
    });
    if (result.token) {
      this.setToken(result.token);
    }
    return result;
  }

  async validatePairing() {
    return this.fetchJson('/v1/models');
  }

  async jobEnvelope(type, payload) {
    const requestId = crypto.randomUUID();
    const requestHash = await sha256(JSON.stringify({
      origin: this.origin,
      type,
      payload,
      requestId,
    }));
    return {
      job_token: `productcanvas-${requestId}`,
      request_hash: requestHash,
      request_id: requestId,
      payload,
    };
  }

  async chat(payload, signalKey) {
    return this.fetchJson('/v1/chat', {
      method: 'POST',
      body: await this.jobEnvelope('chat', payload),
      signalKey,
      timeout: Number(process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS || 600000),
    });
  }

  async images(payload, signalKey, options = {}) {
    const timeout = Number(process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const requireReferences = options.requireReferences === true || payload.requireReferences === true;
    const {
      referenced_image_paths: refPaths,
      reference_images: referenceImages,
      frames,
      requireReferences: _payloadRequire,
      ...rest
    } = payload;

    const attempts = [];
    if (referenceImages?.length) {
      attempts.push({
        mode: 'reference_images',
        body: { ...rest, reference_images: referenceImages },
      });
    }
    if (refPaths?.length) {
      attempts.push({
        mode: 'referenced_image_paths',
        body: { ...rest, referenced_image_paths: refPaths },
      });
    }
    if (frames?.length) {
      attempts.push({ mode: 'frames', body: { ...rest, frames } });
    }
    if (!requireReferences) {
      attempts.push({ mode: 'prompt-only', body: { ...rest } });
    }

    if (!attempts.length) {
      throw new Error('Keine Bildgenerierungs-Payload vorhanden.');
    }

    let lastErr;
    for (let i = 0; i < attempts.length; i++) {
      const { mode, body } = attempts[i];
      try {
        const attachmentCount = body.reference_images?.length
          || body.referenced_image_paths?.length
          || body.frames?.length
          || 0;
        debugLog.info('bridge-client', `POST /v1/images (${mode})`, { attachmentCount });
        const result = await this.fetchJson('/v1/images', {
          method: 'POST',
          body: await this.jobEnvelope('image', body),
          signalKey,
          timeout,
        });
        result._attachmentMode = mode;
        const providerDetails = result?.response?.provider_details || {};
        result._refsForwardedToCodex = providerDetails.refs_forwarded_to_codex === true
          || Number(providerDetails.reference_attachment_count || 0) > 0;
        result._referenceAttachmentCount = Number(providerDetails.reference_attachment_count || 0);
        return result;
      } catch (err) {
        lastErr = err;
        const canRetry = i < attempts.length - 1 && err.status === 400;
        if (canRetry) {
          debugLog.warn('bridge-client', `Bild-Anhang ${mode} fehlgeschlagen, Fallback`, {
            message: err.message,
            status: err.status,
          });
          continue;
        }
        if (requireReferences) {
          const e = new Error(
            'Referenzbilder konnten nicht an die Bridge übergeben werden. Bitte Debug-Log prüfen und erneut versuchen.',
          );
          e.code = 'REFERENCE_ATTACH_FAILED';
          e.cause = err;
          e.attachmentMode = mode;
          throw e;
        }
        throw err;
      }
    }
    throw lastErr || new Error('Bildgenerierung fehlgeschlagen.');
  }

  async mediaAnalyze(payload, signalKey) {
    return this.fetchJson('/v1/media/analyze', {
      method: 'POST',
      body: await this.jobEnvelope('media_analysis', payload),
      signalKey,
      timeout: Number(process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS || 600000),
    });
  }

  subscribeJobEvents(onJobs) {
    const url = `${this.bridgeUrl}/v1/status/events`;
    const controller = new AbortController();
    const timeout = DEFAULT_TIMEOUT_MS;
    let closed = false;

    (async () => {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'text/event-stream', Origin: this.origin },
          signal: controller.signal,
          dispatcher: getDispatcher(timeout),
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
            if (dataLine) {
              try {
                onJobs(JSON.parse(dataLine.slice(5).trim()));
              } catch { /* ignore */ }
            }
          }
        }
      } catch (err) {
        if (!closed && err.name !== 'AbortError') {
          onJobs({ error: err.message });
        }
      }
    })();

    return () => {
      closed = true;
      controller.abort();
    };
  }
}

module.exports = { BridgeClient, APP_ORIGIN, DEFAULT_BRIDGE_URL, loadBridgeState };
