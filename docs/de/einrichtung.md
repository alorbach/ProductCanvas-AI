# Erste Schritte

Dieses Kapitel führt Sie durch Installation, Codex-CLI-Anmeldung und Ihr erstes Bild mit ProductCanvas AI. Standard ist **Direct CLI** (`codex exec` auf Ihrem PC). Optional können Sie in **Datei → Einstellungen** auf die [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) wechseln.

## Systemvoraussetzungen

- **Windows 10 oder neuer** (64-Bit)
- Internetzugang für Codex-CLI-Einrichtung und KI-Anfragen
- **Codex CLI** mit aktivem Login (`codex login`)
- **[Codex Local Bridge ≥ 1.0.4](https://github.com/alorbach/codex-local-bridge)** — nur im Bridge-Backend (Referenzbilder unter `/v1/images`; [Releases](https://github.com/alorbach/codex-local-bridge/releases))

## Installation

### Installer (empfohlen)

1. Laden Sie die neueste `ProductCanvas-AI-*-win-x64.exe` von [GitHub Releases](https://github.com/alorbach/productcanvas-ai/releases) herunter.
2. Führen Sie den Installer aus.
3. Starten Sie **ProductCanvas AI** über das Startmenü.

### Portable ZIP

1. Portable ZIP von Releases herunterladen.
2. In einen Ordner Ihrer Wahl entpacken.
3. `ProductCanvas AI.exe` starten.

Für die normale Nutzung sind keine Administratorrechte nötig. Einstellungen liegen unter `%APPDATA%\productcanvas-ai\`.

## Erster Start (Direct CLI — Standard)

Beim Start prüft ProductCanvas AI, ob **Codex CLI** installiert und für Ihren Windows-Benutzer angemeldet ist.

Fehlt Codex CLI, bietet das Einrichtungs-Banner **Codex CLI installieren** nach Ihrer Bestätigung. ProductCanvas nutzt den [offiziellen OpenAI-Windows-Installer](https://developers.openai.com/codex/quickstart) (`install.ps1`), danach winget und npm als Fallback.

**ChatGPT-Abo erforderlich:** Codex ist in ChatGPT Plus, Pro, Business, Edu und Enterprise enthalten. Bildgenerierung läuft über Ihr ChatGPT-Kontingent — ProductCanvas verkauft kein separates KI-Abo.

1. Fehlt Codex CLI: **Codex CLI installieren** im Banner klicken und bestätigen.
2. **Codex anmelden** klicken oder in PowerShell:

```powershell
codex login
```

2. Prüfen, dass der Statuspunkt grün wird (**Codex CLI bereit**).

Im Direct-CLI-Modus sind keine Bridge-Tray-App und kein Pairing-Code nötig.

## Optional: Codex Local Bridge

Wechseln Sie in **Datei → Einstellungen** zu **Codex Local Bridge**, wenn Sie die Bridge mit WordPress Gateway nutzen.

Mit Bridge-Backend prüft ProductCanvas AI, ob die [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) unter der konfigurierten URL erreichbar ist (Standard: `http://127.0.0.1:8765`).

Ist die Bridge nicht bereit, erscheint ein **Einrichtungs-Banner**. Die App kann:

1. Die neueste [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge/releases) herunterladen (Ablage: `%LOCALAPPDATA%\productcanvas-ai\bridge\`)
2. Die Bridge starten (Tray-Symbol in der Taskleiste)
3. Nach einem **Pairing-Code** fragen

## Codex Local Bridge – Pairing

Pairing verbindet ProductCanvas AI sicher mit Ihrer lokalen Bridge-Instanz.

1. **Codex Local Bridge**-Tray-Menü öffnen (Infobereich der Taskleiste).
2. Den angezeigten **6-stelligen Pairing-Code** kopieren.
3. Code im Einrichtungs-Banner von ProductCanvas AI eingeben.
4. Auf **Verbinden** klicken.

Nach erfolgreichem Pairing wird der Status-Punkt grün und das Banner verschwindet. Pairing-Daten liegen in `%APPDATA%\productcanvas-ai\bridge-state.json` – pro Rechner in der Regel nur einmal nötig.

Wenn Pairing fehlschlägt:

- Prüfen, ob die Bridge im Tray läuft.
- Firewall: localhost-Ports **8765** (Bridge-HTTP) und **9473** (App-Origin beim Pairing) freigeben.
- Bridge im Tray neu starten und frischen Code eingeben.

## Codex CLI – Anmeldung

Die Bridge leitet KI-Anfragen an die **Codex CLI** weiter. Sie müssen angemeldet sein:

1. **Codex anmelden** im Einrichtungs-Banner klicken, **oder**
2. PowerShell / Eingabeaufforderung öffnen:

```powershell
codex login
```

3. Anmeldung im Browser abschließen.

Ist die Codex CLI nicht installiert, kann ProductCanvas AI während der Bridge-Einrichtung **winget** oder **npm** nutzen. Manuelle Installation ist ebenfalls möglich.

Bei gültigem Login zeigt der Bridge-Status **Bridge bereit** – Prompt- und Bildgenerierung sind verfügbar.

## Erste Vorlage importieren

Vorlagen werden **nicht mit der App mitgeliefert** – Sie importieren eigene Layout-Master (PNG, JPG oder WebP). Beim ersten Start kann die Liste leer sein, bis Sie importieren:

1. Tab **Bild erstellen** öffnen.
2. **Vorlage importieren**, Menü **Vorlagen → Importieren…** oder PNG/JPG/WebP auf die Vorlagenliste ziehen.
3. Importierte Vorlagen landen unter `%APPDATA%\productcanvas-ai\templates\`.

## Erstes Bild erstellen

1. Tab **Bild erstellen** öffnen.
2. **Vorlage** links wählen (zuletzt genutzte Vorlage ist vorausgewählt).
3. **Referenzbilder hinzufügen** – ein oder mehrere Produktfotos (Button oder Drag-and-Drop).
4. Optional **Bildauflösung**, **Qualität** und Projektfelder anpassen.
5. **Prompt generieren** – KI analysiert Referenzen und erstellt einen Bild-Prompt. Fortschritt im Warte-Dialog.
6. **Bild-Prompt** prüfen (Details-Bereich aufklappen).
7. **Bild generieren** – kann je nach Auflösung und Qualität mehrere Minuten dauern.
8. In der Vorschau **Als PNG speichern** und Zielordner wählen.

Damit haben Sie den Kern-Workflow abgeschlossen. Details: [Bild erstellen](bild-erstellen.md).

## Wichtige Tastenkürzel

| Kürzel | Aktion |
|--------|--------|
| Strg+, | Einstellungen |
| Strg+S | Profil speichern |
| Strg+O | Profil öffnen |
| Strg+N | Neues Profil |

## Weiterführend

- [Bild erstellen](bild-erstellen.md) – Auflösung, Qualität, KI-Werbezeilen-Vorschläge
- [Vorlagen bearbeiten](vorlagen-bearbeiten.md) – Layouts anpassen
- [Einstellungen](einstellungen.md) – Sprache und Bridge-URL
- [Fehlerbehebung](fehlerbehebung.md) – wenn etwas nicht funktioniert

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
