/* Small form primitives shared by the inspector and the advanced dialog. */

export function Num({ label, value, unit = 'mm', onChange, placeholder, min, max }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="input-shell num-input">
        <input className="num-input__input" type="text" inputMode="decimal"
               value={value ?? ''} aria-label={label} placeholder={placeholder}
               onChange={(e) => {
                 const raw = e.target.value.replace(/[^0-9.]/g, '');
                 if (raw === '') return onChange(undefined);
                 const v = parseFloat(raw);
                 if (!Number.isFinite(v)) return;
                 onChange(Math.min(max ?? Infinity, Math.max(min ?? 0, v)));
               }} />
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

export function Warn({ children, level = 'warn' }) {
  return (
    <div className={`warn-inline ${level === 'error' ? 'warn-inline--error' : ''}`}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M8 2.5l6 11H2z" strokeLinejoin="round" />
        <path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
      </svg>
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
