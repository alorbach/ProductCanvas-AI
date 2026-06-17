# Bild erstellen

Im Tab **Bild erstellen** kombinieren Sie Layout-Vorlage, Referenz-Produktfotos und Projekt-Metadaten zu einer fertigen PNG-Datei.

## Ablauf Schritt für Schritt

### 1. Vorlage wählen

Das Vorlagen-Panel listet **Ihre importierten Vorlagen** (PNG/JPG/WebP-Layout-Master). Ist die Liste leer, zuerst eine Vorlage importieren.

- Thumbnail anklicken zur Auswahl.
- Die **zuletzt verwendete** Vorlage ist beim Start vorausgewählt.
- Vorlagen per Drag-and-Drop in der Galerie umsortieren.

**Vorlage importieren:**

- Button **Vorlage importieren**
- Menü **Vorlagen → Importieren…**
- PNG, JPG oder WebP auf die Vorlagenliste ziehen

Importierte Dateien werden nach `%APPDATA%\productcanvas-ai\templates\` kopiert. Siehe [Vorlagen bearbeiten](vorlagen-bearbeiten.md) zum Klonen, Umbenennen oder KI-Bearbeiten.

Die Vorlage legt Canvas-Größe, Hintergrund, Textbereiche und optionale Kategorie-Icons in der Fußzeile fest.

### 2. Referenz-Produktbilder

Referenzfotos beschreiben Ihr Produkt für die KI. Sie werden in zwei Phasen genutzt:

1. **Prompt generieren** – detaillierte Produktanalyse
2. **Bild generieren** – Anhang an die Bridge für originalgetreue Wiedergabe

**Bilder hinzufügen:**

- **Bilder hinzufügen**
- Dateien auf die Referenzliste ziehen
- Kontextmenü → **Bilder hinzufügen…**

Formate: **PNG, JPG, WebP**.

**Tipps:**

- **Mehrere Perspektiven**, wenn ein Foto nicht alle Details zeigt.
- **Reihenfolge per Drag-and-Drop** – das erste Bild ist die **Hauptreferenz**.
- Thumbnails mit × oder Kontextmenü entfernen.

### 3. Projekteinstellungen

| Feld | Beschreibung |
|------|--------------|
| **Bildauflösung** | Ausgabegröße für Codex. **Vorlage (B×H)** entspricht der Vorlage; **Vorlage ×2** verdoppelt die Maße. Feste Presets (z. B. 1536×1024) verfügbar. |
| **Qualität** | Niedrig, Mittel oder Hoch – wie AI Gateway / PMS. **Hoch** für finale Exporte empfohlen. |
| **Produktkategorie** | Hebt das passende Icon in der Vorlagen-Fußzeile hervor. **Anzeigenamen** folgen der UI-Sprache (DE/EN); **Werte** für die KI bleiben stabil (z. B. `LAUTSPRECHER`, `TV`). |
| **Markenname** | Primäre Markenzeile im Layout. |
| **Serie** | Produktlinie oder Modellfamilie. |
| **Werbetext (Tagline)** | Kurzer Werbesatz (möglichst eine Zeile). **KI-Vorschlag** (Funkeln-Symbol) für automatischen Entwurf. |
| **Zusatz-Prompt** | Optionale Hinweise, z. B. „Produkt exakt wie Referenz, keine Formänderung“. |

Auflösung und Qualität beeinflussen Generierungsdauer und Codex-Kosten. Vorlagenmaße behalten das Seitenverhältnis Ihres Layouts.

### 4. Prompt generieren

**Prompt generieren** klicken (erneut nach geänderten Referenzen).

Die App:

1. Sendet Referenzbilder über die [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) an Codex
2. Analysiert jedes Referenzbild (Fortschritt: „Produktbild X von Y wird analysiert…“)
3. Erstellt einen strukturierten **Bild-Prompt** mit Regeln für Layout- und Produkttreue
4. Füllt **Markenname**, **Serie** und **Tagline**, wenn die Analyse Vorschläge liefert (editierbar)

Ergebnis im aufklappbaren Bereich **Bild-Prompt**. Vor dem Generieren prüfen. Nach größeren Änderungen erneut **Prompt generieren**.

**Hinweis:** Mit Referenz-Anhang läuft beim **Bild generieren** automatisch ein **Preflight**, der Vorlage und Produkt in den finalen API-Prompt einbindet. Bis dahin kann ein Platzhalter im Prompt-Bereich erscheinen.

### 5. Bild generieren

**Bild generieren** klicken.

Der Warte-Dialog zeigt Warteschlange, verstrichene Zeit und Phase:

- Referenzbilder vorbereiten
- Bild-Preflight (Prompt-Optimierung mit Referenzen)
- Warteschlange / Generierung

Die Generierung kann **1 bis 30 Minuten** dauern. **Abbrechen** bricht den aktiven Bridge-Job ab (nicht nur den Warte-Dialog).

Nach Abschluss erscheint die Vorschau. Klick für Vollbild (Esc zum Schließen).

### 6. Export

**Als PNG speichern** – Speicherort frei wählen.

Die Vorschau liegt zusätzlich temporär unter `%APPDATA%\productcanvas-ai\temp-previews\`.

## Originalgetreue Produktwiedergabe

ProductCanvas AI hält Produkte nah an Ihren Referenzfotos:

- Referenzbilder werden an Codex weitergeleitet, wenn die Bridge Anhänge unterstützt (Bridge **≥ 1.0.4**).
- Preflight verbindet Layout-Vorgaben mit Produktanalyse.
- **Zusatz-Prompt** verschärft Regeln bei Abweichungen (Material, Muster, Anzahl der Elemente).

Warnt das Debug-Log, dass Referenzen nicht weitergeleitet wurden: [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) auf die [neueste Version](https://github.com/alorbach/codex-local-bridge/releases) aktualisieren.

## Autosave und Profile

Änderungen an Vorlage, Referenzen, Prompts und Projektfeldern werden in `%APPDATA%\productcanvas-ai\session.json` **automatisch gespeichert**.

Benannte Projekte: **Datei → Speichern unter…** als `.pcprofile.json`. Siehe [Einstellungen – Profile](einstellungen.md#profile-pcprofilejson).

## Praxis-Tipps

| Ziel | Vorschlag |
|------|-----------|
| Schärfere Produktdetails | Mehr Referenzwinkel; Qualität Hoch |
| Schnellere Iteration | Niedrigere Qualität oder kleinere Auflösung für Entwürfe |
| Bessere Taglines | Kurz, eine Zeile; KI-Vorschlag dann manuell feinschleifen |
| Nur Layout testen | Vorlage wechseln ohne Prompt-Neubau, wenn Produkt gleich bleibt |
| Wiederholbare Kampagnen | Profil pro Produktlinie speichern |

## Verwandte Themen

- [Vorlagen bearbeiten](vorlagen-bearbeiten.md)
- [Fehlerbehebung](fehlerbehebung.md)
- [Einstellungen](einstellungen.md) – [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)-URL und Sprache

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
