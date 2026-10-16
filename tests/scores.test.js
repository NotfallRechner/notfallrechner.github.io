// Run with: node tests/scores.test.js
const assert = require('node:assert/strict');
const { SCORES, GROUPS, evaluate, formatPoints, summaryText } = require('../js/scores.js');

const byId = Object.fromEntries(SCORES.map((s) => [s.id, s]));
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('ok  ' + name);
}

test('maxima', () => {
  assert.equal(byId.qsofa.max, 3);
  assert.equal(byId.curb65.max, 5);
  assert.equal(byId.heart.max, 10);
  assert.equal(byId['wells-le'].max, 12.5);
  assert.equal(byId['wells-tvt'].max, 9);
  assert.equal(byId.nihss.max, 42);
});

test('qSOFA threshold at 2', () => {
  assert.equal(evaluate(byId.qsofa, { af: true }).result.level, 'low');
  const r = evaluate(byId.qsofa, { af: true, sbp: true });
  assert.equal(r.total, 2);
  assert.equal(r.result.level, 'high');
});

test('CURB-65 needs urea answered, switches to CRB-65 when unknown', () => {
  const s = byId.curb65;
  assert.equal(evaluate(s, { c: true }).complete, false);
  const full = evaluate(s, { c: true, u: 1, a: true });
  assert.equal(full.total, 3);
  assert.equal(full.name, 'CURB-65');
  assert.equal(full.result.level, 'high');
  const crb = evaluate(s, { c: true, u: 2 });
  assert.equal(crb.name, 'CRB-65');
  assert.equal(crb.max, 4);
  assert.equal(crb.result.level, 'mid');
  assert.equal(evaluate(s, { u: 0 }).result.level, 'low');
  assert.equal(evaluate(s, { u: 0, a: true, r: true }).result.level, 'mid');
});

test('HEART bands 0-3 / 4-6 / 7-10', () => {
  const s = byId.heart;
  const v = (h, e, a, r, t) => ({ h, e, a, r, t });
  assert.equal(evaluate(s, v(1, 0, 1, 1, 0)).result.level, 'low');
  assert.equal(evaluate(s, v(1, 1, 1, 1, 0)).result.level, 'mid');
  assert.equal(evaluate(s, v(2, 1, 2, 1, 0)).result.level, 'mid');
  assert.equal(evaluate(s, v(2, 1, 2, 1, 1)).total, 7);
  assert.equal(evaluate(s, v(2, 1, 2, 1, 1)).result.level, 'high');
});

test('Wells LE two-tier cut-off at 4', () => {
  const s = byId['wells-le'];
  const four = evaluate(s, { hr: true, immo: true, hemo: true });
  assert.equal(four.total, 4);
  assert.equal(four.result.level, 'low');
  const r = evaluate(s, { hr: true, immo: true, prev: true });
  assert.equal(r.total, 4.5);
  assert.equal(r.result.level, 'high');
  assert.match(r.result.text, /mittel/);
});

test('Wells TVT with negative alternative diagnosis', () => {
  const s = byId['wells-tvt'];
  const r = evaluate(s, { tend: true, leg: true, alt: true });
  assert.equal(r.total, 0);
  assert.equal(r.result.level, 'low');
  assert.equal(evaluate(s, { tend: true, leg: true }).result.level, 'high');
});

test('NIHSS sums all 15 items, UN counts as 0 and is reported', () => {
  const s = byId.nihss;
  assert.equal(s.items.length, 15);
  const zero = Object.fromEntries(s.items.map((i) => [i.id, 0]));
  assert.equal(evaluate(s, zero).total, 0);
  const worst = Object.fromEntries(s.items.map((i) => {
    const pts = i.options.map((o) => o.points);
    return [i.id, pts.indexOf(Math.max(...pts))];
  }));
  assert.equal(evaluate(s, worst).total, 42);
  const un = evaluate(s, Object.assign({}, zero, { '5a': 5, '9': 2 }));
  assert.equal(un.total, 2);
  assert.equal(un.untestable.length, 1);
  assert.equal(un.result.level, 'low');
  assert.equal(evaluate(s, Object.assign({}, zero, { '1a': 1 })).complete, true);
  const partial = Object.assign({}, zero);
  delete partial['11'];
  assert.equal(evaluate(s, partial).complete, false);
});

test('German number format', () => {
  assert.equal(formatPoints(4.5), '4,5');
  assert.equal(formatPoints(-2), '−2');
});

test('every score has group, usage, sources and unique id', () => {
  assert.equal(new Set(SCORES.map((s) => s.id)).size, SCORES.length);
  SCORES.forEach((s) => {
    assert.ok(GROUPS.includes(s.group), s.id + ' group');
    assert.ok(s.usage && s.usage.when.length > 40, s.id + ' usage');
    assert.ok(s.sources.length > 0, s.id + ' sources');
  });
});

test('new maxima', () => {
  assert.equal(byId.gcs.max, 15);
  assert.equal(byId.centor.max, 5);
  assert.equal(byId.cha2ds2va.max, 8);
  assert.equal(byId.hasbled.max, 9);
  assert.equal(byId.perc.max, 8);
  assert.equal(byId.abcd2.max, 7);
  assert.equal(byId['child-pugh'].max, 15);
  assert.equal(byId.sofa.max, 24);
  assert.equal(byId.meld.max, 40);
  assert.equal(byId.egfr.max, null);
});

test('GCS bands and untestable verbal response', () => {
  const s = byId.gcs;
  assert.equal(evaluate(s, { e: 0, v: 0, m: 0 }).total, 15);
  assert.equal(evaluate(s, { e: 0, v: 0, m: 0 }).result.level, 'low');
  assert.equal(evaluate(s, { e: 3, v: 4, m: 5 }).total, 3);
  const intubated = evaluate(s, { e: 1, v: 5, m: 1 });
  assert.equal(intubated.total, 9);
  assert.equal(intubated.untestable.length, 1);
  assert.match(intubated.result.text, /V1 \(T\)/);
  assert.equal(intubated.result.label, 'GCS 9T');
  assert.doesNotMatch(intubated.result.text, /Atemwegssicherung/);
  assert.equal(evaluate(s, { e: 2, v: 3, m: 3 }).result.level, 'high');
});

test('Centor/McIsaac age correction', () => {
  const s = byId.centor;
  const old = evaluate(s, { temp: true, age: 2 });
  assert.equal(old.total, 0);
  assert.equal(old.result.level, 'low');
  assert.equal(evaluate(s, { temp: true, cough: true, lk: true, tons: true, age: 0 }).result.level, 'high');
  assert.equal(evaluate(s, { temp: true, cough: true, age: 0 }).result.level, 'mid');
});

test('CHA2DS2-VA thresholds 0 / 1 / ≥ 2', () => {
  const s = byId.cha2ds2va;
  assert.equal(evaluate(s, { age: 0 }).result.level, 'low');
  assert.equal(evaluate(s, { age: 1 }).result.level, 'mid');
  assert.equal(evaluate(s, { age: 2 }).result.level, 'high');
  assert.equal(evaluate(s, { age: 0, stroke: true }).total, 2);
});

test('HAS-BLED rates and bands', () => {
  const s = byId.hasbled;
  assert.match(evaluate(s, {}).result.text, /1,13/);
  assert.equal(evaluate(s, { h: true, age: true }).result.level, 'mid');
  const r = evaluate(s, { h: true, age: true, drugs: true });
  assert.equal(r.result.level, 'high');
  assert.match(r.result.text, /3,74/);
  const all = Object.fromEntries(s.items.map((i) => [i.id, true]));
  assert.match(evaluate(s, all).result.text, /keine ausreichenden Daten/);
});

test('PERC is only negative with zero criteria', () => {
  assert.equal(evaluate(byId.perc, {}).result.label, 'PERC negativ');
  assert.equal(evaluate(byId.perc, { hormone: true }).result.label, 'PERC positiv');
});

test('ABCD² bands', () => {
  const s = byId.abcd2;
  assert.equal(evaluate(s, { age: true, c: 2, d: 0 }).result.level, 'low');
  assert.equal(evaluate(s, { age: true, bp: true, c: 2, d: 0 }).result.level, 'mid');
  assert.equal(evaluate(s, { age: true, bp: true, dm: true, c: 2, d: 2 }).result.level, 'high');
});

test('Child-Pugh classes', () => {
  const s = byId['child-pugh'];
  const v = (bili, alb, inr, asc, he) => ({ bili, alb, inr, asc, he });
  assert.equal(evaluate(s, v(0, 0, 0, 0, 0)).total, 5);
  assert.equal(evaluate(s, v(0, 1, 0, 0, 0)).result.label, 'Child-Pugh A');
  assert.equal(evaluate(s, v(1, 1, 0, 0, 0)).result.label, 'Child-Pugh B');
  assert.equal(evaluate(s, v(2, 2, 1, 1, 0)).result.label, 'Child-Pugh C');
});

test('number items: missing until entered, formula only when complete', () => {
  const s = byId.egfr;
  const partial = evaluate(s, { crea: 1 });
  assert.equal(partial.complete, false);
  assert.equal(partial.total, null);
  assert.deepEqual(partial.missing.map((i) => i.id), ['age', 'sex']);
});

test('eGFR CKD-EPI 2021 reference values', () => {
  const s = byId.egfr;
  const male = evaluate(s, { crea: 1.0, age: 50, sex: 1 });
  assert.equal(male.total, 92);
  assert.equal(male.result.label, 'KDIGO G1');
  const female = evaluate(s, { crea: 1.0, age: 50, sex: 0 });
  assert.equal(female.total, 69);
  assert.equal(evaluate(s, { crea: 2.5, age: 70, sex: 1 }).result.label, 'KDIGO G4');
});

test('MELD with floor, creatinine cap and dialysis', () => {
  const s = byId.meld;
  assert.equal(evaluate(s, { bili: 0.5, inr: 0.9, crea: 0.6 }).total, 6);
  assert.equal(evaluate(s, { bili: 3, inr: 1.5, crea: 1.5 }).total, 19);
  const capped = evaluate(s, { bili: 3, inr: 1.5, crea: 8 }).total;
  assert.equal(capped, evaluate(s, { bili: 3, inr: 1.5, crea: 1, dial: true }).total);
  assert.equal(evaluate(s, { bili: 40, inr: 6, crea: 4 }).total, 40);
});

test('SOFA organ points', () => {
  const s = byId.sofa;
  const healthy = { pao2: 95, fio2: 21, plt: 250, bili: 0.5, cv: 0, gcs: 0, crea: 0.8, uo: 0 };
  assert.equal(evaluate(s, healthy).total, 0);
  // P/F 150 without ventilation is capped at 2, with ventilation 3.
  assert.equal(evaluate(s, Object.assign({}, healthy, { pao2: 60, fio2: 40 })).total, 2);
  assert.equal(evaluate(s, Object.assign({}, healthy, { pao2: 60, fio2: 40, vent: true })).total, 3);
  const sick = { pao2: 60, fio2: 80, vent: true, plt: 40, bili: 7, cv: 4, gcs: 2, crea: 2.2, uo: 2 };
  // resp 4 + coag 3 + liver 3 + cv 4 + cns 2 + renal max(2, 4)
  const r = evaluate(s, sick);
  assert.equal(r.total, 20);
  assert.equal(r.result.level, 'high');
  assert.match(r.result.text, /Niere 4/);
});

test('Anion gap with albumin correction and delta ratio', () => {
  const s = byId['anion-gap'];
  const normal = evaluate(s, { na: 140, cl: 104, hco3: 24 });
  assert.equal(normal.total, 12);
  assert.equal(normal.result.level, 'low');
  const hyperchloremic = evaluate(s, { na: 140, cl: 115, hco3: 15 });
  assert.equal(hyperchloremic.result.level, 'mid');
  assert.match(hyperchloremic.result.text, /hyperchloräm/);
  const lactic = evaluate(s, { na: 140, cl: 100, hco3: 12 });
  assert.equal(lactic.total, 28);
  assert.equal(lactic.result.level, 'high');
  assert.match(lactic.result.text, /Delta-Ratio 1,3/);
  const corrected = evaluate(s, { na: 140, cl: 104, hco3: 24, alb: 2.4 });
  assert.equal(corrected.total, 17);
  assert.equal(corrected.name, 'AG korrigiert');
});

test('Urine indices: prerenal pattern', () => {
  const s = byId.urin;
  // FENa = 10 × 2 / (140 × 100) × 100 = 0,14 %; U/P creatinine 50
  const r = evaluate(s, { sna: 140, screa: 2, una: 10, ucrea: 100, uosm: 650 });
  assert.equal(r.total, 0.14);
  assert.equal(r.name, 'FENa');
  assert.equal(r.result.label, 'Prärenales Muster');
  assert.equal(r.result.level, 'low');
  assert.deepEqual(r.result.rows.map((x) => x.name), ['FENa', 'U/P-Kreatinin', 'Urin-Natrium', 'Urin-Osmolalität']);
  assert.ok(r.result.rows.every((x) => x.level === 'low'));
  assert.match(r.result.text, /3 von 3 weiteren Indizes passen dazu\./);
});

test('Urine indices: renal pattern and grey zone', () => {
  const s = byId.urin;
  // FENa = 60 × 3 / (135 × 30) × 100 = 4,44 %; U/P 10
  const renal = evaluate(s, { sna: 135, screa: 3, una: 60, ucrea: 30 });
  assert.equal(renal.total, 4.44);
  assert.equal(renal.result.label, 'Renales Muster');
  const grey = evaluate(s, { sna: 140, screa: 2, una: 21, ucrea: 30 });
  assert.equal(grey.result.label, 'Nicht eindeutig');
  assert.match(grey.result.text, /FENa im Graubereich/);
});

test('Urine indices: diuretics switch to FEUrea', () => {
  const s = byId.urin;
  const base = { sna: 140, screa: 2, una: 80, ucrea: 100, diur: true };
  const noUrea = evaluate(s, base);
  assert.equal(noUrea.result.label, 'Nicht verwertbar');
  assert.equal(noUrea.result.rows[0].level, 'pending');
  // FEUrea = 500 × 2 / (100 × 100) × 100 = 10 %
  const r = evaluate(s, Object.assign({ surea: 100, uurea: 500 }, base));
  assert.equal(r.name, 'FEUrea');
  assert.equal(r.total, 10);
  assert.equal(r.result.label, 'Prärenales Muster');
  assert.ok(r.result.rows.some((x) => x.name === 'BUN/Kreatinin'));
});

test('Urine anion gap', () => {
  const s = byId.urin;
  const row = (v) => evaluate(s, Object.assign({ sna: 140, screa: 1, ucrea: 100 }, v)).result.rows.find((x) => x.name === 'Urin-Anionenlücke');
  assert.equal(row({ una: 30, uk: 40, ucl: 100 }).value, '−30 mmol/l');
  assert.match(row({ una: 30, uk: 40, ucl: 100 }).note, /^negativ/);
  assert.match(row({ una: 60, uk: 30, ucl: 60 }).note, /^positiv/);
  assert.match(row({ una: 10, uk: 30, ucl: 20 }).note, /nicht verwertbar/);
  assert.equal(row({ una: 30 }), undefined);
});

test('summary text for documentation', () => {
  assert.equal(
    summaryText(byId.qsofa, { af: true, sbp: true }),
    'qSOFA: 2/3 Punkte – qSOFA positiv\nErfüllt: Atemfrequenz ≥ 22/min (+1), Systolischer Blutdruck ≤ 100 mmHg (+1)');
  assert.equal(
    summaryText(byId.perc, {}),
    'PERC: 0/8 Punkte – PERC negativ\nErfüllt: keine Kriterien');
  assert.equal(summaryText(byId.heart, { h: 1 }), null);
  const egfr = summaryText(byId.egfr, { crea: 1.04, age: 50, sex: 1 });
  assert.match(egfr, /^eGFR: \d+ ml\/min\/1,73 m² – KDIGO G\d/);
  assert.match(egfr, /Serumkreatinin: 1,04 mg\/dl/);
  assert.match(egfr, /Geschlecht: Männlich$/);
  const meld = summaryText(byId.meld, { bili: 2, inr: 1.2, crea: 1, dial: false });
  assert.match(meld, /Nierenersatztherapie: nein/);
  const urin = summaryText(byId.urin, { sna: 140, screa: 2, una: 10, ucrea: 100 }).split('\n');
  assert.equal(urin[0], 'FENa: 0,14 % – Prärenales Muster');
  assert.equal(urin[1], 'FENa: 0,14 % – prärenal');
  assert.ok(urin.includes('Werte:'));
  assert.ok(urin.includes('Urin-Kreatinin: 100 mg/dl'));
  assert.ok(urin.includes('Diuretika in den letzten 24 Stunden: nein'));
});

console.log(`\n${passed} tests passed`);
