import { useEffect, useMemo, useState } from 'react';
import Viewer, { hasWebGL } from './Viewer.jsx';
import Planner from './Planner.jsx';
import { buildUnit } from './catalog.js';
import { layoutWall, starterProject } from './project.js';
import { cutSize } from './cabinet.js';

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

/* --- cabinet detail. The Step 3 viewer, opened on a unit from the plan. --- */

function CabinetDetail({ unit, label, onBack, resolvedTheme }) {
  const [explode, setExplode] = useState(0);
  const [doors, setDoors] = useState('closed');
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [preset, setPreset] = useState('Iso');
  const [nonce, setNonce] = useState(0);
  const [section, setSection] = useState({ on: false, axis: 'z', pos: 50 });
  const [show, setShow] = useState({ back: true, hardware: true, dims: false, labels: false, grid: false });
  const reduced = useMemo(
    () => matchMedia('(pointer: coarse)').matches || window.innerWidth < 760, []);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="btn btn--ghost" onClick={onBack}>Back to planner</button>
        <span className="badge badge--accent badge--num">{label}</span>
        <span className="brand">{unit.family.name}</span>
        <span className="ctx">{unit.width} x {unit.height} x {unit.depth}</span>
      </header>
      <main className="body">
        <section className="stage">
          <div className="canvas-wrap">
            <Viewer cabinet={unit} explode={explode} doors={doors}
                    selected={selected} setSelected={setSelected}
                    hovered={hovered} setHovered={setHovered}
                    show={show} ghostMode={ghostMode} section={section}
                    preset={preset} nonce={nonce} reduced={reduced} theme={resolvedTheme} />
            <div className="vp-toolbar float-tl">
              <div className="seg" role="group" aria-label="Camera">
                {['Front', 'Left', 'Right', 'Top', 'Iso'].map((v) => (
                  <button key={v} className="seg__item" aria-pressed={preset === v}
                          onClick={() => { setPreset(v); setNonce((n) => n + 1); }}>{v}</button>
                ))}
              </div>
              <span className="vp-toolbar__sep" />
              {[['dims', 'Dims'], ['labels', 'Labels'], ['grid', 'Grid'], ['back', 'Back'], ['hardware', 'Hardware']].map(([k, l]) => (
                <button key={k} className="seg__item" aria-pressed={show[k]}
                        onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>{l}</button>
              ))}
              <span className="vp-toolbar__sep" />
              <button className="seg__item" aria-pressed={ghostMode}
                      onClick={() => setGhostMode((g) => !g)}>Ghost</button>
              <button className="seg__item" aria-pressed={section.on} disabled={reduced}
                      onClick={() => setSection((s) => ({ ...s, on: !s.on }))}>Section</button>
            </div>
            <div className="float-bl controls">
              <div className="slider">
                <div className="slider__head">
                  <span className="field__label">Exploded view</span>
                  <span className="slider__value">{explode}%</span>
                </div>
                <input type="range" min="0" max="100" value={explode}
                       style={{ '--pct': `${explode}%` }} aria-label="Exploded view"
                       onChange={(e) => setExplode(+e.target.value)} />
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
                  <input type="range" min="0" max="100" value={section.pos} className="section-range"
                         style={{ '--pct': `${section.pos}%` }} aria-label="Section position"
                         onChange={(e) => setSection((s) => ({ ...s, pos: +e.target.value }))} />
                </div>
              )}
            </div>
          </div>
        </section>
        <aside className="side">
          <div className="list-head">
            <span className="field__label">Cut list</span>
            <span className="list-meta">{unit.parts.length} parts</span>
          </div>
          <div className="table-wrap list" data-density="compact">
            <table className="table">
              <thead><tr><th>Part code</th><th>Name</th><th className="n">L x W x T</th></tr></thead>
              <tbody>
                {unit.parts.map((p) => (
                  <tr key={p.code} aria-selected={selected === p.code}
                      onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(selected === p.code ? null : p.code)}>
                    <td className="code">{p.code}</td>
                    <td>{p.name}</td>
                    <td className="n">{cutSize(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </main>
    </div>
  );
}

/* --- start screen --------------------------------------------------------- */

function Start({ onExample, onEmpty }) {
  return (
    <div className="start">
      <h1 className="start-title">Kitchen cabinet builder</h1>
      <p className="note">Frameless European carcasses, 32mm system. Millimetres and AUD.</p>
      <div className="start-options">
        <button className="card start-card" onClick={onExample}>
          <span className="card__title">Load the example kitchen</span>
          <span className="note">Five walls, twenty cabinets, ready to change.</span>
        </button>
        <button className="card start-card" onClick={onEmpty}>
          <span className="card__title">Start empty</span>
          <span className="note">Four walls and an island, no cabinets.</span>
        </button>
      </div>
    </div>
  );
}

/* --- root ----------------------------------------------------------------- */

export default function App() {
  const [theme, setTheme, resolvedTheme] = useTheme();
  const [project, setProject] = useState(null);
  const [detail, setDetail] = useState(null);
  const [arrangement, setArrangement] = useState('split');

  const webgl = useMemo(() => hasWebGL(), []);

  const openDetail = (uidToOpen) => {
    const wall = project.walls.find((w) => w.id === project.activeWall);
    const lay = layoutWall(wall, project.cfg);
    const p = lay.placed.find((q) => q.item.uid === uidToOpen);
    if (p) setDetail({ unit: p.unit, label: p.label });
  };

  if (!project) {
    return (
      <div className="shell">
        <header className="topbar">
          <span className="brand">Kitchen cabinet builder</span>
          <span className="ctx">Step 4. Planner, elevation and 3D.</span>
          <div className="right">
            <div className="seg" role="group" aria-label="Theme">
              {['system', 'light', 'dark'].map((t) => (
                <button key={t} className="seg__item" aria-pressed={theme === t}
                        onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>
        </header>
        <Start
          onExample={() => setProject(starterProject())}
          onEmpty={() => {
            const p = starterProject();
            p.walls = p.walls.map((w) => ({ ...w, units: [], obstacles: [] }));
            setProject(p);
          }}
        />
      </div>
    );
  }

  if (detail) {
    return <CabinetDetail unit={detail.unit} label={detail.label}
                          onBack={() => setDetail(null)} resolvedTheme={resolvedTheme} />;
  }

  if (!webgl) {
    // The planner still works, the 3D panel does not. Elevation only.
    return (
      <Planner project={project} setProject={setProject} onOpen3D={openDetail}
               arrangement="drawer" setArrangement={() => {}} />
    );
  }

  return (
    <Planner project={project} setProject={setProject} onOpen3D={openDetail}
             arrangement={arrangement} setArrangement={setArrangement} />
  );
}
