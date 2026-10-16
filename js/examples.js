// Worked examples for every calculator. Expected results were calculated by
// hand from the original publications, not taken from the code, so they catch
// errors in it. They are shown on the review page, run as unit tests and
// entered through the real interface by the browser test.
//
// values: as in evaluate() – true for yes/no, option index for choices,
// numbers in the first unit. { key: 'x' } selects the option with that key,
// which keeps examples valid when the syringe list in config.js changes.
(function (root) {
  'use strict';

  const zeroNihss = { '1a': 0, '1b': 0, '1c': 0, 2: 0, 3: 0, 4: 0, '5a': 0, '5b': 0, '6a': 0, '6b': 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };

  const EXAMPLES = {
    qsofa: [
      { values: { af: true }, expect: { total: 1, label: 'qSOFA negativ' } },
      { values: { af: true, gcs: true, sbp: true }, expect: { total: 3, label: 'qSOFA positiv' } },
    ],
    sofa: [
      { note: 'P/F 452', values: { pao2: 95, fio2: 21, plt: 250, bili: 0.5, cv: 0, gcs: 0, crea: 0.8, uo: 0 }, expect: { total: 0, label: 'Keine relevante Organdysfunktion' } },
      { note: 'P/F 160 mit Beatmung 3 · Thrombozyten 90 → 2 · Bilirubin 2,5 → 2 · Kreislauf 3 · GCS 13–14 → 1 · Kreatinin 1,5 → 1', values: { pao2: 80, fio2: 50, vent: true, plt: 90, bili: 2.5, cv: 3, gcs: 1, crea: 1.5, uo: 0 }, expect: { total: 12, label: 'Schweres Multiorganversagen' } },
    ],
    gcs: [
      { values: { e: 0, v: 0, m: 0 }, expect: { total: 15, label: 'Leichte Bewusstseinsstörung' } },
      { note: 'E2 V2 M3', values: { e: 2, v: 3, m: 3 }, expect: { total: 7, label: 'Schwere Bewusstseinsstörung / Koma' } },
    ],
    news2: [
      { values: { af: 16, spo2: 97, o2: 0, sbp: 125, hr: 75, cns: 0, temp: 36.8 }, expect: { total: 0, label: 'Kein Hinweis auf Verschlechterung' } },
      { note: 'AF 26 → 3 · SpO₂ 93 → 2 · O₂ 2 · RR 95 → 2 · HF 105 → 1 · 39,5 °C → 2', values: { af: 26, spo2: 93, o2: 1, sbp: 95, hr: 105, cns: 0, temp: 39.5 }, expect: { total: 12, label: 'Hohes Risiko' } },
    ],
    'shock-index': [
      { values: { hr: 72, sbp: 120 }, expect: { total: 0.6, label: 'Normal' } },
      { values: { hr: 130, sbp: 85 }, expect: { total: 1.53, label: 'Schock wahrscheinlich' } },
    ],
    pbw: [
      { note: '50 + 0,91 × 27,6', values: { height: 180, sex: 0 }, expect: { total: 75.1, label: 'Idealgewicht 75,1 kg' } },
      { note: '45,5 + 0,91 × 7,6', values: { height: 160, sex: 1 }, expect: { total: 52.4, label: 'Idealgewicht 52,4 kg' } },
    ],
    'ct-head': [
      { values: {}, expect: { label: 'Kein CT nach der Regel', level: 'low' } },
      { values: { vomit: true }, expect: { label: 'CT indiziert', level: 'high' } },
      { values: { amnesia: true }, expect: { label: 'CT indiziert', level: 'mid' } },
    ],
    'c-spine': [
      { values: { walk: true, rot: true }, expect: { label: 'Keine Bildgebung nötig' } },
      { values: { mech: true, sit: true, rot: true }, expect: { label: 'Bildgebung empfohlen' } },
    ],
    nexus: [
      { values: {}, expect: { label: 'Keine Bildgebung nötig' } },
      { values: { tender: true }, expect: { label: 'Bildgebung empfohlen' } },
    ],
    'ottawa-ankle': [
      { values: { mall: true }, expect: { label: 'Kein Röntgen nötig' } },
      { values: { mall: true, lat: true }, expect: { label: 'Röntgen Sprunggelenk' } },
      { values: { mid: true, mt5: true }, expect: { label: 'Röntgen Fuß' } },
    ],
    'ottawa-knee': [
      { values: {}, expect: { label: 'Kein Röntgen nötig' } },
      { values: { fibula: true }, expect: { label: 'Röntgen Knie' } },
    ],
    parkland: [
      { note: '4 × 80 × 25', values: { weight: 80, vkof: 25 }, expect: { total: 8000, label: '25 % VKOF' } },
      { values: { weight: 70, vkof: 10 }, expect: { total: 2800, label: 'Unter 15 % VKOF' } },
    ],
    curb65: [
      { values: { u: 0 }, expect: { total: 0, label: 'Niedriges Risiko' } },
      { values: { c: true, u: 1, r: true, a: true }, expect: { total: 4, label: 'Hohes Risiko' } },
      { note: 'ohne Harnstoff → CRB-65', values: { a: true, u: 2 }, expect: { total: 1, name: 'CRB-65', label: 'Mittleres Risiko' } },
    ],
    centor: [
      { values: { temp: true, tons: true, age: 1 }, expect: { total: 2, label: 'Mittlere Wahrscheinlichkeit' } },
      { values: { temp: true, cough: true, lk: true, tons: true, age: 0 }, expect: { total: 5, label: 'Hohe Wahrscheinlichkeit' } },
    ],
    legionella: [
      { values: { sputum: true }, expect: { total: 1, label: 'Legionellen sehr unwahrscheinlich' } },
      { values: { temp: true, na: true, ldh: true, crp: true }, expect: { total: 4, label: 'Hohe Wahrscheinlichkeit' } },
    ],
    heart: [
      { values: { h: 0, e: 0, a: 1, r: 1, t: 0 }, expect: { total: 2, label: 'Niedriges Risiko' } },
      { values: { h: 2, e: 1, a: 2, r: 2, t: 1 }, expect: { total: 8, label: 'Hohes Risiko' } },
    ],
    cha2ds2va: [
      { values: { age: 0 }, expect: { total: 0, label: 'Keine Antikoagulation' } },
      { values: { htn: true, age: 2, dm: true }, expect: { total: 4, label: 'Antikoagulation empfohlen' } },
    ],
    hasbled: [
      { values: { age: true }, expect: { total: 1, label: 'Niedriges Blutungsrisiko' } },
      { values: { h: true, bleed: true, age: true, drugs: true }, expect: { total: 4, label: 'Hohes Blutungsrisiko' } },
    ],
    syncope: [
      { values: { vaso: true, dx: 1 }, expect: { total: -3, label: 'Sehr niedriges Risiko' } },
      { values: { heart: true, trop: true, qtc: true, dx: 2 }, expect: { total: 7, label: 'Sehr hohes Risiko' } },
    ],
    'wells-le': [
      { values: { hr: true }, expect: { total: 1.5, label: 'LE unwahrscheinlich' } },
      { values: { dvt: true, alt: true, hr: true }, expect: { total: 7.5, label: 'LE wahrscheinlich' } },
    ],
    perc: [
      { values: {}, expect: { total: 0, label: 'PERC negativ' } },
      { values: { age: true }, expect: { total: 1, label: 'PERC positiv' } },
    ],
    'wells-tvt': [
      { values: { leg: true, alt: true }, expect: { total: -1, label: 'TVT unwahrscheinlich' } },
      { values: { ca: true, tend: true, edema: true }, expect: { total: 3, label: 'TVT wahrscheinlich' } },
    ],
    nihss: [
      { values: zeroNihss, expect: { total: 0, label: 'Kein Defizit' } },
      { values: Object.assign({}, zeroNihss, { '1a': 1, '1b': 2, '1c': 1, 2: 1, 3: 2, 4: 2, '5b': 3, '6b': 2, 8: 1, 9: 2, 10: 1, 11: 1 }), expect: { total: 19, label: 'Mittelschwer bis schwer' } },
    ],
    abcd2: [
      { values: { c: 0, d: 0 }, expect: { total: 0, label: 'Niedriges Risiko' } },
      { values: { age: true, bp: true, c: 2, d: 2, dm: true }, expect: { total: 7, label: 'Hohes Risiko' } },
    ],
    '4at': [
      { values: { alert: 0, amt4: 0, att: 0, acute: 0 }, expect: { total: 0, label: 'Delir unwahrscheinlich' } },
      { values: { alert: 0, amt4: 1, att: 1, acute: 0 }, expect: { total: 2, label: 'Kognitive Beeinträchtigung möglich' } },
      { values: { alert: 2, amt4: 2, att: 2, acute: 1 }, expect: { total: 12, label: 'Delir möglich' } },
    ],
    gbs: [
      { note: 'Harnstoff 30 mg/dl ≈ 5,0 mmol/l', values: { urea: 30, sex: 0, hb: 14, sbp: 120 }, expect: { total: 0, label: 'Sehr niedriges Risiko' } },
      { note: 'Harnstoff 45 mg/dl ≈ 7,5 mmol/l → 2 · Hb 12,5 (Mann) → 1 · Meläna 1', values: { urea: 45, sex: 0, hb: 12.5, sbp: 115, melena: true }, expect: { total: 4, label: 'Intervention möglich' } },
      { note: 'Harnstoff 90 mg/dl ≈ 15 mmol/l → 4 · Hb 9 (Frau) → 6 · RR 85 → 3 · Puls 1 · Meläna 1', values: { urea: 90, sex: 1, hb: 9, sbp: 85, hr: true, melena: true }, expect: { total: 15, label: 'Hohes Risiko' } },
    ],
    'child-pugh': [
      { values: { bili: 0, alb: 0, inr: 0, asc: 0, he: 0 }, expect: { total: 5, label: 'Child-Pugh A' } },
      { values: { bili: 1, alb: 1, inr: 0, asc: 1, he: 0 }, expect: { total: 8, label: 'Child-Pugh B' } },
      { values: { bili: 2, alb: 2, inr: 1, asc: 2, he: 1 }, expect: { total: 13, label: 'Child-Pugh C' } },
    ],
    meld: [
      { values: { bili: 1, inr: 1, crea: 1 }, expect: { total: 6, label: 'Niedrige Letalität' } },
      { note: '3,78 × ln 4 + 11,2 × ln 2 + 9,57 × ln 2 + 6,43 = 26,1', values: { bili: 4, inr: 2, crea: 2 }, expect: { total: 26, label: 'Hohe Letalität' } },
    ],
    egfr: [
      { values: { crea: 1.0, age: 50, sex: 1 }, expect: { total: 92, label: 'KDIGO G1' } },
      { values: { crea: 1.5, age: 75, sex: 0 }, expect: { total: 36, label: 'KDIGO G3b' } },
    ],
    urin: [
      { note: 'FENa = 10 × 2 / (140 × 100) × 100', values: { sna: 140, screa: 2, una: 10, ucrea: 100 }, expect: { total: 0.14, label: 'Prärenales Muster' } },
      { note: 'FENa = 60 × 3 / (135 × 30) × 100', values: { sna: 135, screa: 3, una: 60, ucrea: 30 }, expect: { total: 4.44, label: 'Renales Muster' } },
    ],
    'anion-gap': [
      { values: { na: 140, cl: 104, hco3: 24 }, expect: { total: 12, label: 'Normale Anionenlücke' } },
      { values: { na: 138, cl: 98, hco3: 10 }, expect: { total: 30, label: 'Erhöhte Anionenlücke', level: 'high' } },
    ],
    calcium: [
      { note: '2,0 + 0,02 × (40 − 25)', values: { ca: 2.0, alb: 2.5 }, expect: { total: 2.3, label: 'Normal' } },
      { values: { ca: 2.9, alb: 4.0 }, expect: { total: 2.9, label: 'Hyperkalzämie' } },
    ],
    'osmo-gap': [
      { note: 'berechnet 2 × 140 + 90/18 + 30/6 ≈ 290', values: { osm: 295, na: 140, glu: 90, urea: 30 }, expect: { total: 5, label: 'Keine relevante Lücke' } },
      { note: 'berechnet 2 × 140 + 180/18 + 30/6 ≈ 295', values: { osm: 330, na: 140, glu: 180, urea: 30 }, expect: { total: 35, label: 'Deutlich erhöhte Lücke' } },
    ],
    sodium: [
      { note: '(513 − 118) / (80 × 0,6 + 1)', values: { na: 118, weight: 80, tbw: 0, fluid: 0 }, expect: { total: 8.1, label: 'Schwere Hyponatriämie' } },
      { note: '(0 − 156) / (70 × 0,5 + 1)', values: { na: 156, weight: 70, tbw: 1, fluid: 4 }, expect: { total: -4.3, label: 'Hypernatriämie' } },
    ],
    perfusor: [
      { note: '5 mg / 50 ml = 100 µg/ml; 0,2 × 80 × 60 / 100', values: { mode: 0, syringe: { key: 'free' }, mg: 5, ml: 50, weight: 80, dose: 0.2 }, expect: { total: 9.6, label: 'Freie Eingabe' } },
      { note: '250 mg / 50 ml = 5000 µg/ml; 4,2 × 5000 / (70 × 60)', values: { mode: 1, syringe: { key: 'free' }, mg: 250, ml: 50, weight: 70, rate: 4.2 }, expect: { total: 5, label: 'Freie Eingabe' } },
    ],
  };

  // Replaces { key } references with option indexes.
  function resolveExample(score, values) {
    const out = {};
    Object.keys(values).forEach((id) => {
      const v = values[id];
      const item = score.items.find((i) => i.id === id);
      out[id] = v && typeof v === 'object' && item && item.options
        ? item.options.findIndex((o) => o.key === v.key)
        : v;
    });
    return out;
  }

  const api = { EXAMPLES, resolveExample };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NotfallExamples = api;
})(this);
