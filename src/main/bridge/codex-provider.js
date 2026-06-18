'use strict';

const { getPreferences } = require('../app-preferences');
const { BridgeClient } = require('./bridge-client');
const { CodexCliClient } = require('./codex-cli-client');

const BACKENDS = new Set(['direct', 'bridge']);

class BridgeCodexProvider {
  constructor(bridgeClient) {
    this.backend = 'bridge';
    this.bridgeClient = bridgeClient;
  }

  getStatus() {
    return this.bridgeClient.getStatus();
  }

  getCapabilities(forceRefresh) {
    return this.bridgeClient.getCapabilities(forceRefresh);
  }

  supportsImageReferenceAttachments() {
    return this.bridgeClient.supportsImageReferenceAttachments();
  }

  supportsImageMasks() {
    return this.bridgeClient._capabilities?.features?.image_masks === true;
  }

  chat(payload, signalKey) {
    return this.bridgeClient.chat(payload, signalKey);
  }

  images(payload, signalKey, options) {
    return this.bridgeClient.images(payload, signalKey, options);
  }

  mediaAnalyze(payload, signalKey) {
    return this.bridgeClient.mediaAnalyze(payload, signalKey);
  }

  abort(signalKey) {
    return this.bridgeClient.abort(signalKey);
  }

  subscribeJobEvents(onJobs) {
    return this.bridgeClient.subscribeJobEvents(onJobs);
  }
}

class DirectCodexProvider {
  constructor(cliClient) {
    this.backend = 'direct';
    this.cliClient = cliClient;
  }

  getStatus() {
    return this.cliClient.getStatus();
  }

  getCapabilities(forceRefresh) {
    return this.cliClient.getCapabilities(forceRefresh);
  }

  supportsImageReferenceAttachments() {
    return this.cliClient.supportsImageReferenceAttachments();
  }

  supportsImageMasks() {
    return this.cliClient.supportsImageMasks();
  }

  chat(payload, signalKey) {
    return this.cliClient.chat(payload, signalKey);
  }

  images(payload, signalKey, options) {
    return this.cliClient.images(payload, signalKey, options);
  }

  mediaAnalyze(payload, signalKey) {
    return this.cliClient.mediaAnalyze(payload, signalKey);
  }

  abort(signalKey) {
    return this.cliClient.abort(signalKey);
  }

  subscribeJobEvents(onJobs) {
    return this.cliClient.subscribeJobEvents(onJobs);
  }
}

class CodexProviderRouter {
  constructor(bridgeClient, cliClient, systemLocaleFn) {
    this.bridge = new BridgeCodexProvider(bridgeClient);
    this.direct = new DirectCodexProvider(cliClient);
    this.systemLocaleFn = systemLocaleFn || (() => 'en');
  }

  resolveBackend() {
    const prefs = getPreferences(this.systemLocaleFn());
    const backend = prefs.codexBackend || 'direct';
    return BACKENDS.has(backend) ? backend : 'direct';
  }

  active() {
    return this.resolveBackend() === 'bridge' ? this.bridge : this.direct;
  }

  get backend() {
    return this.active().backend;
  }

  getStatus() {
    return this.active().getStatus();
  }

  getCapabilities(forceRefresh) {
    return this.active().getCapabilities(forceRefresh);
  }

  supportsImageReferenceAttachments() {
    return this.active().supportsImageReferenceAttachments();
  }

  supportsImageMasks() {
    return this.active().supportsImageMasks();
  }

  chat(payload, signalKey) {
    return this.active().chat(payload, signalKey);
  }

  images(payload, signalKey, options) {
    return this.active().images(payload, signalKey, options);
  }

  mediaAnalyze(payload, signalKey) {
    return this.active().mediaAnalyze(payload, signalKey);
  }

  abort(signalKey) {
    return this.active().abort(signalKey);
  }

  subscribeJobEvents(onJobs) {
    return this.active().subscribeJobEvents(onJobs);
  }
}

function createCodexProvider(bridgeClient, options = {}) {
  const cliClient = options.cliClient || new CodexCliClient();
  const bridge = bridgeClient || new BridgeClient();
  return new CodexProviderRouter(bridge, cliClient, options.systemLocaleFn);
}

module.exports = {
  BridgeCodexProvider,
  DirectCodexProvider,
  CodexProviderRouter,
  createCodexProvider,
  BACKENDS,
};
