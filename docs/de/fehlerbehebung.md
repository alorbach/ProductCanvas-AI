# Fehlerbehebung

Häufige Probleme mit [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge), Pairing, langen Jobs und Bildqualität in ProductCanvas AI.

## Kurzübersicht

| Symptom | Erste Schritte |
|---------|----------------|
| Roter Bridge-Status | Bridge-Tray prüfen; URL in Einstellungen |
| Banner „Pairing erforderlich“ | Frischen 6-stelligen Code eingeben → **Verbinden** |
| „Codex-Anmeldung erforderlich“ | `codex login` oder **Codex anmelden** |
| Prompt-Erstellung schlägt fehl | Referenzen prüfen (PNG/JPG/WebP); Debug-Log |
| Zeitüberschreitung | Bis 30 Min. warten; abbrechen und wiederholen |
| Produkt sieht falsch aus | Prompt neu generieren; Referenzen ergänzen; **Zusatz-Prompt** |
| Referenzen ohne Wirkung | [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) ≥ 1.0.4; Debug-Log Anhang-Modus |

## Bridge nicht erreichbar

**Anzeichen:** Roter Punkt; „Bridge nicht erreichbar“; Fehler zu Port 8765 oder „fetch failed“.

**Prüfen:**

1. **[Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)** im Tray – fehlt das Symbol: ProductCanvas AI neu starten, von [Releases](https://github.com/alorbach/codex-local-bridge/releases) installieren oder Bridge manuell aus `%LOCALAPPDATA%\productcanvas-ai\bridge\` starten.
2. **Einstellungen → Bridge-URL** = tatsächlicher Bridge-Endpunkt (Standard `http://127.0.0.1:8765`).
3. VPN/Sicherheitssoftware blockiert **localhost**?
4. Bridge im Tray neu starten, danach ProductCanvas AI.

**Firewall:** Bridge und ProductCanvas AI für privates Netzwerk erlauben – Standard nur Loopback.

## Pairing-Probleme

**Anzeichen:** Gelber Status; „Pairing erforderlich“; Fehler „nicht mit Codex Local Bridge gepairt“.

**Lösung:**

1. Im Bridge-Tray aktuellen **Pairing-Code** (6 Ziffern) anzeigen.
2. Code im Einrichtungs-Banner eingeben – Codes laufen ab, immer frischen verwenden.
3. **Verbinden** klicken.
4. Bei anhaltendem Fehler: beide Apps beenden, zuerst Bridge, dann ProductCanvas AI.

Pairing-Token: `%APPDATA%\productcanvas-ai\bridge-state.json`. Datei löschen erzwingt Neupairing (sicher, wenn die Bridge den Client vergessen hat).

## Codex CLI – Anmeldung

**Anzeichen:** „Codex-Anmeldung erforderlich“; Bridge bereit, Generierung scheitert an Auth.

**Lösung:**

```powershell
codex login
```

Browser-Anmeldung abschließen. Prüfen mit:

```powershell
codex --version
```

CLI fehlt: winget/npm oder offizielle Codex-Dokumentation. ProductCanvas AI versucht Installation bei der Einrichtung.

## Zeitüberschreitungen und lange Wartezeiten

Jobs können **bis zu 30 Minuten** laufen, bevor eine Zeitüberschreitung gemeldet wird – normal bei hoher Auflösung und Qualität **Hoch**.

**Während der Generierung:**

- Warte-Dialog: **Warteschlange**, **Generierung**, verstrichene Zeit.
- Bridge-Tray auf aktive Jobs prüfen.
- **Abbrechen** bricht den aktiven Bridge-Job ab (nicht nur den Dialog), dann erneut versuchen.

**Fehlercodes (Debug-Log):**

| Code | Bedeutung |
|------|-----------|
| `BRIDGE_TIMEOUT` | Keine Antwort im Zeitfenster |
| `BRIDGE_HEADERS_TIMEOUT` | Bridge sendet mid-job keine Fortschritts-Header mehr |
| `BRIDGE_FETCH_FAILED` | Verbindung abgebrochen oder Bridge offline |

**Abhilfe:** Qualität/Auflösung für Tests senken; andere Bridge-Jobs schließen; Bridge neu starten.

## Fehler bei Prompt-Erstellung

**Anzeichen:** „Prompt konnte nicht erstellt werden“; leerer Bild-Prompt.

**Prüfen:**

- Mindestens ein **Referenzbild** vorhanden.
- Bilder nicht beschädigt.
- Bridge gepairt, Codex angemeldet.
- **Debug-Log** auf HTTP-/Anhang-Fehler.

Sehr große Referenzen werden ggf. automatisch verkleinert. Meldung „body too large“: Bildmaße reduzieren.

## Bildqualität und Produkttreue

### Produkt weicht von Referenz ab

1. **Prompt generieren** nach besseren Referenzfotos erneut.
2. Bestes Gesamtfoto **an erste Stelle** in der Referenzliste.
3. **Zusatz-Prompt**: „Produkt exakt wie Referenz; Treiber, Finish und Proportionen nicht ändern.“
4. **Hoch** und Vorlagenmaß für finale Exporte.

### Layout oder Text falsch

- Richtige **Vorlage** gewählt?
- Nach Änderung von Marke/Serie/Tagline Prompt neu erzeugen und erneut generieren.

### Referenzen nicht weitergeleitet

Debug-Log: „Referenzen im HTTP-Payload, aber nicht an Codex gesendet“.

**Fix:** **[Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) 1.0.4 oder neuer** ([Releases](https://github.com/alorbach/codex-local-bridge/releases)). Ältere Versionen ignorieren `/v1/images`-Anhänge.

Erfolg: „Referenzen an Codex weitergeleitet (N Anhänge)“.

## Vorlagen-Editor

| Problem | Maßnahme |
|---------|----------|
| Vorlage gesperrt | KI-Vorschau akzeptieren oder verwerfen |
| „Änderungswunsch eingeben…“ | Text eingeben oder anderes Ausgabeformat |
| Vorschau stark abweichend | Änderung eingrenzen; Vorlage klonen |
| Löschen nicht möglich | Importierte Vorlagen können aus der Bibliothek gelöscht werden |

## Export und Vorschau

- **Als PNG speichern** erst nach erfolgreicher Generierung.
- Leere Vorschau trotz Erfolg: `%APPDATA%\productcanvas-ai\temp-previews\` prüfen.
- Vollbild: Bild anklicken; **Esc** schließt.

## Logs und Support

1. Problem einmal reproduzieren.
2. **Debug-Log** → **Kopieren**.
3. Version notieren (**Hilfe → Über ProductCanvas AI…**).
4. Bridge- und Codex-CLI-Version aus Tray oder Terminal.

Issues: [github.com/alorbach/productcanvas-ai/issues](https://github.com/alorbach/productcanvas-ai/issues)

## Verwandte Themen

- [Erste Schritte](einrichtung.md)
- [Einstellungen](einstellungen.md)
- [Bild erstellen](bild-erstellen.md)

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
