// Browser test: enters every worked example through the real interface in a
// headless Chrome or Edge at phone width and checks the displayed result, the
// layout and the absence of script errors. No dependencies.
//
// Run with: node tests/ui.test.js   (browser path via CHROME_PATH if needed)
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const { SCORES, formatPoints } = require('../js/scores.js');
const { EXAMPLES, resolveExample } = require('../js/examples.js');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const paths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const found = paths.find((p) => fs.existsSync(p));
  if (found) return found;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      return execSync(`command -v ${name}`, { encoding: 'utf8' }).trim();
    } catch (e) { /* try next */ }
  }
  throw new Error('No Chrome/Edge found – set CHROME_PATH');
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'notfallrechner-ui-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
  if (process.env.CI) args.push('--no-sandbox');
  const proc = spawn(findBrowser(), args, { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch (e) { await sleep(100); }
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || expression);
    return m.result.result.value;
  };
  const close = () => { ws.close(); proc.kill(); };
  return { send, evaluate, errors, close };
}

// Runs inside the page: fills one example through the form, item by item, so
// conditional inputs appear in the right order. Returns what the bar shows.
const PAGE_HELPERS = `
window.__runExample = async (id, values) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.getElementById('new-patient').click();
  if (location.hash !== '#' + id) { location.hash = id; await wait(120); }
  // Fits = nothing clipped and at most two lines of text (lines counted from the
  // text layout, so it does not depend on font metrics or zoom).
  const lines = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
  };
  const fits = (el) => !el || (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 && lines(el) <= 2);
  const emptyFits = fits(document.querySelector('#bar .bar-label'));
  const score = KlinikScores.SCORES.find((s) => s.id === id);
  for (const item of score.items) {
    if (!(item.id in values)) continue;
    const v = values[item.id];
    if (item.type === 'bool') {
      const row = document.querySelector('.row[data-id="' + item.id + '"]');
      if (!row) throw new Error(id + ': row ' + item.id + ' missing');
      if ((row.getAttribute('aria-pressed') === 'true') !== !!v) row.click();
    } else if (item.type === 'choice') {
      const opt = document.querySelectorAll('fieldset[data-id="' + item.id + '"] .option')[v];
      if (!opt) throw new Error(id + ': option ' + item.id + '/' + v + ' missing');
      opt.click();
    } else if (item.type === 'number') {
      const input = document.getElementById('num-' + item.id);
      if (!input) throw new Error(id + ': input ' + item.id + ' missing');
      input.value = String(v).replace('.', ',');
      input.dispatchEvent(new Event('input'));
    }
    await wait(10);
  }
  await wait(30);
  const bar = document.getElementById('bar');
  const label = bar.querySelector('.bar-label');
  const total = bar.querySelector('.bar-total');
  return {
    label: label ? label.textContent : null,
    total: total ? total.textContent : null,
    labelCut: !fits(label),
    emptyCut: !emptyFits,
    barOverflow: bar.scrollWidth > bar.clientWidth + 1,
    pageOverflow: document.documentElement.scrollWidth > innerWidth,
    copy: !!document.querySelector('.copy'),
  };
};
1`;

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const b = await launch();
  const failures = [];
  const warnings = [];
  const fail = (msg) => { failures.push(msg); console.log('FAIL ' + msg); };
  const ok = (msg) => console.log('ok   ' + msg);

  try {
    await b.send('Runtime.enable');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await b.send('Page.navigate', { url: base });
    await sleep(800);

    const cards = await b.evaluate("document.querySelectorAll('.home-card').length");
    if (cards === SCORES.length) ok(`start page lists all ${cards} calculators`);
    else fail(`start page shows ${cards} of ${SCORES.length} calculators`);

    await b.evaluate(PAGE_HELPERS);
    // UI_TEST_FONT forces a wide font to reproduce layouts of other systems,
    // e.g. UI_TEST_FONT=Verdana mimics the wider Linux fonts used in CI.
    if (process.env.UI_TEST_FONT) {
      await b.evaluate(`{ const st = document.createElement('style'); st.textContent = 'body, button, input { font-family: ${process.env.UI_TEST_FONT} !important; }'; document.head.appendChild(st); } 1`);
    }
    let count = 0;
    for (const large of [false, true]) {
    await b.evaluate(`document.documentElement.classList.toggle('large-text', ${large}); 1`);
    for (const score of SCORES) {
      for (const [n, ex] of (EXAMPLES[score.id] || []).entries()) {
        const where = `${score.id} #${n + 1}${large ? ' (große Schrift)' : ''}`;
        const values = resolveExample(score, ex.values);
        let r;
        try {
          r = await b.evaluate(`__runExample(${JSON.stringify(score.id)}, ${JSON.stringify(values)})`);
        } catch (e) {
          fail(`${where}: ${e.message}`);
          continue;
        }
        count++;
        if (r.label !== ex.expect.label) fail(`${where}: shows "${r.label}", expected "${ex.expect.label}"`);
        if (ex.expect.total !== undefined && !score.rule && r.total !== formatPoints(ex.expect.total)) fail(`${where}: shows ${r.total}, expected ${formatPoints(ex.expect.total)}`);
        if (r.pageOverflow) fail(`${where}: page wider than the screen`);
        if (r.barOverflow) fail(`${where}: result bar overflows`);
        if (!r.copy) fail(`${where}: no copy button`);
        if (r.labelCut) fail(`${where}: label "${r.label}" does not fit in the result bar`);
        if (r.emptyCut && n === 0) fail(`${where}: label of the empty form does not fit in the result bar`);
      }
    }
    }
    await b.evaluate("document.documentElement.classList.remove('large-text'); 1");
    ok(`${count} worked examples entered through the interface (normal and large text)`);

    await b.evaluate("document.getElementById('text-size').click(); 1");
    await sleep(100);
    const large = await b.evaluate("JSON.stringify({ on: document.documentElement.classList.contains('large-text'), overflow: document.documentElement.scrollWidth > innerWidth })");
    const lt = JSON.parse(large);
    if (lt.on && !lt.overflow) ok('larger text without horizontal overflow');
    else fail(`larger text: ${large}`);
    await b.evaluate("document.getElementById('text-size').click(); 1");

    await b.send('Page.navigate', { url: base + 'pruefung.html' });
    await sleep(800);
    const review = JSON.parse(await b.evaluate("JSON.stringify({ cards: document.querySelectorAll('.review-card').length, progress: document.getElementById('progress').textContent, bad: document.querySelectorAll('.review-example[data-ok=\"false\"]').length })"));
    if (review.cards === SCORES.length && review.bad === 0 && /Alle Beispielfälle stimmen/.test(review.progress)) ok(`review page: ${review.cards} calculators, all examples match`);
    else fail(`review page: ${JSON.stringify(review)}`);

    if (b.errors.length) b.errors.forEach((e) => fail('script error: ' + e));
    else ok('no script errors');
  } finally {
    b.close();
    server.close();
  }

  warnings.forEach((w) => console.log('note ' + w));
  if (failures.length) {
    console.log(`\n${failures.length} UI check(s) failed`);
    process.exit(1);
  }
  console.log('\nUI checks passed');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
