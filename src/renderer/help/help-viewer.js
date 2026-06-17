'use strict';

import { getLocale } from '../i18n/i18n.js';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseMarkdown(md) {
  let html = escapeHtml(md);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/\n\n/g, '</p><p>');
  return `<div class="md-body"><p>${html}</p></div>`;
}

export async function renderHelp(sidebarEl, contentEl) {
  const locale = getLocale();
  const docs = await window.productCanvas.docsList(locale);
  sidebarEl.innerHTML = '';
  for (const doc of docs) {
    const btn = document.createElement('button');
    btn.textContent = doc.title;
    btn.dataset.id = doc.id;
    btn.addEventListener('click', () => openHelpDoc(doc.id, contentEl, sidebarEl, locale));
    sidebarEl.appendChild(btn);
  }
  if (docs.length) {
    await openHelpDoc(docs[0].id, contentEl, sidebarEl, locale);
  }
}

export async function openHelpDoc(id, contentEl, sidebarEl, locale = getLocale()) {
  const doc = await window.productCanvas.docsLoad(id, locale);
  contentEl.innerHTML = parseMarkdown(doc.content || '');
  contentEl.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (a.href.startsWith('http')) {
        e.preventDefault();
        window.productCanvas.openExternal(a.href);
      }
    });
  });
  if (sidebarEl) {
    sidebarEl.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.id === id);
    });
  }
}
