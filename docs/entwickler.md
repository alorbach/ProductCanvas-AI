# Entwickler-Dokumentation

Siehe auch [AGENTS.md](../AGENTS.md) im Repository-Root.

## Architektur

- **Electron** Main + Renderer
- **Main Process:** Bridge-Client, Profile, PromptBuilder, ImagePipeline, TemplateEditor
- **Renderer:** Deutsche UI (`i18n/de.json`), ES-Module

## Lokale Entwicklung

```powershell
npm ci
npm start
```

## Tests

```powershell
npm test
```

## Windows-Build

```powershell
npm run dist:win
```

Skript: `scripts/build-win.js` (Build-Nummer, `src/build-info.json`, electron-builder).

## Release (CI)

Tag `v*` pushen → `.github/workflows/release.yml` baut EXE + ZIP.

## Bridge-Integration

- Origin: `http://127.0.0.1:9473`
- Pairing-Token in `%APPDATA%\WerbungMaker\bridge-state.json`
- Job-Envelope wie in codex-local-bridge HTTP-Example

## Neue UI-Texte

Nur in `src/renderer/i18n/de.json` – Key mit `t('key')` im Renderer verwenden.
