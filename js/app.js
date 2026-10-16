(function () {
  'use strict';

  const { SCORES, evaluate, formatPoints } = window.KlinikScores;
  const $ = (id) => document.getElementById(id);
  const nav = $('nav');
  const form = $('form');
  const bar = $('bar');
  const detail = $('detail');

  const valuesById = {};
  let score = null;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function signed(points) {
    return (points > 0 ? '+' : '') + formatPoints(points);
  }

  function renderNav() {
    SCORES.forEach((s) => {
      const a = el('a', 'tab', s.short);
      a.href = '#' + s.id;
      a.dataset.id = s.id;
      nav.appendChild(a);
    });
  }

  function boolRow(item, values) {
    const btn = el('button', 'row');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(!!values[item.id]));
    const text = el('span', 'row-text');
    text.appendChild(el('span', 'row-label', item.label));
    if (item.hint) text.appendChild(el('span', 'hint', item.hint));
    btn.append(text, el('span', 'pts', signed(item.points)), el('span', 'switch'));
    btn.addEventListener('click', () => {
      values[item.id] = !values[item.id];
      btn.setAttribute('aria-pressed', String(values[item.id]));
      update();
    });
    return btn;
  }

  function choiceBlock(item, values) {
    const fs = el('fieldset', 'choice');
    fs.dataset.id = item.id;
    const legend = el('legend', 'choice-label', item.label);
    fs.appendChild(legend);
    if (item.hint) fs.appendChild(el('p', 'hint', item.hint));
    const grid = el('div', 'options');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', item.label);
    item.options.forEach((o, idx) => {
      const b = el('button', 'option');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(values[item.id] === idx));
      b.appendChild(el('span', 'opt-pts', o.untestable ? 'UN' : formatPoints(o.points)));
      const t = el('span', 'opt-text');
      t.appendChild(el('span', 'opt-label', o.label));
      if (o.hint) t.appendChild(el('span', 'hint', o.hint));
      b.appendChild(t);
      b.addEventListener('click', () => {
        const firstAnswer = values[item.id] === undefined;
        values[item.id] = idx;
        grid.querySelectorAll('.option').forEach((x, i) => x.setAttribute('aria-checked', String(i === idx)));
        fs.classList.remove('missing');
        update();
        if (firstAnswer) scrollToNextOpen(fs);
      });
      grid.appendChild(b);
    });
    fs.appendChild(grid);
    return fs;
  }

  // After a first answer, bring the next unanswered question into view so a
  // long score like the NIHSS can be tapped through without manual scrolling.
  function scrollToNextOpen(fs) {
    const values = valuesById[score.id];
    let next = fs.nextElementSibling;
    while (next && !(next.matches('fieldset') && values[next.dataset.id] === undefined)) {
      next = next.nextElementSibling;
    }
    if (next && next.getBoundingClientRect().top > window.innerHeight * 0.45) {
      next.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderForm() {
    const values = valuesById[score.id];
    form.replaceChildren(...score.items.map((item) =>
      item.type === 'bool' ? boolRow(item, values) : choiceBlock(item, values)));
  }

  function update() {
    const r = evaluate(score, valuesById[score.id]);
    const level = r.complete ? r.result.level : 'pending';
    bar.dataset.level = level;
    detail.dataset.level = level;

    const label = r.complete
      ? r.result.label
      : `${r.missing.length} offen`;
    bar.replaceChildren(
      el('span', 'bar-name', r.name),
      el('span', 'bar-total', formatPoints(r.total)),
      el('span', 'bar-max', '/ ' + formatPoints(r.max)),
      el('span', 'bar-label', label));
    if (!r.complete) {
      const jump = el('button', 'bar-jump', 'Weiter');
      jump.type = 'button';
      jump.addEventListener('click', () => {
        const fs = form.querySelector(`fieldset[data-id="${CSS.escape(r.missing[0].id)}"]`);
        fs.classList.add('missing');
        fs.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      bar.appendChild(jump);
    }

    const parts = [];
    if (r.complete) {
      parts.push(el('p', 'detail-kicker', `${r.name}: ${formatPoints(r.total)} von ${formatPoints(r.max)} Punkten`));
      parts.push(el('h2', 'detail-label', r.result.label));
      parts.push(el('p', 'detail-text', r.result.text));
      if (r.untestable.length) {
        parts.push(el('p', 'detail-warn', 'Nicht testbar (mit 0 gewertet): ' + r.untestable.map((i) => i.label).join(', ')));
      }
    } else {
      parts.push(el('h2', 'detail-label', 'Interpretation folgt'));
      parts.push(el('p', 'detail-text', 'Sobald alle Angaben gemacht sind, erscheint hier die Einordnung.'));
    }
    if (score.notes && score.notes.length) {
      const ul = el('ul', 'notes');
      score.notes.forEach((n) => ul.appendChild(el('li', null, n)));
      parts.push(ul);
    }
    const src = el('div', 'sources');
    src.appendChild(el('h3', null, score.sources.length > 1 ? 'Originalquellen' : 'Originalquelle'));
    score.sources.forEach((s) => {
      const a = el('a', null, s.label);
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      src.appendChild(a);
    });
    parts.push(src);
    detail.replaceChildren(...parts);
  }

  function select(id) {
    score = SCORES.find((s) => s.id === id) || SCORES[0];
    valuesById[score.id] = valuesById[score.id] || {};
    nav.querySelectorAll('.tab').forEach((a) => {
      if (a.dataset.id === score.id) {
        a.setAttribute('aria-current', 'page');
        a.scrollIntoView({ block: 'nearest', inline: 'center' });
      } else {
        a.removeAttribute('aria-current');
      }
    });
    $('title').textContent = score.title;
    $('subtitle').textContent = score.subtitle;
    document.title = score.short + ' · Klinische Scores';
    renderForm();
    update();
  }

  $('reset').addEventListener('click', () => {
    valuesById[score.id] = {};
    renderForm();
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('hashchange', () => {
    select(location.hash.slice(1));
    window.scrollTo(0, 0);
  });

  renderNav();
  select(location.hash.slice(1));
})();
