# WerbungMaker – Produktdokumentation

## Vision

WerbungMaker ermöglicht Mitarbeitern von TELE-KOHLGRAF die schnelle Erstellung professioneller Produktwerbungen im einheitlichen Markenlayout – ohne aufwendige Bildbearbeitungssoftware.

## Zielgruppe

- Verkauf und Marketing bei TELE-KOHLGRAF
- Windows-Arbeitsplätze mit Codex-Zugang

## Kernfunktionen

### Werbung erstellen

1. Vorlage wählen (gelb/blau oder eigene)
2. Referenz-Produktbilder hinzufügen
3. Prompt automatisch erstellen lassen
4. Werbebild per KI generieren
5. Vorschau prüfen und als PNG exportieren

### Vorlagen bearbeiten

1. Vorlage klonen oder eigene importieren
2. Änderungswunsch in natürlicher Sprache eingeben
3. Prompt optimieren lassen
4. KI-Vorschau mit Accept/Reject

## Abhängigkeiten

| Komponente | Rolle |
|------------|-------|
| Codex Local Bridge | Lokale HTTP-Bridge zu Codex CLI |
| Codex CLI | KI-Bild- und Textgenerierung |
| WerbungMaker | UI, Vorlagen, Profile, Workflow |

## Datenspeicherorte

- **Einstellungen/Session:** `%APPDATA%\WerbungMaker\session.json`
- **Profile:** `%APPDATA%\WerbungMaker\profiles\`
- **Eigene Vorlagen:** `%APPDATA%\WerbungMaker\templates\`
- **Bridge-Installer:** `%LOCALAPPDATA%\WerbungMaker\bridge\`

## Standardwerte

- Auflösung: 1536×1024
- Qualität: hoch
- Letzte Vorlage wird beim Start vorausgewählt
