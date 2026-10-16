# Klinische Scores

Schnelle, mobilfreundliche Rechner für qSOFA, CURB-65/CRB-65, HEART-Score,
Wells (Lungenembolie und TVT) und NIHSS – mit Interpretation und Link zur
Originalquelle.

Reines HTML/CSS/JavaScript ohne Build-Schritt und ohne Abhängigkeiten.
`index.html` direkt im Browser öffnen oder den Ordner auf einem beliebigen
statischen Hoster (z. B. GitHub Pages) ablegen.

## Aufbau

- `js/scores.js` – Score-Definitionen (Items, Punkte, Interpretation, Quellen) und Auswertung, ohne DOM
- `js/app.js` – Oberfläche
- `css/style.css` – Gestaltung, helles und dunkles Farbschema
- `tests/scores.test.js` – Tests der Rechenlogik: `node tests/scores.test.js`

Einen neuen Score fügt man als weiteres Objekt in `SCORES` in `js/scores.js` hinzu.

## Hinweis

Entscheidungshilfe für medizinisches Fachpersonal, kein Medizinprodukt.
