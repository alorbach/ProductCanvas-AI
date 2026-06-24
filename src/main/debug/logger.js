'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

const MAX_ENTRIES = 200;
const entries = [];
let logPath = null;

function getLogPath() {
  if (!logPath) {
    fs.mkdirSync(paths.userDataRoot(), { recursive: true });
    logPath = path.join(paths.userDataRoot(), 'debug.log');
  }
  return logPath;
}

function appendFile(line) {
  try {
    fs.appendFileSync(getLogPath(), `${line}\n`, 'utf8');
  } catch { /* ignore */ }
}

function log(level, source, message, details = null) {
  const entry = {
    time: new Date().toISOString(),
    level,
    source,
    message,
    details,
  };
  entries.push(entry);
  while (entries.length > MAX_ENTRIES) entries.shift();
  const detailStr = details ? ` ${JSON.stringify(details)}` : '';
  appendFile(`[${entry.time}] ${level.toUpperCase()} ${source}: ${message}${detailStr}`);
  if (typeof global.__productCanvasOnDebugEntry === 'function') {
    global.__productCanvasOnDebugEntry(entry);
  }
  return entry;
}

function info(source, message, details) {
  return log('info', source, message, details);
}

function warn(source, message, details) {
  return log('warn', source, message, details);
}

function error(source, message, details) {
  return log('error', source, message, details);
}

function debug(source, message, details) {
  return log('debug', source, message, details);
}

function getLog() {
  return [...entries];
}

function clear() {
  entries.length = 0;
  try {
    fs.writeFileSync(getLogPath(), '', 'utf8');
  } catch { /* ignore */ }
}

function setBroadcast(fn) {
  global.__productCanvasOnDebugEntry = fn;
}

module.exports = {
  log, info, warn, error, debug, getLog, clear, setBroadcast, getLogPath,
};
