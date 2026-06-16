'use strict';

const crypto = require('crypto');
const fs = require('fs');
const paths = require('../paths');

const APP_ORIGIN = 'http://127.0.0.1:9473';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8765';

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
  }

  setToken(token) {
    this.token = token;
    const state = loadBridgeState();
    state.token = token;
    state.origin = this.origin;
    state.bridgeUrl = this.bridgeUrl;
    saveBridgeState(state);
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
    const timeout = options.timeout || 1800000;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${this.bridgeUrl}${route}`, {
        method: options.method || 'GET',
        headers: this.headers(requestId),
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.message || `${response.status} ${response.statusText}`);
        err.details = data;
        err.status = response.status;
        throw err;
      }
      return data;
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
    return this.fetchJson('/v1/status');
  }

  async pair(pairingCode) {
    const result = await this.fetchJson('/v1/pair', {
      method: 'POST',
      body: { origin: this.origin, pairing_code: pairingCode },
    });
    if (result.token) {
      this.setToken(result.token);
    }
    return result;
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
      job_token: `werbungmaker-${requestId}`,
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
    });
  }

  async images(payload, signalKey) {
    return this.fetchJson('/v1/images', {
      method: 'POST',
      body: await this.jobEnvelope('image', payload),
      signalKey,
      timeout: Number(process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS || 1800000),
    });
  }

  async mediaAnalyze(payload, signalKey) {
    return this.fetchJson('/v1/media/analyze', {
      method: 'POST',
      body: await this.jobEnvelope('media_analysis', payload),
      signalKey,
    });
  }

  subscribeJobEvents(onJobs) {
    const url = `${this.bridgeUrl}/v1/status/events`;
    const controller = new AbortController();
    let closed = false;

    (async () => {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'text/event-stream', Origin: this.origin },
          signal: controller.signal,
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
