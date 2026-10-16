# NotfallRechner

Klinische Scores und Rechner für Notaufnahme und Station – mobilfreundlich,
offline nutzbar, mit Hinweisen, wann der Score anzuwenden ist, Interpretation,
Kopierfunktion für die Dokumentation und Link zur Originalquelle.

**App:** https://notfallrechner.github.io

| Bereich | Rechner |
| --- | --- |
| Notfall & Intensiv | qSOFA, SOFA, Glasgow Coma Scale, NEWS2, Schockindex |
| Trauma | Canadian CT Head Rule, Canadian C-Spine Rule, NEXUS, Parkland-Formel |
| Infektionen | CURB-65/CRB-65, Centor/McIsaac, Legionella-Score |
| Kardiologie | HEART, CHA₂DS₂-VA (ESC 2024), HAS-BLED |
| Thrombose & Embolie | Wells LE (mit altersadjustiertem D-Dimer), PERC, Wells TVT |
| Neurologie | NIHSS, ABCD² |
| Leber | Child-Pugh, MELD (labMELD) |
| Niere & Labor | eGFR (CKD-EPI 2021), Urin-Indizes (FENa, FEUrea u. a.), Anionenlücke, albuminkorrigiertes Calcium, osmotische Lücke, Natrium-Korrektur |
| Medikamente & Infusion | Perfusor-Rechner (µg/kg/min ↔ ml/h) |

Reines HTML/CSS/JavaScript ohne Build-Schritt und ohne Abhängigkeiten.

## Funktionen

- **Wann anwenden?** – zu jedem Rechner Indikation und Grenzen
- **Für Dokumentation kopieren** – Ergebnis mit allen Angaben als Text
- **Werte werden übernommen** – Kreatinin, Natrium, Gewicht, Puls usw. einmal eingeben, in anderen Rechnern vorausgefüllt (gestrichelt markiert); „Neuer Patient“ löscht alles
- **Passend dazu** – Links zum sinnvollen Folge-Rechner, z. B. Wells LE → PERC
- **Suche und Favoriten** – Suche (Taste `/`); in der Leiste stehen nur Favoriten
- **Fachlicher Prüfstand** je Rechner und **Fehler melden** (GitHub-Issue, vorausgefüllt)
- **Offline nutzbar** und installierbar (PWA); geöffnete Apps melden neue Versionen

Gespeichert werden nur Favoriten und Anzeigeeinstellungen im Browser, nie Patientenwerte.

## Aufbau

- `js/version.js` – Versionsnummer und Datum; **bei jeder Veröffentlichung erhöhen**, damit geöffnete Apps den Hinweis „Neue Version“ zeigen
- `js/scores.js` – Rechner-Definitionen und Auswertung, ohne DOM
- `js/app.js` – Oberfläche
- `css/style.css` – Gestaltung, helles und dunkles Farbschema
- `sw.js`, `manifest.json`, `icons/` – Offline-Betrieb und App-Installation
- `tests/scores.test.js` – Tests: `node tests/scores.test.js`
- `tools/make-icons.js` – erzeugt die PNG-Icons neu

### Einen Rechner hinzufügen

Ein weiteres Objekt in `SCORES` in `js/scores.js`. Pflichtfelder: `id`, `group`,
`short`, `title`, `subtitle`, `usage.when`, `items`, `interpret`, `sources`
(leer nur bei reinen Rechenhilfen mit `calculator: true`).

| Eingabe | Zweck |
| --- | --- |
| `bool(id, label, punkte, hinweis)` | Ja/Nein mit Punkten |
| `flag(id, label, hinweis)` | Ja/Nein ohne Punkte, für Formeln und Regeln |
| `choice(id, label, optionen, hinweis)` | Auswahl; Optionen mit `opt(punkte, …)` oder `pick(…)` |
| `num(id, label, einheiten, min, max, extra)` | Zahl mit Einheitenwahl; `extra`: `optional`, `shared`, `when`, `hint` |
| `heading(label)` | Zwischenüberschrift |

Weitere Felder: `compute` (Formel statt Punktsumme), `max` (oder `null`),
`unit`, `rule: true` (Ergebnis ohne Zahl), `related` (Folge-Rechner),
`reviewed: { date: 'JJJJ-MM-TT', by: 'Name' }` nach fachlicher Prüfung.

## CI und Veröffentlichung

`.github/workflows/ci.yml` führt bei jedem Push und Pull Request die Tests aus
und veröffentlicht `main` anschließend auf GitHub Pages.

## Hinweis

Entscheidungshilfe für medizinisches Fachpersonal, kein Medizinprodukt.
