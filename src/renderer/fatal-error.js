'use strict';

function showFatalError(title, message, detail = '') {
  document.body.classList.remove('i18n-pending');
  const panel = document.getElementById('fatal-error');
  if (!panel) {
    console.error(title, message, detail);
    return;
  }
  const titleEl = panel.querySelector('.fatal-error-title');
  const messageEl = panel.querySelector('.fatal-error-message');
  const detailEl = panel.querySelector('.fatal-error-detail');
  if (titleEl) titleEl.textContent = title || 'Application error';
  if (messageEl) messageEl.textContent = message || 'An unexpected error occurred.';
  if (detailEl) {
    const text = String(detail || '').trim();
    detailEl.textContent = text;
    detailEl.classList.toggle('hidden', !text);
  }
  panel.classList.remove('hidden');
}

function installFatalErrorHandlers() {
  window.addEventListener('error', (event) => {
    showFatalError(
      'Application error',
      event.message || 'An unexpected error occurred.',
      event.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : '',
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason || 'Unhandled promise rejection');
    const detail = reason?.stack || '';
    showFatalError('Application error', message, detail);
  });
}

window.productCanvasReportFatal = showFatalError;
installFatalErrorHandlers();

import('./app.js').catch((err) => {
  showFatalError(
    'Failed to load application',
    err?.message || String(err),
    err?.stack || '',
  );
});
