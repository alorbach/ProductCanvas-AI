# Effektbilder bearbeiten

Der Reiter **Effektbilder bearbeiten** ermöglicht Anpassungen importierter oder per KI erzeugter Effekt-/Hintergrundbilder per natürlicher Sprache und KI-Vorschau über [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge). Änderungen werden erst nach Ihrer Freigabe gespeichert.

## Effekt-Bibliothek

Alle Effektbilder liegen unter `%APPDATA%\productcanvas-ai\effects\`. Import als PNG, JPG oder WebP, oder Neuerzeugung per Text auf dem Reiter **Bild erstellen**.

| Aktion | Beschreibung |
|--------|--------------|
| **Importieren** | Neues Effektbild von der Festplatte |
| **Erzeugen** | Neues Effektbild aus Textbeschreibung (Reiter Bild erstellen) |
| **Umbenennen** | Anzeigename ändern |
| **Löschen** | Effekt und Datei entfernen (mit Bestätigung) |
| **Umsortieren** | Miniaturen per Drag & Drop |
| **Bearbeiten…** | Effekt-Editor für bestehendes Effektbild öffnen |

## Aufbau des Editors

- **Original** – gespeichertes Effektbild
- **KI-Vorschau** – Ergebnis der letzten Generierung (leer bis zur Erzeugung)
- **Steuerung** – Änderungswunsch, Ausgabeformat, optionales Referenzbild, Aktionen

Bei ausstehender KI-Vorschau ist der Effekt **gesperrt**, bis Sie **Änderung übernehmen** oder **Änderung verwerfen**.

## KI-Bearbeitungs-Workflow

### 1. Effekt wählen

Effekt in der Dropdown-Liste wählen oder per **Bearbeiten…** im Kontextmenü der Effektkarte. Das Original erscheint links.

### 2. Änderung beschreiben

Im Feld **Änderungswunsch** in Alltagssprache formulieren, z. B.:

- „Flammen verstärken und orange Leuchten erhöhen“
- „Atmosphäre von warm auf kühles Blau ändern“
- „Rauch weicher machen und Kontrast reduzieren“

Alternativ nur **Ausgabeformat** (Auflösung) ändern – ohne Text generieren, um eine skalierte Variante zu erhalten.

### 3. Optionales Referenzbild

**Referenzbild** hinzufügen, wenn Stimmung, Textur oder Beleuchtung aus einem anderen Foto übernommen werden soll:

- Bild in die Drop-Zone ziehen oder **Referenzbild hinzufügen** nutzen.
- Im Änderungswunsch erwähnen, z. B. „Warmes Studiolicht wie im Referenzbild“.

Der optionale Pfad wird in der Sitzung (`effectEditorReferenceImagePath`) gespeichert und nach Neustart wieder geladen.

### 4. KI-Vorschau erzeugen

**KI-Vorschau erzeugen** startet Prompt-Optimierung und Bildgenerierung über die Bridge.

Die **KI-Vorschau** erscheint rechts. **Vollbild vergleichen** zeigt Original und Vorschau nebeneinander.

### 5. Übernehmen oder verwerfen

| Schaltfläche | Wirkung |
|--------------|---------|
| **Änderung übernehmen** | Vorschau wird als neue Effektversion gespeichert |
| **Änderung verwerfen** | Vorschau verwerfen; Original unverändert |

Nach Übernahme wird die Vorschau zum neuen **Original** für weitere Bearbeitungen.

## Versionshistorie

Beim Übernehmen einer Bearbeitung wird die vorherige Version archiviert unter:

```
%APPDATA%\productcanvas-ai\effects\history\<effekt-id>\
```

Manuelle Wiederherstellung über den Explorer; die Historie ist nicht in der UI sichtbar.

## Ausgabeformat im Editor

**Ausgabeformat** und **Qualität** entsprechen den Einstellungen auf **Bild erstellen**.

- **Effekt (B×H)** – native Effektgröße
- Feste Größen (1024×1024, 1536×1024, …) – API-Vorgaben

Nur Größenänderung ohne Inhaltsänderung: neues Ausgabeformat wählen und ohne Änderungswunsch generieren.

## Tipps

- **Eine Änderung pro Durchlauf** – kleinere Wünsche liefern stabilere Vorschauen.
- **Nur übernehmen, wenn zufrieden** – verworfene Vorschauen kosten Zeit, schützen aber die Bibliothek.
- **Volle Auflösung importieren/erzeugen** – nachträgliches Vergrößern ist weniger zuverlässig.

## Weiterführend

- [Bild erstellen](bild-erstellen.md) – Effektbilder in der Produktgenerierung
- [Vorlagen bearbeiten](vorlagen-bearbeiten.md) – ähnlicher Workflow für Layout-Vorlagen
- [Fehlerbehebung](fehlerbehebung.md) – Probleme bei KI-Bearbeitung
- [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) – lokaler KI-Server

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
