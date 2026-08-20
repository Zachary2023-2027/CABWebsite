/* Small form primitives shared by the inspector and the advanced dialog. */

import { useState } from 'react';
import { finish } from './finishes.js';
import { settleNumber, typeNumber } from './numfield.js';

/* A typed number.

   What you type is held here as you type it, exactly as typed, and the range
   is only applied when you leave the field. That is what lets a number be
   cleared to nothing and started again, which the old field would not allow:
   it clamped every keystroke, so backspacing 600 toward 800 was fought all
   the way down. What a keystroke and a blur each mean is in numfield.js,
   where it can be tested without a browser. */
export function Num({
  label, value, unit = 'mm', onChange, placeholder, min, max,
  /* What an empty field means. Undefined for a setting with a default the
     caller puts back, zero for a price, which is a real answer. */
  whenEmpty,
  hideLabel = false,
  compact = false,
}) {
  const [draft, setDraft] = useState(null);
  const range = { min, max, whenEmpty };

  const type = (text) => {
    const step = typeNumber(text, range);
    setDraft(step.draft);
    if (step.value !== undefined) onChange(step.value);
  };

  const settle = () => {
    const done = settleNumber(draft, range);
    setDraft(null);
    if (done.touched) onChange(done.value);
  };

  return (
    <div className="field">
      <span className={`field__label ${hideLabel ? 'is-hidden' : ''}`}>{label}</span>
      <div className={`input-shell num-input ${compact ? 'inline-num' : ''}`}>
        <input className="num-input__input" type="text" inputMode="decimal"
               value={draft ?? value ?? ''} aria-label={label} placeholder={placeholder}
               onChange={(e) => type(e.target.value)}
               onBlur={settle}
               onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <span className="num-input__unit">{unit}</span>
      </div>
    </div>
  );
}

export function Pick({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="input-shell select-shell">
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* Board species. Typed, with the ones you already have as suggestions, so
   you are never stuck with a list somebody else picked. The name is what the
   part is costed and nested against, so it has to match a sheet to have a
   price: the sheet stock screen says the same thing from the other side. */
export function Board({ label, value, options, onChange, placeholder }) {
  const id = `bl-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="input-shell">
        <input type="text" value={value ?? ''} aria-label={label} list={id}
               placeholder={placeholder}
               onChange={(e) => onChange(e.target.value)} />
      </div>
      <datalist id={id}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}

/* Two way switch for the either/or build choices. Not a drop-down, because
   both options should be readable without opening anything. */
export function Choice({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o.value} type="button" className="seg__item"
                  aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/* Three levels, and the third is not a quieter warning.

   A note is something true about the cabinet that you need while you build
   it: the waste pipe comes out inside this one. Drawing it as a warning
   teaches you that warnings are noise, which is how the real ones get
   ignored, so it gets its own mark and its own colour. */
export function Warn({ children, level = 'warn' }) {
  const cls = level === 'error' ? 'warn-inline--error'
    : level === 'note' ? 'warn-inline--note' : '';
  return (
    <div className={`warn-inline ${cls}`}>
      {level === 'note' ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 7.4v4M8 5v.1" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M8 2.5l6 11H2z" strokeLinejoin="round" />
          <path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
        </svg>
      )}
      <span>{children}</span>
    </div>
  );
}

export function Close({ onClick }) {
  return (
    <button className="icon-btn" aria-label="Close" onClick={onClick}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
           strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  );
}

/* ---------------------------------------------------------------------------
   A finish swatch.

   Small, square, and the colour the board actually is. It goes beside a
   material name in the cut list and the print pack, so that a two tone
   kitchen is legible on paper without reading every row.
   --------------------------------------------------------------------------- */

export function Swatch({ finish: id, title }) {
  const f = finish(id);
  return (
    <span className="swatch-dot" style={{ background: f.hex }}
          title={title || f.name} aria-label={f.name} role="img" />
  );
}

/* ---------------------------------------------------------------------------
   A collapsible section.

   The inspector is one long column, and most of it is settings you touch
   once. Ordered by how often you actually reach for them, with the deep ones
   folded away, it becomes a panel you can read rather than one you scroll.

   Open state lives here rather than in the parent, because it is about the
   panel and not about the cabinet: folding a section shut should not be
   something a project remembers or an undo can reach.
   --------------------------------------------------------------------------- */

export function Section({ title, children, defaultOpen = true, action }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`sub sub--fold ${open ? 'is-open' : ''}`}>
      <div className="sub-head">
        <button className="sub-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span className="field__label">{title}</span>
        </button>
        {open && action}
      </div>
      {open && children}
    </section>
  );
}
