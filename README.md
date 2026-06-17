# ProductCanvas AI

Universal desktop app for creating AI-generated product images from **layout templates** and **reference photos** via [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge).

## Features

- Generate images from templates + reference product photos
- Clone and AI-edit templates (accept/reject workflow)
- Save/load profiles with autosave and recent files
- Automatic Bridge and Codex CLI setup (Windows)
- English UI by default, German supported — system locale or user override in Settings
- Integrated help viewer with bilingual documentation

## Requirements (development)

- Windows 10+
- Node.js 20+
- Optional for AI: Codex CLI + Codex Local Bridge **≥ 1.0.4** (reference images on `/v1/images`)

## Install & run

```powershell
npm ci
npm start
```

## Tests

```powershell
npm test
```

CI runs on every push to `main` and on pull requests (`.github/workflows/test.yml`).

## Windows build (EXE + ZIP)

```powershell
npm run dist:win
```

Output in `dist/`:

- `ProductCanvas-AI-1.0.0-build.N-win-x64.exe` (installer)
- `ProductCanvas-AI-1.0.0-build.N-win-x64.zip` (portable)

## Release

```powershell
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions creates release artifacts automatically (`.github/workflows/release.yml`).

## Documentation

| English | Deutsch |
|---------|---------|
| [docs/en/user-guide.md](docs/en/user-guide.md) | [docs/de/benutzerhandbuch.md](docs/de/benutzerhandbuch.md) |
| [docs/en/getting-started.md](docs/en/getting-started.md) | [docs/de/einrichtung.md](docs/de/einrichtung.md) |
| [docs/en/create-image.md](docs/en/create-image.md) | [docs/de/bild-erstellen.md](docs/de/bild-erstellen.md) |
| [docs/en/edit-templates.md](docs/en/edit-templates.md) | [docs/de/vorlagen-bearbeiten.md](docs/de/vorlagen-bearbeiten.md) |
| [docs/en/settings.md](docs/en/settings.md) | [docs/de/einstellungen.md](docs/de/einstellungen.md) |
| [docs/en/troubleshooting.md](docs/en/troubleshooting.md) | [docs/de/fehlerbehebung.md](docs/de/fehlerbehebung.md) |
| [docs/en/product.md](docs/en/product.md) | [docs/de/produkt.md](docs/de/produkt.md) |
| [docs/en/developer.md](docs/en/developer.md) | [docs/de/entwickler.md](docs/de/entwickler.md) |

Agent notes: [AGENTS.md](AGENTS.md)

---

## Deutsch

**ProductCanvas AI** ist ein markenneutrales KI-Bildstudio: Layout-Vorlagen + Referenzfotos → fertiges Bild über Codex Local Bridge. Marke, Serie und Tagline legen Sie pro Projekt fest.

Installation, Tests und Release wie oben. Hilfe in der App oder unter `docs/de/`.

## License & copyright

GPL-2.0-or-later — see [LICENSE](LICENSE).

Copyright © [Andre Lorbach](https://github.com/alorbach)
