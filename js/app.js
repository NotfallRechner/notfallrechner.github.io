(function () {
  'use strict';

  const { SCORES, GROUPS, evaluate, formatPoints, formatNumber, summaryText } = window.KlinikScores;
  const $ = (id) => document.getElementById(id);
  const nav = $('nav');
  const form = $('form');
  const bar = $('bar');
  const detail = $('detail');
  const usage = $('usage');
  const favBtn = $('fav');
  const search = $('search');
  const searchInput = $('search-input');
  const searchList = $('search-list');

  const valuesById = {};
  // Text and unit of number fields as typed, so switching scores keeps them.
  const rawById = {};
  let score = null;

  // Only UI preferences are stored, never patient values.
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('klinikscores.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('klinikscores.' + key, JSON.stringify(value));
      } catch (e) { /* storage unavailable, e.g. private mode */ }
    },
  };
  let favs = store.get('favs', []);
  if (!Array.isArray(favs)) favs = [];
  const unitPrefs = store.get('units', {}) || {};

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function signed(points) {
    return (points > 0 ? '+' : '') + formatPoints(points);
  }

  function isFav(id) {
    return favs.includes(id);
  }

  function toggleFav(id) {
    favs = isFav(id) ? favs.filter((f) => f !== id) : favs.concat(id);
    store.set('favs', favs);
    renderNav();
    renderFav();
    if (search.open) renderSearch();
  }

  // Favourites first, then the rest in their usual order.
  function renderNav() {
    const ordered = SCORES.filter((s) => isFav(s.id)).concat(SCORES.filter((s) => !isFav(s.id)));
    nav.replaceChildren(...ordered.map((s) => {
      const a = el('a', isFav(s.id) ? 'tab fav' : 'tab', s.short);
      a.href = '#' + s.id;
      a.dataset.id = s.id;
      if (score && s.id === score.id) a.setAttribute('aria-current', 'page');
      return a;
    }));
  }

  function renderFav() {
    const on = isFav(score.id);
    favBtn.setAttribute('aria-pressed', String(on));
    favBtn.setAttribute('aria-label', on ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen');
    favBtn.title = favBtn.getAttribute('aria-label');
  }

  function boolRow(item, values) {
    const btn = el('button', 'row');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(!!values[item.id]));
    const text = el('span', 'row-text');
    text.appendChild(el('span', 'row-label', item.label));
    if (item.hint) text.appendChild(el('span', 'hint', item.hint));
    btn.appendChild(text);
    if (item.points !== undefined) btn.appendChild(el('span', 'pts', signed(item.points)));
    btn.appendChild(el('span', 'switch'));
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
    fs.appendChild(el('legend', 'choice-label', item.label));
    if (item.hint) fs.appendChild(el('p', 'hint', item.hint));
    const grid = el('div', 'options');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', item.label);
    item.options.forEach((o, idx) => {
      const b = el('button', 'option');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(values[item.id] === idx));
      const badge = o.badge || (o.untestable ? 'UN' : o.points !== undefined ? formatPoints(o.points) : null);
      if (badge !== null) b.appendChild(el('span', 'opt-pts', badge));
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

  function parseNumber(text) {
    const s = text.trim().replace(',', '.');
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : null;
  }

  function unitKey(item) {
    return item.units.map((u) => u.label).join('|');
  }

  function numberBlock(item, values) {
    const raw = rawById[score.id];
    const units = item.units;
    const state = raw[item.id] || (raw[item.id] = { text: '', unit: Math.min(unitPrefs[unitKey(item)] || 0, Math.max(0, units.length - 1)) });

    const fs = el('fieldset', 'choice num');
    fs.dataset.id = item.id;
    fs.appendChild(el('legend', 'choice-label', item.label + (item.optional ? ' (optional)' : '')));
    if (item.hint) fs.appendChild(el('p', 'hint', item.hint));
    const row = el('div', 'num-row');
    const input = el('input', 'num-input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.enterKeyHint = 'next';
    input.id = 'num-' + item.id;
    input.setAttribute('aria-label', item.label);
    input.value = state.text;
    row.appendChild(input);
    const err = el('p', 'num-error');
    err.id = 'err-' + item.id;
    input.setAttribute('aria-describedby', err.id);

    function commit() {
      const u = units[state.unit];
      const n = parseNumber(state.text);
      const value = n === null ? null : n * (u ? u.factor : 1);
      // Small tolerance so a converted bound like 30 mg/dl ≙ 2652 µmol/l still counts as inside.
      const ok = value !== null && value >= item.min * 0.9999 && value <= item.max * 1.0001;
      if (ok) values[item.id] = value;
      else delete values[item.id];
      const bad = state.text.trim() !== '' && !ok;
      fs.classList.toggle('invalid', bad);
      input.setAttribute('aria-invalid', String(bad));
      const f = u ? u.factor : 1;
      const d = u ? u.decimals : 2;
      err.textContent = bad
        ? `Bitte einen Wert zwischen ${formatNumber(item.min / f, d)} und ${formatNumber(item.max / f, d)}${u ? ' ' + u.label : ''} eingeben.`
        : '';
      if (ok) fs.classList.remove('missing');
    }

    input.addEventListener('input', () => {
      state.text = input.value;
      commit();
      update();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const inputs = [...form.querySelectorAll('.num-input')];
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus();
      else input.blur();
    });

    if (units.length > 1) {
      const seg = el('div', 'units');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Einheit für ' + item.label);
      units.forEach((u, idx) => {
        const b = el('button', 'unit', u.label);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(idx === state.unit));
        b.addEventListener('click', () => {
          if (idx === state.unit) return;
          const v = values[item.id];
          state.unit = idx;
          unitPrefs[unitKey(item)] = idx;
          store.set('units', unitPrefs);
          if (v !== undefined) {
            state.text = formatNumber(v / u.factor, u.decimals);
            input.value = state.text;
          }
          seg.querySelectorAll('.unit').forEach((x, i) => x.setAttribute('aria-checked', String(i === idx)));
          commit();
          update();
        });
        seg.appendChild(b);
      });
      row.appendChild(seg);
    } else if (units.length === 1) {
      row.appendChild(el('span', 'unit-label', units[0].label));
    }

    fs.append(row, err);
    commit();
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
      item.type === 'bool' ? boolRow(item, values)
        : item.type === 'number' ? numberBlock(item, values)
        : choiceBlock(item, values)));
  }

  function renderUsage() {
    const body = el('div', 'usage-body');
    const when = el('p');
    when.append(el('strong', null, 'Anwenden: '), score.usage.when);
    body.appendChild(when);
    if (score.usage.not) {
      const not = el('p');
      not.append(el('strong', null, 'Grenzen: '), score.usage.not);
      body.appendChild(not);
    }
    usage.replaceChildren(el('summary', null, 'Wann anwenden?'), body);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return legacyCopy(text);
  }

  // Fallback for file://, older browsers and denied clipboard permission.
  function legacyCopy(text) {
    const ta = el('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  function copyButton() {
    const b = el('button', 'copy', 'Für Dokumentation kopieren');
    b.type = 'button';
    b.addEventListener('click', () => {
      const text = summaryText(score, valuesById[score.id]);
      copyText(text).then(
        () => { b.textContent = 'Kopiert ✓'; },
        () => { b.textContent = 'Kopieren nicht möglich'; });
      setTimeout(() => { b.textContent = 'Für Dokumentation kopieren'; }, 2000);
    });
    return b;
  }

  function update() {
    const r = evaluate(score, valuesById[score.id]);
    const level = r.complete ? r.result.level : 'pending';
    bar.dataset.level = level;
    detail.dataset.level = level;

    const label = r.complete
      ? r.result.label
      : `${r.missing.length} offen`;
    const suffix = score.unit || (r.max !== null ? '/ ' + formatPoints(r.max) : '');
    bar.replaceChildren(
      el('span', 'bar-name', r.name),
      el('span', 'bar-total', r.total === null ? '–' : formatPoints(r.total)),
      el('span', 'bar-max', suffix),
      el('span', 'bar-label', label));
    if (!r.complete) {
      const jump = el('button', 'bar-jump', 'Weiter');
      jump.type = 'button';
      jump.addEventListener('click', () => {
        const fs = form.querySelector(`fieldset[data-id="${CSS.escape(r.missing[0].id)}"]`);
        fs.classList.add('missing');
        fs.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = fs.querySelector('input');
        if (input) input.focus({ preventScroll: true });
      });
      bar.appendChild(jump);
    }

    const parts = [];
    if (r.complete) {
      const kicker = score.unit
        ? `${r.name}: ${formatPoints(r.total)} ${score.unit}`
        : r.max !== null
          ? `${r.name}: ${formatPoints(r.total)} von ${formatPoints(r.max)} Punkten`
          : `${r.name}: ${formatPoints(r.total)} Punkte`;
      parts.push(el('p', 'detail-kicker', kicker));
      parts.push(el('h2', 'detail-label', r.result.label));
      parts.push(el('p', 'detail-text', r.result.text));
      if (r.untestable.length) {
        parts.push(el('p', 'detail-warn', 'Nicht testbar: ' + r.untestable.map((i) => i.label).join(', ')));
      }
      parts.push(copyButton());
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
    rawById[score.id] = rawById[score.id] || {};
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
    renderFav();
    renderUsage();
    renderForm();
    update();
  }

  // --- Search ---------------------------------------------------------------

  // Folds case, accents and subscripts, so "cha2" finds "CHA₂DS₂-VA".
  function norm(s) {
    return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function matches(s, terms) {
    const hay = norm([s.short, s.title, s.subtitle, s.group, s.keywords].join(' '));
    return terms.every((t) => hay.includes(t));
  }

  function renderSearch() {
    const terms = norm(searchInput.value).split(/\s+/).filter(Boolean);
    const hits = SCORES.filter((s) => matches(s, terms));
    const sections = [];
    const groups = (terms.length ? [] : [['Favoriten', hits.filter((s) => isFav(s.id))]])
      .concat(GROUPS.map((g) => [g, hits.filter((s) => s.group === g)]));
    groups.forEach(([name, list]) => {
      if (!list.length) return;
      const sec = el('section', 'search-group');
      sec.appendChild(el('h2', null, name));
      list.forEach((s) => {
        const row = el('div', 'search-item');
        const a = el('a', 'search-link');
        a.href = '#' + s.id;
        a.append(el('span', 'search-name', s.title), el('span', 'hint', s.subtitle));
        if (score && s.id === score.id) a.setAttribute('aria-current', 'page');
        a.addEventListener('click', () => search.close());
        const star = el('button', 'star');
        star.type = 'button';
        star.setAttribute('aria-pressed', String(isFav(s.id)));
        star.setAttribute('aria-label', `${s.short} ${isFav(s.id) ? 'aus Favoriten entfernen' : 'zu Favoriten hinzufügen'}`);
        star.addEventListener('click', () => toggleFav(s.id));
        row.append(a, star);
        sec.appendChild(row);
      });
      sections.push(sec);
    });
    if (!sections.length) sections.push(el('p', 'search-empty', 'Kein Score gefunden.'));
    searchList.replaceChildren(...sections);
  }

  function openSearch() {
    searchInput.value = '';
    renderSearch();
    search.showModal();
    searchInput.focus();
  }

  $('search-open').addEventListener('click', openSearch);
  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = searchList.querySelector('.search-link');
    if (first) {
      location.hash = first.getAttribute('href');
      search.close();
    }
  });
  search.addEventListener('click', (e) => {
    if (e.target === search) search.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || search.open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea')) return;
    e.preventDefault();
    openSearch();
  });

  // --- Wiring ---------------------------------------------------------------

  favBtn.addEventListener('click', () => toggleFav(score.id));

  usage.open = store.get('usageOpen', true) !== false;
  usage.addEventListener('toggle', () => store.set('usageOpen', usage.open));

  $('reset').addEventListener('click', () => {
    valuesById[score.id] = {};
    rawById[score.id] = {};
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

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode is optional */ });
  }
})();
