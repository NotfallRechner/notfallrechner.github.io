# Klinische Scores

Schnelle, mobilfreundliche Rechner für klinische Scores – mit Hinweisen, wann
der Score anzuwenden ist, Interpretation, Kopierfunktion für die Dokumentation
und Link zur Originalquelle.

| Bereich | Scores |
| --- | --- |
| Notfall & Intensiv | qSOFA, SOFA, Glasgow Coma Scale |
| Infektionen | CURB-65/CRB-65, Centor/McIsaac |
| Kardiologie | HEART, CHA₂DS₂-VA (ESC 2024), HAS-BLED |
| Thrombose & Embolie | Wells LE, PERC, Wells TVT |
| Neurologie | NIHSS, ABCD² |
| Leber | Child-Pugh, MELD (labMELD) |
| Niere & Labor | eGFR (CKD-EPI 2021), Urin-Indizes (FENa, FEUrea u. a.), Anionenlücke |

Reines HTML/CSS/JavaScript ohne Build-Schritt und ohne Abhängigkeiten.
`index.html` direkt im Browser öffnen oder den Ordner auf einem beliebigen
statischen Hoster (z. B. GitHub Pages) ablegen.

## Funktionen

- **Wann anwenden?** – zu jedem Score Indikation und Grenzen (einklappbar)
- **Für Dokumentation kopieren** – Ergebnis mit allen Angaben als Text
- **Suche und Favoriten** – Suchfeld (Taste `/`) über Name, Organ und Diagnose; Favoriten stehen vorn in der Leiste
- **Zahleneingaben mit Einheitenwahl** (z. B. Kreatinin in mg/dl oder µmol/l); die gewählte Einheit wird gemerkt
- **Offline nutzbar** und als App installierbar (PWA). Der Service Worker läuft nur über `http(s)`, nicht beim Öffnen per `file://`.

Gespeichert werden nur Favoriten und Anzeigeeinstellungen im Browser, nie Patientenwerte.

## Aufbau

- `js/scores.js` – Score-Definitionen (Items, Punkte bzw. Formel, Interpretation, Anwendungshinweise, Quellen) und Auswertung, ohne DOM
- `js/app.js` – Oberfläche
- `css/style.css` – Gestaltung, helles und dunkles Farbschema
- `sw.js`, `manifest.json`, `icons/` – Offline-Betrieb und App-Installation
- `tests/scores.test.js` – Tests der Rechenlogik: `node tests/scores.test.js`
- `tools/make-icons.js` – erzeugt die PNG-Icons neu: `node tools/make-icons.js`

Einen neuen Score fügt man als weiteres Objekt in `SCORES` in `js/scores.js` hinzu.
Eingabetypen: `bool` (Ja/Nein mit Punkten), `choice` (Auswahl) und `number`
(Zahl mit Einheiten und Plausibilitätsbereich). Punktsummen-Scores brauchen nur
`interpret`; formelbasierte Scores zusätzlich `compute` und ein explizites `max`
(oder `null`). Pflichtfelder sind `group`, `usage.when` und `sources`.

Neue Dateien, die offline verfügbar sein sollen, in `ASSETS` in `sw.js` eintragen.

## CI und Veröffentlichung

`.github/workflows/ci.yml` führt bei jedem Push und Pull Request die Tests aus
und veröffentlicht `main` anschließend auf GitHub Pages. Dafür einmalig im
Repository unter *Settings → Pages → Source* „GitHub Actions“ wählen.

## Hinweis

Entscheidungshilfe für medizinisches Fachpersonal, kein Medizinprodukt.
