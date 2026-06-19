'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

const DOC_ENTRIES = [
  {
    id: 'user-guide',
    file: { en: 'en/user-guide.md', de: 'de/benutzerhandbuch.md' },
    title: { en: 'User Guide', de: 'Benutzerhandbuch' },
  },
  {
    id: 'getting-started',
    file: { en: 'en/getting-started.md', de: 'de/einrichtung.md' },
    title: { en: 'Getting Started', de: 'Erste Schritte' },
  },
  {
    id: 'create-image',
    file: { en: 'en/create-image.md', de: 'de/bild-erstellen.md' },
    title: { en: 'Create Image', de: 'Bild erstellen' },
  },
  {
    id: 'edit-templates',
    file: { en: 'en/edit-templates.md', de: 'de/vorlagen-bearbeiten.md' },
    title: { en: 'Edit Templates', de: 'Vorlagen bearbeiten' },
  },
  {
    id: 'edit-effects',
    file: { en: 'en/edit-effects.md', de: 'de/effektbilder-bearbeiten.md' },
    title: { en: 'Edit Effects', de: 'Effektbilder bearbeiten' },
  },
  {
    id: 'settings',
    file: { en: 'en/settings.md', de: 'de/einstellungen.md' },
    title: { en: 'Settings', de: 'Einstellungen' },
  },
  {
    id: 'troubleshooting',
    file: { en: 'en/troubleshooting.md', de: 'de/fehlerbehebung.md' },
    title: { en: 'Troubleshooting', de: 'Fehlerbehebung' },
  },
  {
    id: 'product',
    file: { en: 'en/product.md', de: 'de/produkt.md' },
    title: { en: 'Product', de: 'Produkt' },
  },
  {
    id: 'developer',
    file: { en: 'en/developer.md', de: 'de/entwickler.md' },
    title: { en: 'Developer', de: 'Entwickler' },
  },
];

function normalizeLocale(locale) {
  const lang = String(locale || 'en').split('-')[0].toLowerCase();
  return lang === 'de' ? 'de' : 'en';
}

class DocLoader {
  list(locale = 'en') {
    const loc = normalizeLocale(locale);
    return DOC_ENTRIES.map((e) => ({
      id: e.id,
      title: e.title[loc] || e.title.en,
      file: e.file[loc] || e.file.en,
      exists: fs.existsSync(path.join(paths.docsDir(), e.file[loc] || e.file.en)),
    }));
  }

  load(id, locale = 'en') {
    const loc = normalizeLocale(locale);
    const entry = DOC_ENTRIES.find((e) => e.id === id);
    if (!entry) {
      const msg = loc === 'de' ? 'Dokument nicht gefunden.' : 'Document not found.';
      throw new Error(msg);
    }
    const title = entry.title[loc] || entry.title.en;
    const relFile = entry.file[loc] || entry.file.en;
    const filePath = path.join(paths.docsDir(), relFile);
    if (!fs.existsSync(filePath)) {
      const placeholder = loc === 'de'
        ? `# ${title}\n\nDokument wird noch erstellt.`
        : `# ${title}\n\nThis document is not available yet.`;
      return { id, title, content: placeholder };
    }
    return {
      id,
      title,
      content: fs.readFileSync(filePath, 'utf8'),
    };
  }
}

module.exports = { DocLoader, DOC_ENTRIES };
