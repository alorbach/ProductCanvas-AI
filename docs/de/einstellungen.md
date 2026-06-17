# Einstellungen

ProductCanvas AI unterscheidet **Anwendungseinstellungen** (Sprache, Bridge-URL) von **Projekteinstellungen** (Auflösung, Markenfelder im Tab Bild erstellen). Dieses Kapitel behandelt beides sowie Profile und Speicherorte.

## Einstellungsfenster öffnen

- Menü **Datei → Einstellungen**
- Tastenkürzel **Strg+,**

Das Einstellungsfenster ist vom Haupt-Projektpanel getrennt. Änderungen gelten global und werden in `%APPDATA%\productcanvas-ai\defaults.json` gespeichert (zusammen mit eingebauten Standardwerten).

## Sprache

| Option | Verhalten |
|--------|-----------|
| **Automatisch (System)** | Windows-Anzeigesprache – Deutsch (`de`) oder Englisch (`en`); andere Locales → Englisch |
| **Englisch** | Englische UI und Hilfe |
| **Deutsch** | Deutsche UI und Hilfe |

Bei **Automatisch** zeigt das Fenster **Systemsprache: …** zur Kontrolle.

UI-Texte kommen aus den i18n-Dateien; Hilfe aus `docs/de/` oder `docs/en/` je nach aufgelöster Locale.

**Speichern** klicken – die Hauptansicht aktualisiert Labels ohne Neustart.

## Bridge-URL

Standard: `http://127.0.0.1:8765` ([Codex Local Bridge](https://github.com/alorbach/codex-local-bridge))

Nur ändern, wenn:

- die [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) auf anderem Host/Port lauscht
- mehrere Bridge-Instanzen laufen und eine bestimmte angesprochen werden soll

Nach dem Speichern aktualisiert ProductCanvas AI:

- `%APPDATA%\productcanvas-ai\defaults.json`
- `%APPDATA%\productcanvas-ai\bridge-state.json` und den aktiven Bridge-Client
- das `bridgeUrl`-Feld der offenen Sitzung (falls geladen)

Nur **`http://`** und **`https://`** sind erlaubt. Ungültige Werte fallen auf `http://127.0.0.1:8765` zurück. Kein abschließender Schrägstrich.

## Projekteinstellungen (Tab Bild erstellen)

Diese Werte gehören zur **Sitzung** bzw. zum **Profil**, nicht zum Einstellungsfenster:

| Einstellung | In Sitzung/Profil |
|-------------|-------------------|
| Vorlagenauswahl | Ja |
| Referenzbilder | Ja (Pfade; beim Profil-Speichern kopiert) |
| Bildauflösung / Qualität | Ja |
| Kategorie, Marke, Serie, Tagline | Ja |
| Zusatz-Prompt, Bild-Prompt, Analysefelder | Ja |

Autosave nach `%APPDATA%\productcanvas-ai\session.json` während der Arbeit.

## Profile (`.pcprofile.json`)

Profile speichern ein vollständiges Projekt zur Wiederverwendung oder Weitergabe.

### Speichern und öffnen

| Aktion | Kürzel | Beschreibung |
|--------|--------|--------------|
| Neu | Strg+N | Leere Sitzung mit Standardwerten |
| Öffnen | Strg+O | `.pcprofile.json` oder legacy `.wmprofile.json` |
| Speichern | Strg+S | Aktuelle Profildatei überschreiben |
| Speichern unter | Strg+Umschalt+S | Neuer Pfad und Name |

**Datei → Zuletzt geöffnet** – bis zu **10** Einträge.

### Dateiformat

```json
{
  "name": "Sommerkampagne",
  "version": 1,
  "savedAt": "2026-06-17T12:00:00.000Z",
  "settings": {
    "templateId": "...",
    "size": "template",
    "quality": "high",
    "brandName": "...",
    "seriesName": "...",
    "tagline": "...",
    "referenceImages": [{ "path": "...", "name": "..." }],
    "imagePrompt": "...",
    "...": "..."
  }
}
```

Beim Speichern als `Kampagne.pcprofile.json` werden Referenzbilder in den Ordner `Kampagne/` neben die JSON-Datei kopiert – portabel für andere PCs und Backups.

### Profilinhalt

- Vorlagen-ID und Modus
- Referenzbild-Pfade (beim Speichern angepasst)
- Optionales Vorlagen-Editor-Referenzbild (`editorReferenceImagePath`)
- Prompts, Fingerprints, Analysetexte
- Projekt-Metadaten und Bildoptionen
- Letzter Vorschau-Pfad (wenn gültig)

Globale Sprache und Bridge-URL gehören ins Einstellungsfenster, nicht zwingend ins Profil.

## Speicherorte

| Daten | Pfad |
|-------|------|
| Sitzung (Autosave) | `%APPDATA%\productcanvas-ai\session.json` |
| Standardwerte / Präferenzen | `%APPDATA%\productcanvas-ai\defaults.json` |
| Bridge-Pairing | `%APPDATA%\productcanvas-ai\bridge-state.json` |
| Zuletzt geöffnet | `%APPDATA%\productcanvas-ai\recent.json` |
| Eigene Vorlagen | `%APPDATA%\productcanvas-ai\templates\` |
| Vorlagen-Historie | `%APPDATA%\productcanvas-ai\templates\history\` |
| Temp-Vorschauen | `%APPDATA%\productcanvas-ai\temp-previews\` |
| Bridge-Installer | `%LOCALAPPDATA%\productcanvas-ai\bridge\` |

Nach Upgrade von älteren App-Namen kann eine Migration in `productcanvas-ai` erfolgen, wenn der neue Ordner leer war.

## Debug-Log

Im Footer protokolliert **Debug-Log** Bridge-Aufrufe, Anhang-Modi und Fehler. **Kopieren** für Support-Anfragen. Siehe [Fehlerbehebung](fehlerbehebung.md).

## Verwandte Themen

- [Erste Schritte](einrichtung.md) – [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)-Pairing
- [Bild erstellen](bild-erstellen.md)
- [Entwickler](entwickler.md)

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
