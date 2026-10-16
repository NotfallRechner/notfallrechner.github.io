// Review page: everything a clinician needs to check one calculator, plus a
// local checklist that can be exported as a review log.
(function () {
  'use strict';

  const { SCORES, GROUPS, evaluate, totalText, formatPoints, formatNumber, summaryText } = window.KlinikScores;
  const { EXAMPLES, resolveExample } = window.NotfallExamples;
  const VERSION = window.NotfallVersion;
  const $ = (id) => document.getElementById(id);

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('notfallrechner.review.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('notfallrechner.review.' + key, JSON.stringify(value));
      } catch (e) { /* storage unavailable */ }
    },
  };
  const state = store.get('state', {}) || {};

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function signed(n) {
    return (n > 0 ? '+' : '') + formatPoints(n);
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // One line per input: what it is and how it scores.
  function criteria(score) {
    const ul = el('ul', 'review-criteria');
    score.items.forEach((item) => {
      if (item.type === 'heading') {
        ul.appendChild(el('li', 'review-crit-heading', item.label));
        return;
      }
      const li = el('li');
      const cond = item.when ? ' (nur in bestimmten Fällen abgefragt)' : '';
      if (item.type === 'bool') {
        li.append(el('strong', null, item.label), item.points !== undefined ? ` – ${signed(item.points)}` : ' – ja/nein');
      } else if (item.type === 'number') {
        const u = item.units[0];
        const unitText = u ? ` ${u.label}` : '';
        const others = item.units.slice(1).map((x) => x.label).join(', ');
        li.append(el('strong', null, item.label), ` – Zahl in${unitText || ' –'}${others ? ` (auch ${others})` : ''}, plausibel ${formatNumber(item.min, u ? u.decimals : 2)}–${formatNumber(item.max, u ? u.decimals : 2)}${item.optional ? ', optional' : ''}`);
      } else {
        li.appendChild(el('strong', null, item.label));
        const opts = el('ul');
        item.options.forEach((o) => {
          const pts = o.points !== undefined ? `${formatPoints(o.points)} – ` : '';
          opts.appendChild(el('li', null, `${pts}${o.label}${o.hint ? ` (${o.hint})` : ''}`));
        });
        li.appendChild(opts);
      }
      if (item.hint) li.append(el('span', 'hint', item.hint));
      if (cond) li.append(el('span', 'hint', cond.trim()));
      ul.appendChild(li);
    });
    return ul;
  }

  function exampleTable(score) {
    const box = el('div', 'review-examples');
    (EXAMPLES[score.id] || []).forEach((ex, n) => {
      const values = resolveExample(score, ex.values);
      const r = evaluate(score, values);
      const expectText = (ex.expect.total !== undefined ? `${formatPoints(ex.expect.total)} – ` : '') + ex.expect.label;
      const actualText = r.complete ? `${r.total !== null && !score.rule ? formatPoints(r.total) + ' – ' : ''}${r.result.label}` : 'unvollständig';
      const ok = r.complete
        && (ex.expect.total === undefined || r.total === ex.expect.total)
        && r.result.label === ex.expect.label
        && (!ex.expect.level || r.result.level === ex.expect.level)
        && (!ex.expect.name || r.name === ex.expect.name);
      const card = el('div', 'review-example');
      card.dataset.ok = String(ok);
      card.appendChild(el('h4', null, `Beispiel ${n + 1}`));
      const inputs = r.complete ? summaryText(score, values).split('\n').slice(1).filter((l) => l !== 'Werte:' && !(r.result.rows || []).some((row) => l.startsWith(row.name + ':'))) : [];
      const pre = el('pre', 'review-inputs', inputs.join('\n') || '(keine Angaben – alle Kriterien „nein“)');
      card.appendChild(pre);
      if (ex.note) card.appendChild(el('p', 'hint', 'Rechenweg: ' + ex.note));
      const res = el('p', 'review-result');
      res.append(el('span', null, `Erwartet: ${expectText}`), el('span', null, `App: ${actualText}`), el('span', 'review-ok', ok ? '✓' : '✗ Abweichung'));
      card.appendChild(res);
      box.appendChild(card);
    });
    return box;
  }

  function scoreCard(score) {
    const s = state[score.id] || {};
    const d = el('details', 'review-card');
    d.id = 'r-' + score.id;
    d.dataset.checked = String(!!s.checked);
    const sum = el('summary');
    const status = score.reviewed ? `geprüft ${score.reviewed.date} (${score.reviewed.by})` : s.checked ? 'hier abgehakt' : 'offen';
    sum.append(el('span', 'review-title', score.title), el('span', 'review-status', status));
    d.appendChild(sum);

    const body = el('div', 'review-body');
    body.appendChild(el('p', 'hint', `${score.group} · `));
    const open = el('a', null, 'Im Rechner öffnen');
    open.href = './#' + score.id;
    open.target = '_blank';
    body.lastChild.appendChild(open);

    body.appendChild(el('h3', null, 'Anwendung'));
    body.appendChild(el('p', null, score.usage.when));
    if (score.usage.not) body.appendChild(el('p', null, 'Grenzen: ' + score.usage.not));

    body.appendChild(el('h3', null, 'Kriterien und Punkte'));
    body.appendChild(criteria(score));

    body.appendChild(el('h3', null, 'Beispielfälle'));
    body.appendChild(exampleTable(score));

    if (score.notes && score.notes.length) {
      body.appendChild(el('h3', null, 'Hinweise in der App'));
      const ul = el('ul');
      score.notes.forEach((n) => ul.appendChild(el('li', null, n)));
      body.appendChild(ul);
    }

    body.appendChild(el('h3', null, 'Quellen'));
    if (!score.sources.length) body.appendChild(el('p', 'hint', 'Reine Rechenhilfe ohne Literaturquelle.'));
    score.sources.forEach((src) => {
      const a = el('a', 'review-source', src.label);
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener';
      body.appendChild(a);
    });

    const check = el('div', 'review-check');
    const label = el('label');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !!s.checked;
    label.append(box, ' Fachlich geprüft – Kriterien, Grenzwerte, Texte und Quellen stimmen');
    const note = el('textarea');
    note.rows = 3;
    note.placeholder = 'Anmerkungen oder gefundene Fehler (keine Patientendaten)';
    note.value = s.note || '';
    const save = () => {
      state[score.id] = { checked: box.checked, note: note.value };
      store.set('state', state);
      d.dataset.checked = String(box.checked);
      sum.querySelector('.review-status').textContent = score.reviewed ? status : box.checked ? 'hier abgehakt' : 'offen';
      renderProgress();
    };
    box.addEventListener('change', save);
    note.addEventListener('input', save);
    check.append(label, note);
    body.appendChild(check);

    d.appendChild(body);
    return d;
  }

  function renderProgress() {
    const done = SCORES.filter((s) => s.reviewed || (state[s.id] && state[s.id].checked)).length;
    const failed = SCORES.reduce((n, s) => n + (EXAMPLES[s.id] || []).filter((ex) => {
      const r = evaluate(s, resolveExample(s, ex.values));
      return !r.complete || r.result.label !== ex.expect.label || (ex.expect.total !== undefined && r.total !== ex.expect.total);
    }).length, 0);
    $('progress').textContent = `${done} von ${SCORES.length} Rechnern geprüft.` + (failed ? ` Achtung: ${failed} Beispielfälle weichen ab.` : ' Alle Beispielfälle stimmen.');
  }

  function render() {
    const onlyOpen = $('only-open').checked;
    const parts = [];
    GROUPS.forEach((g) => {
      const list = SCORES.filter((s) => s.group === g && !(onlyOpen && (s.reviewed || (state[s.id] && state[s.id].checked))));
      if (!list.length) return;
      parts.push(el('h2', 'review-group', g));
      list.forEach((s) => parts.push(scoreCard(s)));
    });
    $('list').replaceChildren(...parts);
    renderProgress();
  }

  function reviewLog() {
    const name = $('reviewer').value.trim() || '(Name fehlt)';
    const date = today();
    const lines = [`# Prüfprotokoll NotfallRechner`, '', `Prüfer/in: ${name}`, `Datum: ${date}`, `App-Version: ${VERSION.number}`, ''];
    const checked = SCORES.filter((s) => state[s.id] && state[s.id].checked);
    const open = SCORES.filter((s) => !s.reviewed && !(state[s.id] && state[s.id].checked));
    lines.push(`## Geprüft (${checked.length})`, '');
    checked.forEach((s) => lines.push(`- ${s.title} – \`reviewed: { date: '${date}', by: '${name}' },\` (id: ${s.id})`));
    const notes = SCORES.filter((s) => state[s.id] && state[s.id].note && state[s.id].note.trim());
    if (notes.length) {
      lines.push('', '## Anmerkungen', '');
      notes.forEach((s) => lines.push(`### ${s.title}`, '', state[s.id].note.trim(), ''));
    }
    lines.push('', `## Noch offen (${open.length})`, '');
    open.forEach((s) => lines.push(`- ${s.title}`));
    return lines.join('\n');
  }

  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2500);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    const ta = el('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  $('reviewer').value = store.get('reviewer', '');
  $('reviewer').addEventListener('input', () => store.set('reviewer', $('reviewer').value));
  $('only-open').addEventListener('change', render);
  $('copy-log').addEventListener('click', () => {
    copy(reviewLog()).then(() => toast('Prüfprotokoll kopiert'), () => toast('Kopieren nicht möglich'));
  });
  $('version').textContent = `Version ${VERSION.number}`;

  render();
  if (location.hash.startsWith('#r-')) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      target.open = true;
      target.scrollIntoView();
    }
  }

  // Exposed for the browser test.
  window.NotfallReview = { reviewLog, totalText };
})();
