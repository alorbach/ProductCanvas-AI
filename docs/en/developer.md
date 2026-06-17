# Developer Documentation

This guide covers local development, testing, continuous integration, and release workflow for **ProductCanvas AI**.

Repository: [github.com/alorbach/productcanvas-ai](https://github.com/alorbach/productcanvas-ai)

See also the root [AGENTS.md](../../AGENTS.md) for agent and contribution conventions.

## Architecture summary

```
src/main/          Electron main process (bridge, profiles, generation, templates)
src/preload/       contextBridge IPC surface
src/renderer/      UI (HTML/CSS/ES modules, i18n en.json + de.json)
assets/examples/   Example reference imagery
docs/en/ docs/de/  User-facing help (loaded by DocLoader)
test/              Node.js unit/integration tests (no Electron GUI)
scripts/           Icons, Windows build, placeholders
```

### Main modules

| Module | Responsibility |
|--------|----------------|
| `bridge/bridge-client.js` | HTTP to [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge), job envelope, pairing state |
| `bridge/bridge-manager.js` | Bridge lifecycle, ensure-ready, status |
| `bridge/codex-manager.js` | Codex CLI install/login helpers |
| `generate/prompt-builder.js` | Reference analysis, werbung prompt |
| `generate/image-pipeline.js` | Preflight + `/v1/images` generation |
| `generate/template-edit-pipeline.js` | Template AI edits |
| `templates/template-registry.js` | User template index (`user-templates.json` + PNG files) |
| `profiles/profile-store.js` | Session, `.pcprofile.json`, recent list |
| `docs/doc-loader.js` | Locale-aware help file loading |

### IPC conventions

Bridge calls run **only in the main process**. The renderer uses `preload.js` APIs. Long jobs use progress events (`job:progress`, `bridge:progress`).

Job requests to the bridge include `job_token`, `request_hash`, and `request_id` per bridge HTTP examples.

## Prerequisites

- **Windows 10+** (primary target; dev on Windows recommended)
- **Node.js 20+**
- **npm** (lockfile in repo)
- Optional for live AI: Codex CLI + [Codex Local Bridge ≥ 1.0.4](https://github.com/alorbach/codex-local-bridge)

## Local setup

```powershell
git clone https://github.com/alorbach/productcanvas-ai.git
cd productcanvas-ai
npm ci
npm start
```

`npm start` launches Electron in development mode. User data defaults to `%APPDATA%\productcanvas-ai\` (or the Electron dev userData path).

### Environment notes

- User templates load from `%APPDATA%\productcanvas-ai\templates\` via `template-registry.js`—never commit user data.
- `assets/templates/` in the repo is a legacy path constant only; templates are user-imported at runtime.

## Tests

```powershell
npm test
```

The test script runs Node tests sequentially:

| Test file | Focus |
|-----------|--------|
| `test/basic.test.js` | Core utilities, paths |
| `test/locale.test.js` | i18n / locale resolution |
| `test/brand-free.test.js` | Brand-neutral strings |
| `test/image-settings.test.js` | Resolution/quality resolution |
| `test/prompt-fidelity.test.js` | Prompt builder rules |
| `test/image-preflight.test.js` | Preflight fingerprint/prompt |
| `test/layout-fidelity.test.js` | Layout constraint text |
| `test/template-edit-pipeline.test.js` | Template edit flow |
| `test/safe-paths.test.js` | Path allowlists, bridge URL normalization |
| `test/profile-store.test.js` | Profile reference copy |
| `test/i18n-interpolation.test.js` | Renderer i18n placeholders |

Tests do not require a running bridge unless explicitly noted in a test case. Run `npm test` before every pull request.

## Continuous integration

### Pull requests – `test.yml`

Workflow file: `.github/workflows/test.yml`

Triggered on **pull requests** to the default branch:

1. Checkout
2. Setup Node 20 with npm cache
3. `npm ci`
4. `npm test`

All tests must pass before merge.

### Releases – `release.yml`

Workflow file: `.github/workflows/release.yml`

Triggered on push of tags matching **`v*`** (e.g. `v1.0.1`):

1. Checkout on `windows-latest` (full git history for release context)
2. Derive version from tag name
3. `npm ci`
4. Set package version from tag
5. `npm run icons`
6. **`npm test`**
7. Collect commit context and GitHub auto-changelog
8. **AI release notes** via [GitHub Models](https://github.com/marketplace/models) REST API (`scripts/generate-ai-release-notes.js`, `models: read`) — bilingual EN/DE description and user-facing bullets; falls back to GitHub notes if inference fails
9. **`npm run dist:win`** – produces NSIS installer + portable ZIP in `dist/`
10. Create GitHub Release with assembled notes and attach artifacts

Prompt reference: `.github/prompts/release-notes.prompt.yml`. Generator: `scripts/generate-ai-release-notes.js`. Assembly: `scripts/assemble-release-notes.js`.

Artifact names follow electron-builder config, e.g. `ProductCanvas-AI-<version>-win-x64.exe`.

### Creating a release locally

```powershell
npm run icons
npm test
npm run dist:win
```

Build script: `scripts/build-win.js` (build number, `src/build-info.json`, electron-builder invoke).

Tag and push to publish via CI:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

## Bridge integration (development)

Partner project: [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) ([releases](https://github.com/alorbach/codex-local-bridge/releases))

| Constant | Value |
|----------|-------|
| Default bridge URL | `http://127.0.0.1:8765` |
| App origin | `http://127.0.0.1:9473` |
| Pairing state file | `%APPDATA%\productcanvas-ai\bridge-state.json` |
| Default job timeout | 30 minutes |

When debugging attachment issues, enable the in-app **Debug log** and inspect `attachmentMode` and `refsForwardedToCodex` after generation.

## Documentation

Help markdown lives in **`docs/en/`** and **`docs/de/`**. Register new chapters in `DOC_ENTRIES` inside `src/main/docs/doc-loader.js`.

Maintain **both locales** when changing user-facing help. See [docs/AGENTS.md](../AGENTS.md).

## UI strings

Add or change visible UI text in:

- `src/renderer/i18n/en.json`
- `src/renderer/i18n/de.json`

Use `t('key')` in renderer code—no hardcoded user-visible strings in HTML/JS.

Main-process menu strings: `src/main/i18n/en.json` and `de.json`.

## Security notes

- Never commit secrets, tokens, or personal `bridge-state.json`.
- Renderer has context isolation; no Node integration in the UI.
- CSP restricts script and image sources in `index.html`.

## License

ProductCanvas AI is licensed under **GPL-2.0-or-later**.

Copyright © [Andre Lorbach](https://github.com/alorbach).

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Licensed under [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
