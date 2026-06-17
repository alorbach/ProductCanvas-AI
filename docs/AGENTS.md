# Agent-Hinweise (docs/)

Ergänzung zu [AGENTS.md](../AGENTS.md).

## Lokalisierung

- Benutzer-Dokumentation in **`docs/en/`** (Englisch) und **`docs/de/`** (Deutsch) pflegen.
- Beide Locales bei inhaltlichen Änderungen parallel aktualisieren – keine Einspur-Doku.
- Dateizuordnung siehe `DOC_ENTRIES` in `src/main/docs/doc-loader.js`.

## Hilfe-Viewer

- Markdown wird über `DocLoader` (`src/main/docs/doc-loader.js`) geladen.
- Locale: `en` oder `de` (aus UI-Präferenz / Systemsprache).
- Neues Kapitel: Eintrag in `DOC_ENTRIES` + Markdown in **beiden** Ordnern `docs/en/` und `docs/de/`.

## Stil

- Produktname: **ProductCanvas AI**
- Markenneutral – keine kundenspezifischen Markennamen in der Doku.
- Copyright: Andre Lorbach, [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).

## Legacy

Ältere Markdown-Dateien direkt unter `docs/` (z. B. `benutzerhandbuch.md`) sind veraltet; maßgeblich sind `docs/en/` und `docs/de/`.
