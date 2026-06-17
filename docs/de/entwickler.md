# Entwickler-Dokumentation

Lokale Entwicklung, Tests, Continuous Integration und Release-Workflow für **ProductCanvas AI**.

Repository: [github.com/alorbach/productcanvas-ai](https://github.com/alorbach/productcanvas-ai)

Siehe auch [AGENTS.md](../../AGENTS.md) im Repository-Root.

## Architektur-Kurzüberblick

```
src/main/          Electron Main Process (Bridge, Profile, Generierung, Vorlagen)
src/preload/       contextBridge IPC
src/renderer/      UI (HTML/CSS/ES-Module, i18n en.json + de.json)
assets/examples/   Beispiel-Referenzbilder
docs/en/ docs/de/  Benutzer-Hilfe (DocLoader)
test/              Node.js-Tests (ohne Electron-GUI)
scripts/           Icons, Windows-Build, Platzhalter
```

### Hauptmodule

| Modul | Aufgabe |
|-------|---------|
| `bridge/bridge-client.js` | HTTP zur [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge), Job-Envelope, Pairing |
| `bridge/bridge-manager.js` | Bridge-Lebenszyklus, ensure-ready, Status |
| `bridge/codex-manager.js` | Codex-CLI-Installation/Login |
| `generate/prompt-builder.js` | Referenzanalyse, Werbe-Prompt |
| `generate/image-pipeline.js` | Preflight + `/v1/images` |
| `generate/template-edit-pipeline.js` | KI-Vorlagenbearbeitung |
| `templates/template-registry.js` | Benutzer-Vorlagen-Index (`user-templates.json` + PNG-Dateien) |
| `profiles/profile-store.js` | Sitzung, `.pcprofile.json`, Zuletzt geöffnet |
| `docs/doc-loader.js` | Locale-aware Hilfe-Dateien |

### IPC-Konventionen

Bridge-Aufrufe **nur im Main Process**. Renderer nutzt `preload.js`. Lange Jobs senden Fortschritt (`job:progress`, `bridge:progress`).

Bridge-Requests enthalten `job_token`, `request_hash` und `request_id` gemäß Bridge-HTTP-Beispielen.

## Voraussetzungen

- **Windows 10+** (Hauptzielplattform)
- **Node.js 20+**
- **npm** (Lockfile im Repo)
- Optional für Live-KI: Codex CLI + [Codex Local Bridge ≥ 1.0.4](https://github.com/alorbach/codex-local-bridge)

## Lokales Setup

```powershell
git clone https://github.com/alorbach/productcanvas-ai.git
cd productcanvas-ai
npm ci
npm start
```

`npm start` startet Electron im Entwicklungsmodus. Benutzerdaten: `%APPDATA%\productcanvas-ai\`.

### Hinweise

- Benutzer-Vorlagen aus `%APPDATA%\productcanvas-ai\templates\` über `template-registry.js` – nicht committen.
- `assets/templates/` im Repo ist nur ein Legacy-Pfad; Vorlagen werden zur Laufzeit importiert.

## Tests

```powershell
npm test
```

Sequentielle Node-Tests:

| Testdatei | Fokus |
|-----------|-------|
| `test/basic.test.js` | Kern-Utilities, Pfade |
| `test/locale.test.js` | i18n / Locale-Auflösung |
| `test/brand-free.test.js` | Markenneutrale Strings |
| `test/image-settings.test.js` | Auflösung/Qualität |
| `test/prompt-fidelity.test.js` | Prompt-Builder-Regeln |
| `test/image-preflight.test.js` | Preflight-Fingerprint/Prompt |
| `test/layout-fidelity.test.js` | Layout-Constraints |
| `test/template-edit-pipeline.test.js` | Vorlagen-Edit-Flow |

Vor jedem Pull Request `npm test` ausführen.

## Continuous Integration

### Pull Requests – `test.yml`

Workflow: `.github/workflows/test.yml`

Auslöser: **Pull Requests** gegen den Default-Branch:

1. Checkout
2. Node 20 mit npm-Cache
3. `npm ci`
4. `npm test`

Alle Tests müssen grün sein vor dem Merge.

### Releases – `release.yml`

Workflow: `.github/workflows/release.yml`

Auslöser: Push von Tags **`v*`** (z. B. `v1.0.1`):

1. Checkout auf `windows-latest` (volle Git-Historie für Release-Kontext)
2. Version aus Tag-Name
3. `npm ci`
4. Package-Version setzen
5. `npm run icons`
6. **`npm test`**
7. Commit-Kontext und GitHub-Auto-Changelog sammeln
8. **KI-Release-Notes** über [GitHub Models](https://github.com/marketplace/models) (`actions/ai-inference`, `models: read`) — zweisprachige EN/DE-Beschreibung und Nutzer-Bullets; Fallback auf GitHub-Notes bei Inference-Fehler
9. **`npm run dist:win`** – NSIS-Installer + portable ZIP in `dist/`
10. GitHub Release mit zusammengesetzten Notes und Artefakten

Prompt-Vorlage: `.github/prompts/release-notes.prompt.yml`. Zusammenbau: `scripts/assemble-release-notes.js`.

Artefaktnamen z. B. `ProductCanvas-AI-<version>-win-x64.exe`.

### Release lokal

```powershell
npm run icons
npm test
npm run dist:win
```

Build-Skript: `scripts/build-win.js` (Build-Nummer, `src/build-info.json`, electron-builder).

Taggen und pushen für CI-Release:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

## Bridge-Integration (Entwicklung)

Partner-Projekt: [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) ([Releases](https://github.com/alorbach/codex-local-bridge/releases))

| Konstante | Wert |
|-----------|------|
| Standard Bridge-URL | `http://127.0.0.1:8765` |
| App-Origin | `http://127.0.0.1:9473` |
| Pairing-State | `%APPDATA%\productcanvas-ai\bridge-state.json` |
| Standard Job-Timeout | 30 Minuten |

Bei Anhang-Problemen **Debug-Log** in der App: `attachmentMode`, `refsForwardedToCodex`.

## Dokumentation

Hilfe-Markdown in **`docs/en/`** und **`docs/de/`**. Neue Kapitel in `DOC_ENTRIES` in `src/main/docs/doc-loader.js` eintragen.

Bei user-facing Hilfe-Änderungen **beide Locales** pflegen. Siehe [docs/AGENTS.md](../AGENTS.md).

## UI-Texte

Sichtbare Texte in:

- `src/renderer/i18n/en.json`
- `src/renderer/i18n/de.json`

Im Renderer `t('key')` – keine hardcodierten UI-Strings.

Main-Process-Menü: `src/main/i18n/en.json` und `de.json`.

## Sicherheit

- Keine Secrets, Tokens oder persönliche `bridge-state.json` committen.
- Renderer mit Context Isolation; kein Node im UI.
- CSP in `index.html`.

## Lizenz

ProductCanvas AI: **GPL-2.0-or-later**.

Copyright © [Andre Lorbach](https://github.com/alorbach).

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
