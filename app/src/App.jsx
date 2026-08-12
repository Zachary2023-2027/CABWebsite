import { useEffect, useMemo, useRef, useState } from 'react';
import Viewer, { hasWebGL } from './Viewer.jsx';
import { buildCabinet, cutSize } from './cabinet.js';

const ICONS = {
  ghost: 'M2.5 2.5h8v8h-8z M5.5 5.5h8v8h-8z',
  grid: 'M2 6h12M2 10h12M6 2v12M10 2v12',
  reset: 'M13 8a5 5 0 1 1-1.6-3.7 M13 2.5V5.5H10',
  section: 'M2.5 2.5h11v11h-11z M2.5 10.5h11',
  cube: 'M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8z M2.5 4.8L8 7.9l5.5-3.1 M8 7.9v6.3',
  tag: 'M2.5 2.5h6l5 5-6 6-5-5z M5.5 5.5v.01',
};

const Icon = ({ d }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[d]} />
  </svg>
);

function useTheme() {
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  const resolved = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  return [theme, setTheme, resolved];
}

/* 2D front elevation. Also the fallback when WebGL will not start. */
function Elevation({ cabinet }) {
  const [W, H] = cabinet.size;
  const fronts = cabinet.parts.filter((p) => p.group === 'front');
  return (
    <svg className="elev" viewBox={`-40 -40 ${W + 80} ${H + 80}`} role="img"
         aria-label="Front elevation of the cabinet">
      <rect x="0" y="0" width={W} height={H}
            fill="var(--dw-carcass)" stroke="var(--dw-line)" strokeWidth="3" />
      {fronts.map((p) => (
        <rect key={p.code} x={p.pos[0]} y={H - p.pos[1] - p.size[1]}
              width={p.size[0]} height={p.size[1]}
              fill="var(--dw-drawer)" stroke="var(--dw-line)" strokeWidth="3" />
      ))}
      <text x={W / 2} y={H + 28} textAnchor="middle" fill="var(--dw-dim)"
            fontFamily="var(--font-mono)" fontSize="26">{W} x {H}</text>
    </svg>
  );
}

export default function App() {
  const cabinet = useMemo(() => buildCabinet('B03'), []);
  const [theme, setTheme, resolvedTheme] = useTheme();

  const [explode, setExplode] = useState(0);
  const [doors, setDoors] = useState('closed');
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [preset, setPreset] = useState('Iso');
  const [nonce, setNonce] = useState(0);
  const [section, setSection] = useState({ on: false, axis: 'z', pos: 50 });
  const [show, setShow] = useState({
    back: true, hardware: true, dims: false, labels: false, grid: false,
  });

  const reduced = useMemo(
    () => matchMedia('(pointer: coarse)').matches || window.innerWidth < 760, [],
  );
  const webgl = useMemo(() => hasWebGL(), []);

  const rows = useMemo(
    () => [...cabinet.parts, ...cabinet.hardware], [cabinet],
  );
  const listRef = useRef(null);

  useEffect(() => {
    if (!selected || !listRef.current) return;
    listRef.current.querySelector(`[data-code="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const resetView = () => {
    setPreset('Iso'); setNonce((n) => n + 1);
    setExplode(0); setDoors('closed'); setSelected(null); setGhostMode(false);
    setSection((s) => ({ ...s, on: false }));
  };

  const cutParts = cabinet.parts;
  const totalArea = cutParts.reduce((a, p) => a + (p.L * p.W) / 1e6, 0);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Cabinet viewer</span>
        <span className="ctx">Step 3. One three drawer base, built from its part list.</span>
        <div className="right">
          <div className="seg" role="group" aria-label="Theme">
            {['system', 'light', 'dark'].map((t) => (
              <button key={t} className="seg__item" aria-pressed={theme === t}
                      onClick={() => setTheme(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="body">
        <section className="stage">
          <div className="canvas-wrap">
            {webgl ? (
              <Viewer
                cabinet={cabinet} explode={explode} doors={doors}
                selected={selected} setSelected={setSelected}
                hovered={hovered} setHovered={setHovered}
                show={show} ghostMode={ghostMode} section={section}
                preset={preset} nonce={nonce} reduced={reduced} theme={resolvedTheme}
              />
            ) : (
              <div className="fallback">
                <Elevation cabinet={cabinet} />
                <p className="note">3D is not available in this browser. The elevation is shown instead.</p>
              </div>
            )}

            <div className="vp-toolbar float-tl">
              <div className="seg" role="group" aria-label="Camera">
                {['Front', 'Left', 'Right', 'Top', 'Iso'].map((v) => (
                  <button key={v} className="seg__item" aria-pressed={preset === v}
                          onClick={() => { setPreset(v); setNonce((n) => n + 1); }}>{v}</button>
                ))}
              </div>
              <span className="vp-toolbar__sep" />
              <button className="icon-btn" aria-pressed={show.dims} aria-label="Dimensions"
                      title="Dimensions" onClick={() => toggle('dims')}><Icon d="cube" /></button>
              <button className="icon-btn" aria-pressed={show.labels} aria-label="Part labels"
                      title="Part labels" onClick={() => toggle('labels')}><Icon d="tag" /></button>
              <button className="icon-btn" aria-pressed={ghostMode} aria-label="Ghost mode"
                      title="Ghost mode" onClick={() => setGhostMode((g) => !g)}><Icon d="ghost" /></button>
              <button className="icon-btn" aria-pressed={section.on} aria-label="Section cut"
                      title={reduced ? 'Section cut is off in reduced quality mode' : 'Section cut'}
                      disabled={reduced}
                      onClick={() => setSection((s) => ({ ...s, on: !s.on }))}><Icon d="section" /></button>
              <button className="icon-btn" aria-pressed={show.grid} aria-label="Floor grid"
                      title="Floor grid, 100mm" onClick={() => toggle('grid')}><Icon d="grid" /></button>
              <span className="vp-toolbar__sep" />
              <button className="icon-btn" aria-label="Reset view" title="Reset view"
                      onClick={resetView}><Icon d="reset" /></button>
            </div>

            <div className="float-bl controls">
              <div className="slider">
                <div className="slider__head">
                  <span className="field__label">Exploded view</span>
                  <span className="slider__value">{explode}%</span>
                </div>
                <input type="range" min="0" max="100" value={explode}
                       style={{ '--pct': `${explode}%` }}
                       onChange={(e) => setExplode(+e.target.value)}
                       aria-label="Exploded view" />
              </div>

              <div className="ctl-row">
                <span className="field__label">Drawers</span>
                <div className="seg" role="group" aria-label="Drawers">
                  {['closed', 'open', 'hidden'].map((v) => (
                    <button key={v} className="seg__item" aria-pressed={doors === v}
                            onClick={() => setDoors(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
                  ))}
                </div>
              </div>

              {section.on && !reduced && (
                <div className="ctl-row">
                  <div className="seg" role="group" aria-label="Section axis">
                    {['x', 'y', 'z'].map((a) => (
                      <button key={a} className="seg__item" aria-pressed={section.axis === a}
                              onClick={() => setSection((s) => ({ ...s, axis: a }))}>{a.toUpperCase()}</button>
                    ))}
                  </div>
                  <input type="range" min="0" max="100" value={section.pos}
                         className="section-range"
                         style={{ '--pct': `${section.pos}%` }}
                         onChange={(e) => setSection((s) => ({ ...s, pos: +e.target.value }))}
                         aria-label="Section position" />
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="side">
          <div className="side-head">
            <span className="badge badge--accent badge--num">{cabinet.id}</span>
            <span className="side-title">{cabinet.name}</span>
          </div>

          <div className="toggles">
            {[['back', 'Back panel'], ['hardware', 'Hardware']].map(([k, label]) => (
              <label className="toggle" key={k}>
                <input type="checkbox" checked={show[k]} onChange={() => toggle(k)} />
                <span className="toggle__track"><span className="toggle__knob" /></span>
                <span className="toggle__text">{label}</span>
              </label>
            ))}
            <label className="toggle" title="This cabinet has no shelves">
              <input type="checkbox" disabled />
              <span className="toggle__track"><span className="toggle__knob" /></span>
              <span className="toggle__text">Shelves</span>
            </label>
          </div>

          <div className="list-head">
            <span className="field__label">Cut list</span>
            <span className="list-meta">{cutParts.length} parts, {totalArea.toFixed(2)} m2</span>
          </div>

          <div className="table-wrap list" ref={listRef} data-density="compact">
            <table className="table">
              <thead>
                <tr><th>Part code</th><th>Name</th><th className="n">L x W x T</th></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.code} data-code={p.code}
                      aria-selected={selected === p.code}
                      onMouseEnter={() => setHovered(p)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(selected === p.code ? null : p.code)}>
                    <td className="code">{p.code}</td>
                    <td>{p.name}</td>
                    <td className="n">{cutSize(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="note foot-note">
            Hardware is listed for the viewer but is not part of the cut list.
            Prices and the shopping list come later.
          </p>
        </aside>
      </main>
    </div>
  );
}
