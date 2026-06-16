# WerbungMaker

Desktop-Anwendung für **TELE-KOHLGRAF** zur Erstellung von Produktwerbebildern aus Vorlagen und Referenz-Produktfotos mit KI-Bildgenerierung über [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge).

## Funktionen

- Werbebilder aus Vorlagen + Referenz-Produktbildern generieren
- Vorlagen klonen und per KI bearbeiten (Accept/Reject)
- Profile speichern/laden mit Autosave und Zuletzt-geöffnet-Liste
- Automatische Bridge- und Codex-CLI-Einrichtung (Windows)
- Deutsche Benutzeroberfläche mit integriertem Hilfe-Viewer

## Voraussetzungen (Entwicklung)

- Windows 10+
- Node.js 20+
- Optional für KI: Codex CLI + Codex Local Bridge **≥ 1.0.4** (Referenzbilder bei `/v1/images`)

## Installation & Start

```powershell
npm ci
npm start
```

## Tests

```powershell
npm test
```

## Windows-Build (EXE + ZIP)

```powershell
npm run dist:win
```

Ausgabe in `dist/`:

- `WerbungMaker-1.0.0-build.N-win-x64.exe` (Installer)
- `WerbungMaker-1.0.0-build.N-win-x64.zip` (portable)

## Release

```powershell
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions erstellt automatisch Release-Artefakte.

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| [docs/benutzerhandbuch.md](docs/benutzerhandbuch.md) | Benutzerhandbuch |
| [docs/einrichtung.md](docs/einrichtung.md) | Erste Schritte |
| [docs/produkt.md](docs/produkt.md) | Produktdokumentation |
| [docs/entwickler.md](docs/entwickler.md) | Entwickler-Doku |
| [AGENTS.md](AGENTS.md) | Hinweise für KI-Agenten |

## Lizenz

GPL-2.0-or-later
