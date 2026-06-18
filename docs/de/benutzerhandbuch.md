# ProductCanvas AI – Benutzerhandbuch

ProductCanvas AI ist eine Windows-Desktop-Anwendung, die Layout-Vorlagen und Referenz-Produktfotos über lokale KI ([Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)) zu fertigen Marketingbildern zusammensetzt.

## Inhaltsverzeichnis

1. [Erste Schritte](einrichtung.md) – Installation, Bridge-Pairing, Codex-Anmeldung, erstes Bild
2. [Bild erstellen](bild-erstellen.md) – Vorlagen, Referenzen, Projektfelder, Generieren, Export
3. [Vorlagen bearbeiten](vorlagen-bearbeiten.md) – Import, Klonen, KI-Bearbeitung, Akzeptieren/Verwerfen
4. [Einstellungen](einstellungen.md) – Sprache, Bridge-URL, Profile
5. [Fehlerbehebung](fehlerbehebung.md) – Bridge, Pairing, Zeitüberschreitungen, Qualität
6. [Produkt](produkt.md) – Architektur, Datenschutz, universeller Einsatz
7. [Entwickler](entwickler.md) – Entwicklungsumgebung, Tests, CI, Releases

## Überblick

ProductCanvas AI verbindet drei Bausteine:

- **Layout-Vorlagen** definieren den visuellen Rahmen (Hintergrund, Textbereiche, Akzente).
- **Referenzfotos** zeigen das Produkt, das im Layout erscheinen soll.
- **Lokale KI** (Codex CLI über [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge)) analysiert Referenzen, erstellt Prompts und generiert oder verfeinert Bilder – alles auf Ihrem PC.

Typischer Ablauf:

1. Vorlage wählen oder importieren.
2. Ein oder mehrere Referenz-Produktbilder hinzufügen.
3. Projektfelder ausfüllen (Hauptzeile, Werbezeile 1, Werbezeile 2).
4. **Prompt generieren** – KI analysiert das Produkt und erstellt einen Bild-Prompt.
5. **Bild generieren** und Vorschau prüfen.
6. Optional **Vorschau mit KI verfeinern** (übernehmen oder verwerfen).
7. **Als PNG speichern** – Ergebnis exportieren.

## Bereiche der Anwendung

| Tab / Bereich | Zweck |
|---------------|-------|
| **Bild erstellen** | Tägliche Bildproduktion aus Vorlage + Referenzen |
| **Vorlagen bearbeiten** | Layout-Vorlagen per KI mit Vorschau und Bestätigung anpassen |
| **Hilfe** | Integrierter Viewer für diese Dokumentation |

## Profile und Autosave

Ihre Arbeitssitzung wird beim erneuten Öffnen automatisch wiederhergestellt:

- Gewählte Vorlage, Referenzbilder, Prompts und Projektfelder
- Letzter Vorschau-Pfad (wenn noch vorhanden)

Für benannte Projekte nutzen Sie das Menü **Datei**:

| Aktion | Tastenkürzel |
|--------|--------------|
| Neues Profil | Strg+N |
| Profil öffnen | Strg+O |
| Speichern | Strg+S |
| Speichern unter | Strg+Umschalt+S |
| Zuletzt geöffnet | Datei → Zuletzt geöffnet (bis zu 10 Einträge) |

Profile werden als `.pcprofile.json` gespeichert. Referenzbilder werden in einen Ordner neben der Profildatei kopiert – Projekte bleiben so portabel. Details unter [Einstellungen](einstellungen.md#profile-pcprofilejson).

## Bridge-Statusanzeige

Der farbige Punkt in der Kopfzeile zeigt den Verbindungsstatus zur [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge):

- **Grün** – Bridge verbunden und gepairt
- **Gelb / Orange** – Einrichtung oder Anmeldung nötig
- **Rot** – Bridge nicht erreichbar

Bei Bedarf erscheint ein Banner oben mit Pairing-Code-Eingabe und **Codex anmelden**. Siehe [Erste Schritte](einrichtung.md).

## Hilfe in der App

Tab **Hilfe** oder Menü **Hilfe → Benutzerhandbuch**. Die Dokumentationssprache folgt Ihrer UI-Sprache (Deutsch oder Englisch).

## Externe Abhängigkeiten

| Projekt | Rolle |
|---------|-------|
| [ProductCanvas AI](https://github.com/alorbach/productcanvas-ai) | Diese Desktop-App |
| [Codex Local Bridge](https://github.com/alorbach/codex-local-bridge) | Lokaler HTTP-Server; Pairing, Job-Weiterleitung an Codex CLI |
| **Codex CLI** | Kommandozeile zu KI-Modellen (separat installieren und anmelden) |

Bridge-Releases: [github.com/alorbach/codex-local-bridge/releases](https://github.com/alorbach/codex-local-bridge/releases), wenn Sie nicht die automatische Einrichtung der App nutzen.

---

Copyright © [Andre Lorbach](https://github.com/alorbach). Lizenz: [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
