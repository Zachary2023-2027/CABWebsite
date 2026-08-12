// DOM wiring and the render loop.
// Every mutation re-derives layout, pricing, and the drawing from state —
// there is no partial DOM patching to keep in sync.

import {
  COUNTERTOPS, DOOR_STYLES, FINISHES, GROUPS, HARDWARE, TYPES,
  doorStyle, finish, hardware,
} from './catalog.js';
import * as S from './state.js';
import { layout, warnings } from './layout.js';
import { summarize } from './pricing.js';
import { esc, paletteIcon, scene } from './preview.js';
import { fmtFeet, fmtLen, fmtMoney, pct } from './format.js';

const $ = (sel) => document.querySelector(sel);
const CM = 2.54;

let state = S.load();

const el = {
  palette: $('#palette'), preview: $('#preview'), warnings: $('#warnings'),
  stats: $('#stats'), items: $('#items'), summary: $('#summary'),
  quote: $('#quote'), itemCount: $('#itemCount'),
  doorStyle: $('#doorStyle'), finishes: $('#finishes'),
  hardware: $('#hardware'), countertop: $('#countertop'),
  counterOn: $('#counterOn'), installOn: $('#installOn'), taxRate: $('#taxRate'),
  wallW: $('#wallW'), wallH: $('#wallH'), preset: $('#preset'),
  units: $('#units'), theme: $('#theme'),
};

// ---- unit conversion for numeric inputs --------------------------------

const toDisplay = (inches) =>
  state.units === 'cm' ? Math.round(inches * CM * 10) / 10 : Math.round(inches * 10) / 10;
const fromDisplay = (v) => (state.units === 'cm' ? Number(v) / CM : Number(v));

// ---- one-time setup -----------------------------------------------------

function fillSelect(node, list, labelFn = (o) => o.name) {
  node.innerHTML = list.map((o) => `<option value="${esc(o.id)}">${esc(labelFn(o))}</option>`).join('');
}

function initTheme() {
  const saved = localStorage.getItem('kcb.theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
}

function initControls() {
  fillSelect(el.doorStyle, DOOR_STYLES);
  fillSelect(el.hardware, HARDWARE, (o) => (o.price ? `${o.name} · $${o.price}/pull` : o.name));
  fillSelect(el.countertop, COUNTERTOPS, (o) => `${o.name} · $${o.pricePerLf}/lf`);

  el.finishes.innerHTML = FINISHES.map((f) => `
    <button type="button" class="swatch" role="radio" data-finish="${esc(f.id)}"
            style="background:${f.door}" title="${esc(f.name)}" aria-label="${esc(f.name)}">
      <span>${esc(f.name.replace('Painted ', ''))}</span>
    </button>`).join('');
}

/** Push state values into the form controls. */
function syncControls() {
  el.doorStyle.value = state.style.door;
  el.hardware.value = state.style.hardware;
  el.countertop.value = state.counter.material;
  el.counterOn.checked = state.counter.enabled;
  el.installOn.checked = state.options.install;
  el.taxRate.value = Math.round(state.options.taxRate * 10000) / 100;
  el.wallW.value = toDisplay(state.wall.width);
  el.wallH.value = toDisplay(state.wall.height);
  el.preset.value = String(state.wall.width);
  el.units.textContent = state.units;

  for (const s of el.finishes.querySelectorAll('.swatch')) {
    s.setAttribute('aria-checked', String(s.dataset.finish === state.style.finish));
  }
}

// ---- rendering ----------------------------------------------------------

let paletteKey = '';

function renderPalette() {
  const key = [state.style.door, state.style.finish, state.style.hardware, state.units].join('|');
  if (key === paletteKey) return;
  paletteKey = key;

  const ds = doorStyle(state.style.door);
  const fin = finish(state.style.finish);
  const hw = hardware(state.style.hardware);

  el.palette.innerHTML = GROUPS.map((g) => {
    const cards = TYPES.filter((t) => t.group === g.id).map((t) => `
      <button type="button" class="card" data-add="${esc(t.id)}" title="${esc(t.short)}">
        <span class="thumb">${paletteIcon(t, ds, fin, hw)}</span>
        <span class="cname">${esc(t.name)}</span>
        <span class="cmeta">${esc(fmtLen(t.defaultWidth, state.units))}</span>
      </button>`).join('');
    return `<section class="group"><h3>${esc(g.label)}</h3><div class="grid">${cards}</div></section>`;
  }).join('');
}

function renderItems(sum) {
  if (!sum.lines.length) {
    el.items.innerHTML = '<li class="empty">No cabinets yet — add one from the catalog.</li>';
    return;
  }

  el.items.innerHTML = sum.lines.map((l, i) => {
    const { type: t, item: it } = l;
    const opts = (values, current) => values
      .map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>${esc(fmtLen(v, state.units))}</option>`)
      .join('');

    const heightSel = t.heights
      ? `<select class="mini h" data-size="height" data-uid="${esc(it.uid)}" aria-label="${esc(t.name)} height">
           ${opts(t.heights, it.height ?? t.defaultHeight)}</select>`
      : '';

    return `<li class="item${state.selected === it.uid ? ' is-selected' : ''}" data-uid="${esc(it.uid)}">
      <span class="pos">${i + 1}</span>
      <span class="iname">${esc(t.name)}</span>
      <span class="irow">${esc(t.row)}</span>
      <select class="mini w" data-size="width" data-uid="${esc(it.uid)}" aria-label="${esc(t.name)} width">
        ${opts(t.widths, l.w)}</select>
      ${heightSel}
      <span class="iprice">${t.appliance ? '—' : esc(fmtMoney(l.total))}</span>
      <span class="iacts">
        <button type="button" data-act="up"   data-uid="${esc(it.uid)}" title="Move left"  aria-label="Move ${esc(t.name)} left">↑</button>
        <button type="button" data-act="down" data-uid="${esc(it.uid)}" title="Move right" aria-label="Move ${esc(t.name)} right">↓</button>
        <button type="button" data-act="dup"  data-uid="${esc(it.uid)}" title="Duplicate"  aria-label="Duplicate ${esc(t.name)}">⧉</button>
        <button type="button" data-act="del"  data-uid="${esc(it.uid)}" title="Remove"     aria-label="Remove ${esc(t.name)}">✕</button>
      </span>
    </li>`;
  }).join('');

  const sel = el.items.querySelector('.item.is-selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function renderSummary(sum) {
  const row = (label, note, value) =>
    `<tr><td>${esc(label)}${note ? ` <span class="note">${esc(note)}</span>` : ''}</td><td>${esc(value)}</td></tr>`;

  const rows = [
    row('Cabinets', `${sum.count} units`, fmtMoney(sum.cabinets)),
    row('Hardware', `${sum.pulls} pulls`, fmtMoney(sum.hardware)),
  ];
  if (state.counter.enabled) {
    rows.push(row('Countertop', `${fmtFeet(sum.counterInches, state.units)} ${sum.countertopName}`, fmtMoney(sum.countertop)));
  }
  if (state.options.install) {
    rows.push(row('Installation', pct(state.options.installRate), fmtMoney(sum.install)));
  }
  rows.push(`<tr class="rule"><td>Subtotal</td><td>${esc(fmtMoney(sum.subtotal))}</td></tr>`);
  rows.push(row('Tax', pct(state.options.taxRate), fmtMoney(sum.tax)));
  rows.push(`<tr class="total"><td>Total</td><td>${esc(fmtMoney(sum.total))}</td></tr>`);

  el.summary.innerHTML = rows.join('');
}

function renderStats(lay, sum) {
  const cells = [
    ['Cabinets', String(sum.count)],
    ['Base run', fmtFeet(lay.baseRun, state.units)],
    ['Wall run', fmtFeet(lay.wallRun, state.units)],
    ['Estimate', fmtMoney(sum.total)],
  ];
  el.stats.innerHTML = cells
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join('');
}

function renderWarnings(lay) {
  const list = warnings(state, lay);
  el.warnings.innerHTML = list
    .map((w) => `<div class="warn-row ${w.level}"><span class="tag">${w.level === 'error' ? 'Fix' : 'Check'}</span><span>${esc(w.text)}</span></div>`)
    .join('');
}

function renderQuote(sum) {
  const head = '<tr><th>#</th><th>Item</th><th>Size</th><th>Qty</th><th>Price</th></tr>';
  const body = sum.lines.map((l, i) => {
    const size = l.type.heights
      ? `${fmtLen(l.w, state.units)} × ${fmtLen(l.h, state.units)}`
      : fmtLen(l.w, state.units);
    return `<tr><td>${i + 1}</td><td>${esc(l.type.name)}</td><td>${esc(size)}</td><td>1</td><td>${esc(l.type.appliance ? '—' : fmtMoney(l.total))}</td></tr>`;
  }).join('');
  const foot = `<tr><td colspan="4"><strong>Total</strong></td><td><strong>${esc(fmtMoney(sum.total))}</strong></td></tr>`;
  el.quote.innerHTML = head + body + foot;
}

function render() {
  const lay = layout(state.items, state.wall);
  const sum = summarize(state, lay);

  renderPalette();
  el.preview.innerHTML = scene(state, lay);
  renderWarnings(lay);
  renderStats(lay, sum);
  renderItems(sum);
  renderSummary(sum);
  renderQuote(sum);
  el.itemCount.textContent = sum.lines.length ? `· ${sum.lines.length}` : '';

  S.save(state);
}

// ---- events -------------------------------------------------------------

el.palette.addEventListener('click', (e) => {
  const card = e.target.closest('[data-add]');
  if (!card) return;
  S.addItem(state, card.dataset.add);
  render();
});

el.items.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (btn) {
    const { act, uid } = btn.dataset;
    if (act === 'up') S.moveItem(state, uid, -1);
    else if (act === 'down') S.moveItem(state, uid, 1);
    else if (act === 'dup') S.duplicateItem(state, uid);
    else if (act === 'del') S.removeItem(state, uid);
    render();
    return;
  }
  const li = e.target.closest('.item');
  if (li && !e.target.closest('select')) {
    state.selected = state.selected === li.dataset.uid ? null : li.dataset.uid;
    render();
  }
});

el.items.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-size]');
  if (!sel) return;
  S.setItemSize(state, sel.dataset.uid, sel.dataset.size, sel.value);
  state.selected = sel.dataset.uid;
  render();
});

el.preview.addEventListener('click', (e) => {
  const unit = e.target.closest('[data-uid]');
  state.selected = unit && state.selected !== unit.dataset.uid ? unit.dataset.uid : null;
  render();
});

el.finishes.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-finish]');
  if (!sw) return;
  state.style.finish = sw.dataset.finish;
  syncControls();
  render();
});

el.doorStyle.addEventListener('change', () => { state.style.door = el.doorStyle.value; render(); });
el.hardware.addEventListener('change', () => { state.style.hardware = el.hardware.value; render(); });
el.countertop.addEventListener('change', () => { state.counter.material = el.countertop.value; render(); });
el.counterOn.addEventListener('change', () => { state.counter.enabled = el.counterOn.checked; render(); });
el.installOn.addEventListener('change', () => { state.options.install = el.installOn.checked; render(); });

el.taxRate.addEventListener('change', () => {
  const v = Math.min(25, Math.max(0, Number(el.taxRate.value) || 0));
  state.options.taxRate = v / 100;
  syncControls();
  render();
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

el.wallW.addEventListener('change', () => {
  state.wall.width = clamp(Math.round(fromDisplay(el.wallW.value)), 24, 600);
  syncControls();
  render();
});

el.wallH.addEventListener('change', () => {
  state.wall.height = clamp(Math.round(fromDisplay(el.wallH.value)), 72, 144);
  syncControls();
  render();
});

el.preset.addEventListener('change', () => {
  state.wall.width = Number(el.preset.value);
  syncControls();
  render();
});

el.units.addEventListener('click', () => {
  state.units = state.units === 'in' ? 'cm' : 'in';
  syncControls();
  render();
});

el.theme.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('kcb.theme', root.dataset.theme);
});

$('#reset').addEventListener('click', () => {
  if (!confirm('Discard this layout and start from the sample kitchen?')) return;
  state = S.starterState();
  paletteKey = '';
  syncControls();
  render();
});

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kitchen-layout.json';
  a.click();
  URL.revokeObjectURL(url);
});

$('#print').addEventListener('click', () => window.print());

document.addEventListener('keydown', (e) => {
  if (!state.selected) return;
  if (e.target.closest('input, select, textarea')) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    S.removeItem(state, state.selected);
    render();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    S.moveItem(state, state.selected, e.key === 'ArrowLeft' ? -1 : 1);
    render();
  }
});

// ---- boot ---------------------------------------------------------------

initTheme();
initControls();
syncControls();
render();
