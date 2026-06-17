# AGENTS.md – ProductCanvas AI

Guide for AI agents (Cursor, Codex) working on this repository.

## Project purpose

**ProductCanvas AI** is a universal, brand-neutral Electron desktop app. It creates AI-generated product images from layout templates and reference photos via Codex Local Bridge (`http://127.0.0.1:8765`). Users define brand, series, and tagline per project — no fixed corporate identity in the product.

## Mandatory rules

1. **UI strings in both locales** — add keys to `src/renderer/i18n/en.json` and `de.json`; use `t('key')` in the renderer. English is the default fallback locale.
2. **Bridge calls only in main process** — renderer uses `preload.js` / IPC (`window.productCanvas`).
3. **Job envelope** for bridge execution: `job_token`, `request_hash`, `request_id` + `payload` (see `src/main/bridge/bridge-client.js`).
4. **Do not overwrite system templates** — user template changes only under `%APPDATA%\productcanvas-ai\templates\`.
5. **No secrets in commits**.
6. **No vendor-specific branding** — do not hardcode retailer or brand names in code, prompts, or docs. Use user project fields (`brandName`, etc.).
7. **PRs must pass** `.github/workflows/test.yml`. **Releases** only via `v*` tags → `release.yml`.

## Folder structure

```
src/main/     Electron main (bridge, profiles, generation)
src/preload/  contextBridge API (productCanvas)
src/renderer/ UI (HTML/CSS/ES modules)
assets/templates/  System templates + templates.json
assets/examples/   Example reference image
docs/en/ docs/de/   User documentation (bilingual)
```

## IPC channels (selection)

| Channel | Purpose |
|---------|---------|
| `app:getPreferences` / `app:setPreferences` | Locale, bridge URL |
| `app:openSettings` | Settings window |
| `bridge:ensureReady` | Bridge start/pairing |
| `generate:buildPrompt` | Prompt from reference images |
| `generate:image` | Image generation |
| `templates:*` | Template editor |
| `docs:list` / `docs:load` | Help viewer (locale-aware) |
| `profile:*` / `session:*` | Persistence |

## Build

```powershell
npm ci
npm test
npm run dist:win
```

Release per Git tag `v*` → `.github/workflows/release.yml`.

## Further docs

- [docs/en/developer.md](docs/en/developer.md) — architecture & development
- [docs/en/product.md](docs/en/product.md) — product context
- [docs/AGENTS.md](docs/AGENTS.md) — help chapter maintenance
