// Run with: node tests/scores.test.js
const assert = require('node:assert/strict');
const { SCORES, evaluate, formatPoints } = require('../js/scores.js');

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

console.log(`\n${passed} tests passed`);
