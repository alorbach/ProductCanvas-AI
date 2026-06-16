# AGENTS.md – WerbungMaker

Leitfaden für KI-Agenten (Cursor, Codex) bei der Arbeit an diesem Repository.

## Projektzweck

**WerbungMaker** ist eine Electron-Desktop-App für TELE-KOHLGRAF. Sie erzeugt markenkonforme Werbebilder aus Layout-Vorlagen und Referenz-Produktfotos via Codex Local Bridge (`http://127.0.0.1:8765`).

## Pflichtregeln

1. **UI immer auf Deutsch** – neue sichtbare Texte nur in `src/renderer/i18n/de.json` als Keys hinzufügen, nie hardcoded Englisch in der Renderer-UI.
2. **Bridge-Calls nur im Main Process** – Renderer nutzt `preload.js` / IPC.
3. **Job-Envelope** für Bridge-Ausführung: `job_token`, `request_hash`, `request_id` + `payload` (siehe `src/main/bridge/bridge-client.js`).
4. **System-Vorlagen nicht überschreiben** – KI-Änderungen nur in Benutzer-Vorlagen unter `%APPDATA%\WerbungMaker\templates\`.
5. **Keine Secrets committen**.

## Ordnerstruktur

```
src/main/          Electron Main Process (Bridge, Profile, Generierung)
src/preload/       contextBridge API
src/renderer/      UI (HTML/CSS/ES-Module)
assets/templates/  System-Vorlagen + templates.json
assets/examples/   Beispiel-Martin-Logan.png
docs/              Deutsche Doku (auch in App-Hilfe)
```

## IPC-Kanäle (Auswahl)

| Kanal | Zweck |
|-------|-------|
| `bridge:ensureReady` | Bridge starten/pairing |
| `generate:buildPrompt` | Prompt aus Referenzbildern |
| `generate:image` | Bildgenerierung |
| `templates:*` | Vorlagen-Editor |
| `docs:list` / `docs:load` | Hilfe-Viewer |
| `profile:*` / `session:*` | Persistenz |

## Build

```powershell
npm ci
npm test
npm run dist:win
```

Release per Git-Tag `v*` → `.github/workflows/release.yml`.

## Weitere Doku

- [docs/entwickler.md](docs/entwickler.md) – Architektur & Entwicklung
- [docs/produkt.md](docs/produkt.md) – Produktkontext
