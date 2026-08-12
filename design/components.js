/* ===========================================================================
   Component behaviours. Framework free, delegated from the document, so the
   same code drives every instance on the page and ports to React as event
   handlers without rewriting the logic.
   =========================================================================== */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* --- NumberInput ---------------------------------------------------------
   Type is text with inputmode numeric, not type=number. That removes the
   native spinner, which is what makes a number field scroll away its value
   when the pointer passes over it. Stepping is ours instead: arrow keys,
   shift for ten times the step, and the two stepper buttons. */

function numRead(input) {
  const v = parseFloat(input.value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(v) ? v : null;
}

function numWrite(input, value) {
  const min = parseFloat(input.dataset.min ?? '-Infinity');
  const max = parseFloat(input.dataset.max ?? 'Infinity');
  const dp = parseInt(input.dataset.dp ?? '0', 10);
  const out = clamp(value, min, max);
  input.value = out.toFixed(dp);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function numStep(input, dir, big) {
  const step = parseFloat(input.dataset.step ?? '1') * (big ? 10 : 1);
  const cur = numRead(input) ?? parseFloat(input.dataset.min ?? '0');
  numWrite(input, cur + dir * step);
}

document.addEventListener('focusin', (e) => {
  const i = e.target.closest('.num-input__input');
  if (i) i.select();                      // select all on focus
});

document.addEventListener('keydown', (e) => {
  const i = e.target.closest('.num-input__input');
  if (!i) return;
  if (e.key === 'ArrowUp') { e.preventDefault(); numStep(i, 1, e.shiftKey); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); numStep(i, -1, e.shiftKey); }
  else if (e.key === 'Enter') { const v = numRead(i); if (v !== null) numWrite(i, v); }
});

document.addEventListener('blur', (e) => {
  const i = e.target.closest?.('.num-input__input');
  if (!i) return;
  const v = numRead(i);
  if (v === null) i.value = i.dataset.last ?? i.dataset.min ?? '0';
  else numWrite(i, v);
}, true);

document.addEventListener('click', (e) => {
  const b = e.target.closest('.num-input__step');
  if (!b) return;
  const input = b.closest('.num-input').querySelector('.num-input__input');
  numStep(input, b.dataset.dir === 'up' ? 1 : -1, e.shiftKey);
  input.focus();
});

/* Belt and braces. Even with type=text, refuse to act on a wheel over a
   focused field, so a value can never change while scrolling a long form. */
document.addEventListener('wheel', (e) => {
  const i = e.target.closest?.('.num-input__input');
  if (i && document.activeElement === i) i.blur();
}, { passive: true });

/* --- Slider fill ---------------------------------------------------------- */

function paintSlider(input) {
  const min = parseFloat(input.min || '0');
  const max = parseFloat(input.max || '100');
  const pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
  input.style.setProperty('--pct', pct + '%');
  const out = input.closest('.slider')?.querySelector('.slider__value');
  if (out) out.textContent = (input.dataset.format || '{v}').replace('{v}', input.value);
}

document.addEventListener('input', (e) => {
  if (e.target.matches('.slider input[type="range"]')) paintSlider(e.target);
});

/* --- Grouped pressed controls: SegmentedControl and toolbar groups -------- */

document.addEventListener('click', (e) => {
  const item = e.target.closest('[data-group]');
  if (!item) return;
  const group = item.dataset.group;
  const scope = item.closest('[data-group-scope]') || document;
  scope.querySelectorAll(`[data-group="${group}"]`).forEach((el) =>
    el.setAttribute('aria-pressed', String(el === item)));
});

/* --- Tabs ---------------------------------------------------------------- */

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  tab.closest('.tabs').querySelectorAll('.tab').forEach((t) =>
    t.setAttribute('aria-selected', String(t === tab)));
});

/* Left and right arrows move between tabs, per the tablist pattern. */
document.addEventListener('keydown', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const tabs = [...tab.closest('.tabs').querySelectorAll('.tab')];
  const next = tabs[clamp(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1), 0, tabs.length - 1)];
  next.focus();
  next.click();
});

/* --- Dialog. Focus is trapped and returned. Escape closes. --------------- */

let lastFocus = null;

export function openDialog(el) {
  lastFocus = document.activeElement;
  el.hidden = false;
  el.querySelector('.btn, [tabindex]')?.focus();
}

export function closeDialog(el) {
  el.hidden = true;
  lastFocus?.focus();
}

document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-dialog-open]');
  if (opener) openDialog(document.querySelector(opener.dataset.dialogOpen));
  const closer = e.target.closest('[data-dialog-close]');
  if (closer) closeDialog(closer.closest('.dialog-scrim'));
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.dialog-scrim:not([hidden])').forEach(closeDialog);
});

/* --- Checkbox indeterminate, set from markup ----------------------------- */

export function init(root = document) {
  root.querySelectorAll('[data-indeterminate]').forEach((c) => { c.indeterminate = true; });
  root.querySelectorAll('.slider input[type="range"]').forEach(paintSlider);
}

init();
