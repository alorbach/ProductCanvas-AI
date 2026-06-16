'use strict';

const fs = require('fs');
const path = require('path');
const paths = require('../paths');

const DOC_ENTRIES = [
  { id: 'benutzerhandbuch', title: 'Benutzerhandbuch', file: 'benutzerhandbuch.md' },
  { id: 'einrichtung', title: 'Erste Schritte', file: 'einrichtung.md' },
  { id: 'werbung-erstellen', title: 'Werbung erstellen', file: 'werbung-erstellen.md' },
  { id: 'vorlagen-bearbeiten', title: 'Vorlagen bearbeiten', file: 'vorlagen-bearbeiten.md' },
  { id: 'produkt', title: 'Produktdokumentation', file: 'produkt.md' },
  { id: 'entwickler', title: 'Entwickler', file: 'entwickler.md' },
];

class DocLoader {
  list() {
    return DOC_ENTRIES.map((e) => ({
      id: e.id,
      title: e.title,
      file: e.file,
      exists: fs.existsSync(path.join(paths.docsDir(), e.file)),
    }));
  }

  load(id) {
    const entry = DOC_ENTRIES.find((e) => e.id === id);
    if (!entry) throw new Error('Dokument nicht gefunden.');
    const filePath = path.join(paths.docsDir(), entry.file);
    if (!fs.existsSync(filePath)) {
      return { id, title: entry.title, content: `# ${entry.title}\n\nDokument wird noch erstellt.` };
    }
    return {
      id,
      title: entry.title,
      content: fs.readFileSync(filePath, 'utf8'),
    };
  }
}

module.exports = { DocLoader };
