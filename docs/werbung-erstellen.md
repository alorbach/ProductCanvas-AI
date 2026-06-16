# Werbung erstellen

## Schritt für Schritt

### 1. Vorlage wählen

Links sehen Sie alle System- und eigenen Vorlagen. Die **zuletzt verwendete** Vorlage ist vorausgewählt.

**Eigene Vorlage importieren:** Button **Vorlage importieren**, Menü **Vorlagen → Importieren…**, oder PNG/JPG/WebP per Drag-and-Drop auf die Vorlagenliste ziehen. Importierte Vorlagen werden unter `%APPDATA%\WerbungMaker\templates\` gespeichert.

Das Beispielbild zeigt das Ziel-Layout (Markenname, Serie, Tagline, Produkt auf Bühne).

### 2. Referenz-Produktbilder

- **Bilder hinzufügen** – ein oder mehrere Produktfotos (per Dialog oder Drag-and-Drop)
- Thumbnails können per × entfernt werden
- Referenzbilder werden bei **Prompt erstellen** (Produktanalyse) und bei **Werbung generieren** (als Anhang an die Bridge) genutzt, damit das Produkt möglichst originalgetreu bleibt

### 3. Einstellungen

| Einstellung | Beschreibung |
|-------------|--------------|
| Bildauflösung | z. B. 1536×1024 (empfohlen) |
| Qualität | Standard oder Hoch |
| Produktkategorie | Footer-Icon wird hervorgehoben |
| Markenname / Serie / Tagline | Nach Prompt-Erstellung editierbar |
| Zusatz-Prompt | Optionale Hinweise an die KI |
| **Produkt originalgetreu (Compositing)** | **Empfohlen:** Ihr Referenzfoto wird pixelgenau auf die Vorlage gelegt (kein KI-Neuziechnen). Ideal für Produktfotos auf schwarzem Hintergrund. |

### 4. Prompt erstellen

Die KI analysiert Ihre Referenzbilder detailliert (Stückzahl, Treiber, Tweeter, Finish) und erstellt einen strukturierten Bild-Prompt mit strengen Regeln zur Produkt-Treue.

### 5. Werbung generieren

Mit aktiviertem **Compositing** (Standard bei Referenzbildern) wird das Produktfoto direkt auf die Vorlage gelegt – schnell und originalgetreu. Ohne Compositing nutzt die App die KI mit Referenz-Anhang (kann Details leicht verändern).

Der Warte-Dialog zeigt den Fortschritt. Nach Abschluss erscheint die Vorschau.

### 6. Export

**Als PNG speichern** – Speicherort frei wählbar.

## Tipps

- Mehrere Referenzbilder verbessern die Produkterkennung
- Tagline kurz halten (eine Zeile)
- Bei Abweichungen Zusatz-Prompt nutzen: „Produkt exakt wie Referenz, keine Formänderung"
