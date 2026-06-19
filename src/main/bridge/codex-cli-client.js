'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const debugLog = require('../debug/logger');

const envBinaryOverride = process.env.ALORBACH_CODEX_BINARY || '';
const defaultBinaryName = 'codex';
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const authPath = path.join(codexHome, 'auth.json');
const generatedImagesDir = path.join(codexHome, 'generated_images');
const LOG_TEXT_MAX = 8000;
let resolvedBinaryCache = null;
let binaryResolutionLogged = false;
let resolvedBinaryMeta = {
  source: 'default',
  preference_path: '',
  configured_path: '',
};

function getPreferenceCodexCliPath() {
  try {
    const { readDefaults } = require('../app-preferences');
    return String(readDefaults().codexCliPath || '').trim();
  } catch {
    return '';
  }
}

function invalidateCodexBinaryCache() {
  resolvedBinaryCache = null;
  binaryResolutionLogged = false;
  resolvedBinaryMeta = {
    source: 'default',
    preference_path: '',
    configured_path: '',
  };
}

function binaryLooksLikePath(binary) {
  return /[\\/]/.test(String(binary || ''));
}

function binaryExistsOnSystem(binary) {
  const value = String(binary || '').trim();
  if (!value) return false;
  if (binaryLooksLikePath(value)) {
    try {
      return fs.existsSync(value);
    } catch {
      return false;
    }
  }
  if (process.platform === 'win32') {
    const lookup = spawnSync('where.exe', [value], { encoding: 'utf8', shell: false });
    return lookup.status === 0;
  }
  const lookup = spawnSync('which', [value], { encoding: 'utf8', shell: false });
  return lookup.status === 0;
}

function truncateLogText(text, max = LOG_TEXT_MAX) {
  const raw = String(text || '');
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}\n… (${raw.length} chars total, truncated)`;
}

function formatArgForLog(arg) {
  const value = String(arg || '');
  if (value.length > 120) return `${value.slice(0, 117)}…`;
  return value;
}

function codexCommandLabel(args) {
  return `${resolveCodexBinary()} ${(Array.isArray(args) ? args : []).map(formatArgForLog).join(' ')}`;
}

function pathLookupMatches(binaryName = defaultBinaryName) {
  if (process.platform !== 'win32') return [];
  const lookup = spawnSync('where.exe', [binaryName], { encoding: 'utf8', shell: false });
  if (lookup.status !== 0) return [];
  return (lookup.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function resolveBinaryFromWindowsLookup(binaryName = defaultBinaryName) {
  const lookup = spawnSync('where.exe', [binaryName], { encoding: 'utf8', shell: false });
  if (lookup.status !== 0) return '';
  const matches = (lookup.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return matches.find((line) => /\.exe$/i.test(line))
    || matches.find((line) => /\.(cmd|bat)$/i.test(line))
    || matches[0]
    || '';
}

function resolveBinaryInternal() {
  const preferencePath = getPreferenceCodexCliPath();
  resolvedBinaryMeta = {
    source: 'default',
    preference_path: preferencePath,
    configured_path: '',
  };

  if (envBinaryOverride) {
    resolvedBinaryMeta.source = 'env';
    if (process.platform !== 'win32' || binaryLooksLikePath(envBinaryOverride)) {
      return envBinaryOverride;
    }
    const extensionBinary = findWindowsCodexExtensionBinary();
    if (extensionBinary) {
      resolvedBinaryMeta.source = 'env_extension';
      return extensionBinary;
    }
    const fromPath = resolveBinaryFromWindowsLookup(envBinaryOverride);
    return fromPath || envBinaryOverride;
  }

  if (preferencePath) {
    resolvedBinaryMeta.configured_path = preferencePath;
    if (fs.existsSync(preferencePath)) {
      resolvedBinaryMeta.source = 'settings';
      return preferencePath;
    }
    debugLog.warn('codex-cli-client', 'Konfigurierter Codex-CLI-Pfad nicht gefunden, Auto-Erkennung', {
      configured_path: preferencePath,
    });
  }

  if (process.platform !== 'win32') {
    return defaultBinaryName;
  }

  const extensionBinary = findWindowsCodexExtensionBinary();
  if (extensionBinary) {
    resolvedBinaryMeta.source = 'extension';
    return extensionBinary;
  }

  const fromPath = resolveBinaryFromWindowsLookup(defaultBinaryName);
  if (fromPath) {
    resolvedBinaryMeta.source = 'path';
    return fromPath;
  }

  return defaultBinaryName;
}

function logBinaryResolution() {
  if (binaryResolutionLogged) return;
  binaryResolutionLogged = true;
  const binary = resolveCodexBinary();
  const details = {
    codex_binary: binary,
    resolution_source: resolvedBinaryMeta.source,
    preference_path: resolvedBinaryMeta.preference_path || undefined,
    configured_path: resolvedBinaryMeta.configured_path || undefined,
    binary_exists: binaryExistsOnSystem(binary),
    env_override: envBinaryOverride || undefined,
    codex_home: codexHome,
    auth_path: authPath,
    auth_exists: fs.existsSync(authPath),
  };
  if (process.platform === 'win32' && !envBinaryOverride && !resolvedBinaryMeta.configured_path) {
    const pathMatches = pathLookupMatches();
    if (pathMatches.length) details.path_lookup = pathMatches;
    const extensionBinary = findWindowsCodexExtensionBinary();
    if (extensionBinary) details.extension_binary = extensionBinary;
    if (extensionBinary && extensionBinary !== binary) {
      details.note = 'App uses extension binary; terminal may use PATH codex instead.';
    }
  }
  debugLog.info('codex-cli-client', 'Codex-Binary aufgelöst', details);
}

function buildCliFailureDetails(run, meta = {}) {
  const details = {
    codex_binary: resolveCodexBinary(),
    codex_home: codexHome,
    ...meta,
    exit_status: run?.status ?? null,
    exit_signal: run?.signal ?? null,
    used_json: run?.used_json ?? null,
    json_fallback_reason: run?.json_fallback_reason || null,
    stderr: truncateLogText(run?.stderr),
    stdout: truncateLogText(run?.stdout),
  };
  if (run?.structured?.errors?.length) details.event_errors = run.structured.errors;
  if (run?.error) details.spawn_error = run.error.message || String(run.error);
  const stderrHint = String(run?.stderr || '').trim().split(/\r?\n/).find(Boolean);
  if (stderrHint) details.stderr_hint = stderrHint;
  return details;
}

function logCliFailure(kind, run, meta = {}) {
  debugLog.error('codex-cli-client', `Codex CLI ${kind} fehlgeschlagen`, buildCliFailureDetails(run, meta));
}

function collectCodexExe(root, matches, depth = 0) {
  if (!root || depth > 6 || !fs.existsSync(root)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === 'codex.exe') {
      matches.push(fullPath);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const name = entry.name.toLowerCase();
    if (depth === 0 && name.indexOf('openai.chatgpt-') !== 0 && root.toLowerCase().indexOf('programs') === -1) {
      continue;
    }
    collectCodexExe(fullPath, matches, depth + 1);
  }
}

function findWindowsCodexExtensionBinary() {
  const home = os.homedir();
  const roots = [
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.cursor', 'extensions'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
  ].filter(Boolean);
  const matches = [];
  for (const root of roots) {
    collectCodexExe(root, matches);
  }
  matches.sort((a, b) => b.localeCompare(a));
  return matches[0] || '';
}

function resolveCodexBinary() {
  if (!resolvedBinaryCache) {
    resolvedBinaryCache = resolveBinaryInternal();
  }
  return resolvedBinaryCache;
}

function getCodexCliInfo() {
  logBinaryResolution();
  const binary = resolveCodexBinary();
  return {
    configuredPath: getPreferenceCodexCliPath(),
    resolvedBinary: binary,
    resolutionSource: resolvedBinaryMeta.source,
    envOverride: Boolean(envBinaryOverride),
    binaryExists: binaryExistsOnSystem(binary),
    codexHome,
    authPath,
    authExists: fs.existsSync(authPath),
  };
}

function runCodex(args, options = {}, meta = {}) {
  logBinaryResolution();
  const command = codexCommandLabel(args);
  debugLog.debug('codex-cli-client', 'Codex sync spawn', {
    kind: meta.kind || 'sync',
    phase: meta.phase || meta.kind || 'sync',
    command,
    cwd: options.cwd || process.cwd(),
  });
  const result = spawnSync(resolveCodexBinary(), args, {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, CODEX_HOME: codexHome },
    ...options,
  });
  if (result.error || result.status !== 0) {
    logCliFailure(meta.kind || 'sync', {
      ...result,
      used_json: null,
    }, { command, phase: meta.phase || meta.kind || 'sync' });
  } else if (meta.kind) {
    debugLog.debug('codex-cli-client', 'Codex sync ok', {
      kind: meta.kind,
      phase: meta.phase || meta.kind,
      command,
      exit_status: result.status,
      stdout_bytes: Buffer.byteLength(String(result.stdout || ''), 'utf8'),
      stderr_bytes: Buffer.byteLength(String(result.stderr || ''), 'utf8'),
    });
  }
  return result;
}

function runCodexAsync(args, options = {}) {
  const { timeout, onOutput, input, abortSignal, ...spawnOptions } = options;
  const emitOutput = typeof onOutput === 'function' ? onOutput : () => {};
  const stdinInput = typeof input === 'string' || Buffer.isBuffer(input) ? input : null;
  return new Promise((resolve) => {
    let child;
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let timedOut = false;
    const onAbort = () => {
      if (child && !child.killed) child.kill();
    };
    if (abortSignal) {
      if (abortSignal.aborted) {
        resolve({ stdout: '', stderr: '', status: null, signal: 'SIGTERM', error: new Error('Aborted') });
        return;
      }
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      child = spawn(resolveCodexBinary(), args, {
        shell: false,
        windowsHide: true,
        stdio: [stdinInput === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        env: { ...process.env, CODEX_HOME: codexHome },
        ...spawnOptions,
      });
    } catch (error) {
      debugLog.error('codex-cli-client', 'Codex async spawn fehlgeschlagen', {
        command: codexCommandLabel(args),
        codex_binary: resolveCodexBinary(),
        error: error.message || String(error),
      });
      resolve({ stdout, stderr, status: null, signal: null, error });
      return;
    }
    if (stdinInput !== null && child.stdin) {
      child.stdin.once('error', (error) => { spawnError = spawnError || error; });
      child.stdin.end(stdinInput);
    }
    const timer = timeout ? setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout) : null;
    if (timer?.unref) timer.unref();
    child.stdout.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      emitOutput('stdout', text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      emitOutput('stderr', text);
    });
    child.once('error', (error) => {
      spawnError = error;
      debugLog.error('codex-cli-client', 'Codex async Prozessfehler', {
        command: codexCommandLabel(args),
        codex_binary: resolveCodexBinary(),
        error: error.message || String(error),
      });
    });
    child.once('close', (status, signal) => {
      if (timer) clearTimeout(timer);
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
      resolve({
        stdout,
        stderr,
        status,
        signal,
        error: spawnError || (timedOut ? new Error('Codex CLI execution timed out.') : null),
      });
    });
  });
}

function parseCodexJsonEvents(stdout) {
  const events = [];
  const errors = [];
  const finalMessages = [];
  let usage = null;
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    events.push(event);
    const error = event.error || event.payload?.error;
    if (error) errors.push(typeof error === 'string' ? error : String(error.message || error));
    const eventType = String(event.type || event.event || '');
    const item = event.item || event.payload?.item || {};
    const itemType = String(item.type || item.kind || '');
    if (/completed|message|item/.test(eventType) && /message|agent/i.test(itemType)) {
      const text = typeof item.text === 'string' ? item.text : (typeof item.content === 'string' ? item.content : '');
      if (text) finalMessages.push(text);
    }
    const u = event.usage || event.turn?.usage || event.payload?.usage;
    if (u?.total_tokens) usage = { total_tokens: Number(u.total_tokens) || 0 };
  }
  return { events, errors, finalMessages, usage };
}

function codexJsonUnsupported(run) {
  const combined = `${run?.stdout || ''}\n${run?.stderr || ''}`;
  return !!(run && run.status !== 0 && /(?:unknown|unexpected|unrecognized).{0,80}(?:--json|json)|(?:--json|json).{0,80}(?:unknown|unexpected|unrecognized)/i.test(combined));
}

async function runCodexExec(args, options = {}, meta = {}) {
  logBinaryResolution();
  const command = codexCommandLabel(args);
  debugLog.info('codex-cli-client', 'Codex exec start', {
    kind: meta.kind || 'exec',
    command,
    cwd: options.cwd || process.cwd(),
    input_bytes: typeof options.input === 'string'
      ? Buffer.byteLength(options.input, 'utf8')
      : (Buffer.isBuffer(options.input) ? options.input.length : 0),
    timeout_ms: options.timeout || null,
  });

  const jsonArgs = args[0] === 'exec' ? ['exec', '--json', ...args.slice(1)] : ['--json', ...args];
  const jsonCommand = codexCommandLabel(jsonArgs);
  const run = await runCodexAsync(jsonArgs, options);
  run.structured = parseCodexJsonEvents(run.stdout || '');
  run.used_json = true;
  if (!codexJsonUnsupported(run)) {
    if (run.error || run.status !== 0) {
      logCliFailure(meta.kind || 'exec', run, { command: jsonCommand, phase: 'exec --json' });
    } else {
      debugLog.info('codex-cli-client', 'Codex exec ok', {
        kind: meta.kind || 'exec',
        command: jsonCommand,
        exit_status: run.status,
        stdout_bytes: Buffer.byteLength(String(run.stdout || ''), 'utf8'),
        stderr_bytes: Buffer.byteLength(String(run.stderr || ''), 'utf8'),
        event_errors: run.structured?.errors?.length ? run.structured.errors : undefined,
      });
    }
    return run;
  }

  debugLog.warn('codex-cli-client', 'Codex exec --json nicht unterstützt, Fallback ohne --json', {
    kind: meta.kind || 'exec',
    command: jsonCommand,
    stderr: truncateLogText(run.stderr, 500),
  });
  const fallback = await runCodexAsync(args, options);
  fallback.structured = parseCodexJsonEvents('');
  fallback.used_json = false;
  fallback.json_fallback_reason = 'Codex CLI does not support `codex exec --json`.';
  if (fallback.error || fallback.status !== 0) {
    logCliFailure(meta.kind || 'exec', fallback, { command, phase: 'exec fallback' });
  } else {
    debugLog.info('codex-cli-client', 'Codex exec ok (Fallback ohne --json)', {
      kind: meta.kind || 'exec',
      command,
      exit_status: fallback.status,
    });
  }
  return fallback;
}

function checkStatus() {
  logBinaryResolution();
  const version = runCodex(['--version'], {}, { kind: 'status', phase: 'version' });
  if (version.error) {
    debugLog.warn('codex-cli-client', 'Codex CLI Status: Binary nicht ausführbar', {
      codex_binary: resolveCodexBinary(),
      resolution_source: resolvedBinaryMeta.source,
      error: version.error.message || String(version.error),
    });
    return {
      success: false,
      message: 'Codex CLI is not installed or not on PATH.',
      details: { codex_binary: resolveCodexBinary(), error: version.error.message || String(version.error) },
    };
  }
  if (version.status !== 0) {
    debugLog.warn('codex-cli-client', 'Codex CLI Status: --version fehlgeschlagen', {
      codex_binary: resolveCodexBinary(),
      exit_status: version.status,
      stderr: truncateLogText(version.stderr, 500),
    });
    return {
      success: false,
      message: 'Codex CLI was found, but `codex --version` failed.',
      details: { codex_binary: resolveCodexBinary(), stderr: (version.stderr || '').trim() },
    };
  }
  const login = runCodex(['login', 'status'], {}, { kind: 'status', phase: 'login' });
  const loginText = `${login.stdout || ''}\n${login.stderr || ''}`;
  const loggedIn = !login.error && login.status === 0 && /logged in/i.test(loginText) && fs.existsSync(authPath);
  debugLog.info('codex-cli-client', 'Codex CLI Status geprüft', {
    codex_binary: resolveCodexBinary(),
    resolution_source: resolvedBinaryMeta.source,
    version: (version.stdout || version.stderr || '').trim(),
    logged_in: loggedIn,
    auth_exists: fs.existsSync(authPath),
  });
  return {
    success: loggedIn,
    message: loggedIn ? 'Local Codex CLI is installed and logged in.' : 'Codex CLI is installed, but this user is not logged in.',
    details: {
      codex_binary: resolveCodexBinary(),
      codex_home: codexHome,
      auth_path: authPath,
      generated_images_dir: generatedImagesDir,
      version: (version.stdout || version.stderr || '').trim(),
      login_status: (login.stdout || login.stderr || '').trim(),
    },
  };
}

function imageExtensionForMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  return 'bin';
}

function tryWriteDataImage(value, tempDir, index) {
  const text = String(value || '').trim();
  const match = text.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match || !tempDir) return null;
  const mime = match[1].toLowerCase();
  const extension = imageExtensionForMime(mime);
  if (extension === 'bin') return null;
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!bytes.length) return null;
  const imagePath = path.join(tempDir, `input-image-${index}.${extension}`);
  fs.writeFileSync(imagePath, bytes);
  return { bytes: bytes.length, mime, path: imagePath };
}

function mimeFromImagePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return '';
}

function tryCopyImagePath(filePath, tempDir, index) {
  if (!tempDir) return null;
  const resolved = path.resolve(String(filePath || '').trim());
  if (!resolved || !fs.existsSync(resolved)) return null;
  const mime = mimeFromImagePath(resolved);
  if (!mime) return null;
  const extension = imageExtensionForMime(mime);
  if (extension === 'bin') return null;
  let bytes;
  try {
    bytes = fs.readFileSync(resolved);
  } catch {
    return null;
  }
  if (!bytes.length) return null;
  const imagePath = path.join(tempDir, `input-image-${index}.${extension}`);
  fs.writeFileSync(imagePath, bytes);
  return { bytes: bytes.length, mime, path: imagePath, source_path: resolved };
}

function attachmentFromReferenceImage(entry, tempDir, index) {
  const b64 = String(entry?.b64_json || '').trim();
  if (!b64) return null;
  const mime = String(entry.mime_type || 'image/jpeg').toLowerCase();
  const attachment = tryWriteDataImage(`data:${mime};base64,${b64}`, tempDir, index);
  if (!attachment) return null;
  if (entry.label) attachment.label = String(entry.label);
  return attachment;
}

function collectImageAttachments(payload, tempDir) {
  const attachments = [];
  const seen = new Set();
  const push = (attachment) => {
    if (!attachment?.path || seen.has(attachment.path.toLowerCase())) return;
    seen.add(attachment.path.toLowerCase());
    attachments.push(attachment);
  };
  for (const entry of Array.isArray(payload.reference_images) ? payload.reference_images : []) {
    push(attachmentFromReferenceImage(entry, tempDir, attachments.length + 1));
  }
  for (const filePath of Array.isArray(payload.referenced_image_paths) ? payload.referenced_image_paths : []) {
    push(tryCopyImagePath(filePath, tempDir, attachments.length + 1));
  }
  for (const frame of Array.isArray(payload.frames) ? payload.frames : []) {
    push(tryWriteDataImage(frame, tempDir, attachments.length + 1));
  }
  return attachments;
}

function listGeneratedImages(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) {
        results.push({ path: fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs });
      }
    }
  }
  return results;
}

function detectNewImage(before, after) {
  const known = new Set(before.map((item) => item.path.toLowerCase()));
  return after.filter((item) => !known.has(item.path.toLowerCase())).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function imagePrompt(payload, attachments = [], maskPath = '') {
  const prompt = String(payload.prompt || '').trim();
  const size = String(payload.size || '1024x1024').trim();
  const quality = String(payload.quality || 'high').trim();
  const lines = [
    'Generate exactly one image using your built-in image generation tool.',
    'Do not access unrelated local files or modify anything except generated image output.',
  ];
  if (attachments.length) {
    lines.push(
      'Attached reference images are provided via --image flags. Use them as exact visual references; do not invent substitutes.',
    );
    for (let i = 0; i < attachments.length; i++) {
      const label = attachments[i].label ? ` (${attachments[i].label})` : '';
      lines.push(`- Image ${i + 1}${label}: exact reference from attachment ${i + 1}.`);
    }
    if (attachments.length >= 2) {
      lines.push('- Merge products from Image 1 into the layout structure of Image 2 photorealistically.');
    }
  }
  if (maskPath) {
    lines.push(
      'A layout mask is attached. Edit ONLY the opaque/masked region. Keep header, footer, contact bar, and all frozen layout zones pixel-identical.',
    );
  }
  lines.push(
    `User prompt: ${prompt}`,
    `Requested size: ${size}`,
    `Preferred quality: ${quality}`,
    'After the image has been generated, reply with a short plain-text confirmation only.',
  );
  return lines.join('\n');
}

function buildChatPrompt(messages, maxTokens, tempDir) {
  const attachments = [];
  const parts = [
    'Respond to the following chat transcript.',
    'Do not access local files, run shell commands, or modify the filesystem.',
    `Maximum response tokens hint: ${maxTokens || 1024}.`,
    '',
  ];
  for (const message of Array.isArray(messages) ? messages : []) {
    const role = String(message.role || 'user');
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content || '');
    parts.push(`${role.toUpperCase()}: ${content}`);
  }
  parts.push('', 'ASSISTANT:');
  return { attachments, prompt: parts.join('\n') };
}

function codexImageFailureFromOutput(stdout, stderr, structured = null) {
  const combined = `${stdout || ''}\n${stderr || ''}`;
  const details = { generated_images_dir: generatedImagesDir, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() };
  if (structured?.errors?.length) details.event_errors = structured.errors;
  if (/rate limit|too many requests/i.test(combined)) {
    return {
      success: false,
      code: 'codex_rate_limited',
      message: 'Codex image generation was rate limited. Please wait and retry.',
      details,
    };
  }
  return {
    success: false,
    code: 'codex_no_image_output',
    message: 'Codex CLI completed, but no new generated image file was detected.',
    details,
  };
}

function probeCapabilities() {
  logBinaryResolution();
  const version = runCodex(['--version'], {}, { kind: 'capabilities', phase: 'version' });
  const help = runCodex(['exec', '--help'], {}, { kind: 'capabilities', phase: 'exec-help' });
  const helpText = `${help.stdout || ''}\n${help.stderr || ''}`;
  const features = {
    chat: true,
    images: true,
    media_analysis: true,
    structured_exec_json: /--json/.test(helpText),
    image_attachments: /--image/.test(helpText),
    image_reference_attachments: /--image/.test(helpText),
    image_masks: /--mask/.test(helpText),
  };
  debugLog.info('codex-cli-client', 'Codex CLI Fähigkeiten ermittelt', {
    codex_binary: resolveCodexBinary(),
    resolution_source: resolvedBinaryMeta.source,
    version: (version.stdout || version.stderr || '').trim(),
    features,
  });
  return {
    success: !version.error && version.status === 0,
    codex: {
      binary: resolveCodexBinary(),
      version: (version.stdout || version.stderr || '').trim(),
    },
    features,
  };
}

class CodexCliClient {
  constructor() {
    this.abortControllers = new Map();
    this._capabilities = null;
  }

  checkStatus() {
    return checkStatus();
  }

  async getStatus() {
    return this.checkStatus();
  }

  async getCapabilities(forceRefresh = false) {
    if (!forceRefresh && this._capabilities) return this._capabilities;
    const probe = probeCapabilities();
    this._capabilities = {
      success: probe.success,
      bridge: { version: 'direct' },
      codex: probe.codex,
      features: probe.features,
    };
    return this._capabilities;
  }

  supportsImageReferenceAttachments() {
    return this._capabilities?.features?.image_reference_attachments === true;
  }

  supportsImageMasks() {
    return this._capabilities?.features?.image_masks === true;
  }

  abort(signalKey) {
    if (!signalKey) return false;
    const c = this.abortControllers.get(signalKey);
    if (!c) return false;
    c.abort();
    return true;
  }

  subscribeJobEvents() {
    return () => {};
  }

  async chat(payload, signalKey) {
    const status = checkStatus();
    if (!status.success) {
      debugLog.warn('codex-cli-client', 'Codex chat abgebrochen: Status nicht bereit', status.details || { message: status.message });
      const err = new Error(status.message);
      err.details = status.details;
      throw err;
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (!messages.length) throw new Error('No chat messages were provided.');
    const model = String(payload.model || 'codex-local:auto').replace(/^codex-local:/, '') || 'auto';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'productcanvas-codex-chat-'));
    const outputFile = path.join(tempDir, 'last-message.txt');
    const { attachments, prompt } = buildChatPrompt(messages, payload.max_tokens, tempDir);
    const args = [
      'exec', '--skip-git-repo-check', '--ephemeral', '--cd', tempDir,
      '--output-last-message', outputFile,
    ];
    if (model !== 'auto') args.push('--model', model);
    for (const attachment of attachments) args.push('--image', attachment.path);
    args.push('-');

    const controller = new AbortController();
    if (signalKey) this.abortControllers.set(signalKey, controller);
    try {
      const run = await runCodexExec(args, {
        cwd: tempDir,
        timeout: Number(process.env.ALORBACH_CODEX_CHAT_TIMEOUT_MS || 600000),
        input: prompt,
        abortSignal: controller.signal,
      }, { kind: 'chat', model, message_count: messages.length, attachment_count: attachments.length });
      let responseText = '';
      if (fs.existsSync(outputFile)) responseText = fs.readFileSync(outputFile, 'utf8').trim();
      if (!responseText && run.structured?.finalMessages?.length) {
        responseText = run.structured.finalMessages[run.structured.finalMessages.length - 1].trim();
      }
      if (run.error || run.status !== 0) {
        const details = buildCliFailureDetails(run, {
          kind: 'chat',
          command: codexCommandLabel(args),
          model,
          message_count: messages.length,
          attachment_count: attachments.length,
        });
        const err = new Error(details.stderr_hint || run.error?.message || 'Codex CLI chat request failed.');
        err.details = details;
        throw err;
      }
      return {
        response: {
          choices: [{ index: 0, message: { role: 'assistant', content: responseText || run.stdout }, finish_reason: 'stop' }],
          usage: run.structured?.usage || { total_tokens: 0, local_unmetered: true },
        },
      };
    } finally {
      if (signalKey) this.abortControllers.delete(signalKey);
    }
  }

  async images(payload, signalKey) {
    const status = checkStatus();
    if (!status.success) {
      debugLog.warn('codex-cli-client', 'Codex images abgebrochen: Status nicht bereit', status.details || { message: status.message });
      const err = new Error(status.message);
      err.details = status.details;
      throw err;
    }
    const prompt = String(payload.prompt || '').trim();
    if (!prompt) throw new Error('No image prompt was provided.');

    fs.mkdirSync(generatedImagesDir, { recursive: true });
    const before = listGeneratedImages(generatedImagesDir);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'productcanvas-codex-image-'));
    const outputFile = path.join(tempDir, 'last-message.txt');
    const attachments = collectImageAttachments(payload, tempDir);

    let maskPath = '';
    const maskCandidate = String(payload.mask_path || '').trim();
    if (maskCandidate && fs.existsSync(maskCandidate)) {
      const caps = await this.getCapabilities();
      if (caps.features?.image_masks) {
        maskPath = path.resolve(maskCandidate);
        debugLog.info('codex-cli-client', 'Layout-Maske wird an Codex übergeben', { maskPath });
      } else {
        debugLog.info('codex-cli-client', 'Layout-Maske vorbereitet, CLI unterstützt --mask noch nicht', { maskPath: maskCandidate });
      }
    }

    const args = [
      'exec', '--skip-git-repo-check', '--ephemeral', '--cd', tempDir,
      '--output-last-message', outputFile,
    ];
    for (const attachment of attachments) args.push('--image', attachment.path);
    if (maskPath) args.push('--mask', maskPath);
    args.push('-');

    const controller = new AbortController();
    if (signalKey) this.abortControllers.set(signalKey, controller);
    try {
      const run = await runCodexExec(args, {
        cwd: tempDir,
        timeout: Number(process.env.ALORBACH_CODEX_IMAGE_TIMEOUT_MS || 1800000),
        input: imagePrompt(payload, attachments, maskPath),
        abortSignal: controller.signal,
      }, {
        kind: 'images',
        attachment_count: attachments.length,
        mask_applied: Boolean(maskPath),
        generated_images_dir: generatedImagesDir,
      });
      const after = listGeneratedImages(generatedImagesDir);
      const newImages = detectNewImage(before, after);
      if (run.error || run.status !== 0 || !newImages.length) {
        const failure = codexImageFailureFromOutput(run.stdout, run.stderr, run.structured);
        const details = {
          ...buildCliFailureDetails(run, {
            kind: 'images',
            command: codexCommandLabel(args),
            attachment_count: attachments.length,
            mask_applied: Boolean(maskPath),
            generated_images_dir: generatedImagesDir,
            new_image_count: newImages.length,
          }),
          ...failure.details,
        };
        debugLog.error('codex-cli-client', 'Codex CLI Bildgenerierung fehlgeschlagen', details);
        const err = new Error(details.stderr_hint || failure.message);
        err.code = failure.code;
        err.details = details;
        throw err;
      }
      const bytes = fs.readFileSync(newImages[0].path);
      const attachmentMode = attachments.length ? 'direct_attachments' : 'prompt-only';
      return {
        response: {
          data: [{ b64_json: bytes.toString('base64') }],
          usage: run.structured?.usage || { total_tokens: 0, local_unmetered: true },
          provider_details: {
            image_path: newImages[0].path,
            generated_images_dir: generatedImagesDir,
            reference_attachment_count: attachments.length,
            refs_forwarded_to_codex: attachments.length > 0,
            mask_applied: Boolean(maskPath),
          },
        },
        _attachmentMode: attachmentMode,
        _refsForwardedToCodex: attachments.length > 0,
        _referenceAttachmentCount: attachments.length,
      };
    } finally {
      if (signalKey) this.abortControllers.delete(signalKey);
    }
  }

  async mediaAnalyze(payload, signalKey) {
    const frames = Array.isArray(payload.frames) ? payload.frames : [];
    const messages = [{
      role: 'user',
      content: [
        { type: 'input_text', text: String(payload.prompt || '') },
        ...frames.slice(0, 8).map((frame) => ({ type: 'input_image', image_url: { url: frame } })),
      ],
    }];
    return this.chat({ ...payload, messages, max_tokens: payload.max_tokens || 1024 }, signalKey);
  }
}

module.exports = {
  CodexCliClient,
  checkStatus,
  probeCapabilities,
  resolveCodexBinary,
  invalidateCodexBinaryCache,
  getCodexCliInfo,
  collectImageAttachments,
  imagePrompt,
};
