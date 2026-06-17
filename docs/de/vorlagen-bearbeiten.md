# Vorlagen bearbeiten

Im Tab **Vorlagen bearbeiten** passen Sie Layout-Vorlagen per natürlicher Sprache und KI-Vorschau an. Änderungen werden erst nach Ihrer Bestätigung gespeichert.

## Vorlagen-Typen

| Typ | Speicherort | Bearbeitbar? |
|-----|-------------|--------------|
| **System-Vorlagen** | Im App-Bundle | Schreibgeschützt – per **Klonen** kopieren |
| **Eigene Vorlagen** | `%APPDATA%\productcanvas-ai\templates\` | Bearbeiten, umbenennen, löschen |

System-Vorlagen werden nie direkt geändert. Beim Akzeptieren einer KI-Änderung auf einer System-Vorlage entsteht automatisch eine **neue eigene Vorlage**.

## Editor-Überblick

- **Original** – gespeicherte Vorlage
- **KI-Vorschau** – Ergebnis der letzten Generierung (leer bis zur Generierung)
- **Steuerung** – Änderungswunsch, Ausgabeformat, optionales Referenzbild, Aktionen

Bei ausstehender KI-Vorschau ist die Vorlage **gesperrt**, bis Sie **Änderung akzeptieren** oder **Änderung verwerfen**.

## Vorlage importieren

Ausgangspunkt ist jedes PNG/JPG/WebP-Layout:

1. **Vorlagen → Importieren…**, Button **Vorlage importieren** (Tab Bild erstellen) oder Drag-and-Drop auf die Galerie.
2. Datei wird in den Benutzer-Vorlagenordner kopiert und unter **Eigene Vorlagen** gelistet.

## System-Vorlage klonen

1. System-Vorlage in Galerie oder Dropdown **Aktuelle Vorlage** wählen.
2. **Klonen** im Kontextmenü oder **Vorlagen → Klonen**.
3. Bearbeitbare Kopie mit neuem Namen.

## KI-Bearbeitungs-Workflow

### 1. Vorlage auswählen

Vorlage im Editor-Dropdown wählen. Original links laden.

### 2. Änderung beschreiben

Im Feld **Änderungswunsch** in normaler Sprache formulieren, z. B.:

- „Akzent-Rahmen von blau auf rot ändern“
- „Header-Logo 20 % vergrößern“
- „Hintergrundverlauf abdunkeln“
- „Kontaktleiste an unteren Rand verschieben“

Alternativ nur **Ausgabeformat** ändern – ohne Textänderung neue Größe erzeugen.

### 3. Optionales Referenzbild

**Referenzbild** hinzufügen, wenn Stimmung, Textur oder Hintergrund aus einem anderen Foto übernommen werden soll:

- Bild in die Drop-Zone ziehen oder **Referenzbild hinzufügen**.
- Im Änderungswunsch erwähnen, z. B. „Warmes Studiolicht wie im Referenzbild“.

### 4. Prompt optimieren

**Prompt optimieren** (oder direkt generieren – interne Optimierung). Die KI erstellt einen präzisen Bearbeitungs-Prompt. Vor dem Anwenden anpassen.

### 5. KI-Vorschau generieren

**KI-Änderung generieren**. Warte-Dialog zeigt Optimierung und Bildgenerierung.

Rechts erscheint die **KI-Vorschau**. **Vollbild-Vergleich** für Original und Vorschau nebeneinander.

### 6. Akzeptieren oder verwerfen

| Schaltfläche | Wirkung |
|--------------|---------|
| **Änderung akzeptieren** | Vorschau wird neue Vorlagenversion (eigener Ordner). System-Vorlagen → neue Benutzer-Vorlage. |
| **Änderung verwerfen** | Vorschau verworfen; Original unverändert |

Nach Akzeptieren wird die Vorschau zum neuen **Original** für weitere Bearbeitungen.

## Versionshistorie

Beim Akzeptieren auf einer **bestehenden eigenen Vorlage** wird die alte Version archiviert unter:

```
%APPDATA%\productcanvas-ai\templates\history\<template-id>\
```

Wiederherstellung manuell über den Explorer. Keine UI-Anbindung.

## Umbenennen und löschen

Kontextmenü auf **eigener Vorlage**:

- **Umbenennen…**
- **Löschen** (mit Bestätigung)

System-Vorlagen sind nicht löschbar.

## Ausgabeformat im Editor

**Ausgabeformat** und **Qualität** entsprechen den Einstellungen unter Bild erstellen.

- **Vorlage (B×H)** – native Vorlagenmaße
- **Vorlage ×2** – doppelte Auflösung
- Feste Größen (1024×1024, 1536×1024, …) – Standard-API-Presets

Nur Größenänderung ohne visuelle Anpassung: neues Ausgabeformat wählen und ohne Änderungswunsch generieren.

## Empfehlungen

- **Eine Änderung pro Durchlauf** – vorhersehbarere Ergebnisse.
- **Vor Experimenten klonen** – bewährte Vorlage als Backup.
- **Nur zufriedenstellende Vorschau akzeptieren**.
- **Hochauflösende Master importieren** – Herunterskalieren ist robuster als nachträgliches Hochskalieren.

## Verwandte Themen

- [Bild erstellen](bild-erstellen.md)
- [Fehlerbehebung](fehlerbehebung.md)
- [Produkt](produkt.md)

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
