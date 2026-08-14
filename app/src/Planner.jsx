import { useMemo, useState } from 'react';
import Elevation from './Elevation.jsx';
import Kitchen3D from './Kitchen3D.jsx';
import { FAMILIES, FAMILY, GROUPS, unitCost } from './catalog.js';
import { layoutWall, money, uid, unitWarnings, wallWarnings } from './project.js';

/* --- cabinet family glyphs ------------------------------------------------
   Line drawings on a 24 square. Elevation shapes, not icons: a glyph shows
   the front you will actually get. Dashed means a cavity, not a cabinet. */

const G = {
  door1: <><rect x="4" y="3" width="16" height="18" /><circle cx="17" cy="12" r="1" /></>,
  door2: <><rect x="3" y="3" width="18" height="18" /><path d="M12 3v18" /><circle cx="10" cy="12" r="1" /><circle cx="14" cy="12" r="1" /></>,
  drawer3: <><rect x="3" y="3" width="18" height="18" /><path d="M3 9h18M3 15h18" /><path d="M10 6h4M10 12h4M10 18h4" /></>,
  drawer4: <><rect x="3" y="3" width="18" height="18" /><path d="M3 7.5h18M3 12h18M3 16.5h18" /></>,
  sink: <><rect x="3" y="3" width="18" height="18" /><path d="M3 8h18M12 8v13" /><circle cx="12" cy="5.5" r="0.9" /></>,
  corner: <><path d="M3 3h18v18H3z" /><path d="M14 3v18" /><path d="M14 3l7 5" /></>,
  bridge: <><rect x="3" y="8" width="18" height="8" /><path d="M12 8v8" /></>,
  open: <><path d="M3 3h18v18H3z" strokeDasharray="2 2" /><path d="M3 9h18M3 15h18" /></>,
  pantry: <><rect x="5" y="2" width="14" height="20" /><path d="M5 12h14M12 2v20" /></>,
  oven: <><rect x="5" y="2" width="14" height="20" /><path d="M5 8h14M5 16h14" /><rect x="7" y="10" width="10" height="4" /></>,
  fridge: <><rect x="5" y="2" width="14" height="20" strokeDasharray="2 2" /><path d="M5 9h14" /><path d="M11 4v3M11 11v3" /></>,
  dw: <><rect x="3" y="3" width="18" height="18" strokeDasharray="2 2" /><path d="M3 7h18" /><rect x="7" y="10" width="10" height="8" /></>,
  cooktop: <><rect x="3" y="3" width="18" height="18" strokeDasharray="2 2" /><circle cx="8.5" cy="8.5" r="2" /><circle cx="15.5" cy="8.5" r="2" /><circle cx="8.5" cy="15.5" r="2" /><circle cx="15.5" cy="15.5" r="2" /></>,
  filler: <><rect x="10" y="3" width="4" height="18" /></>,
};

const Glyph = ({ name }) => (
  <svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">{G[name] || G.door1}</svg>
);

/* --- picker --------------------------------------------------------------- */

function Picker({ onAdd }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const match = (f) =>
    !term || f.name.toLowerCase().includes(term) || f.desc.toLowerCase().includes(term) ||
    f.group.toLowerCase().includes(term);

  const groups = GROUPS.map((g) => [g, FAMILIES.filter((f) => f.group === g && match(f))])
    .filter(([, list]) => list.length);

  return (
    <div className="picker">
      <div className="input-shell picker-search">
        <input type="text" value={q} placeholder="Search cabinets"
               aria-label="Search cabinets" onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="picker-list">
        {groups.map(([g, list]) => (
          <section key={g}>
            <span className="field__label picker-group">{g}</span>
            {list.map((f) => (
              <button key={f.id} className="pick" onClick={() => onAdd(f.id)} title={f.desc}>
                <Glyph name={f.glyph} />
                <span className="pick-text">
                  <span className="pick-name">{f.name}</span>
                  <span className="pick-desc">{f.desc}</span>
                </span>
                <span className="pick-w">{f.def.width}</span>
              </button>
            ))}
          </section>
        ))}
        {!groups.length && <p className="note pad">Nothing matches that.</p>}
      </div>
    </div>
  );
}

/* --- inspector ------------------------------------------------------------ */

function Inspector({ placed, lay, cfg, onChange, onRemove, onMove, onOpen3D, onClose }) {
  if (!placed) {
    return (
      <div className="empty inspector-empty">
        <div className="empty__text">Select a cabinet in the drawing to edit it.</div>
      </div>
    );
  }
  const { unit, item } = placed;
  const fam = FAMILY[item.familyId];
  const warns = unitWarnings(placed, lay, cfg);
  const cost = unit.kind === 'appliance' ? null : unitCost(unit);
  const set = (k, v) => onChange(item.uid, { [k]: v });

  const counts = [];
  if (fam.fronts === 'doors' && unit.kind !== 'tall') counts.push(['doors', 'Doors', [1, 2]]);
  if (fam.fronts === 'drawers') counts.push(['drawers', 'Drawers', [1, 2, 3, 4, 5]]);
  if (fam.fronts !== 'drawers' && unit.kind !== 'appliance' && unit.kind !== 'filler') {
    counts.push(['shelves', 'Shelves', [0, 1, 2, 3, 4, 5]]);
  }

  return (
    <div className="inspector">
      <div className="side-head">
        {placed.label && <span className="badge badge--accent badge--num">{placed.label}</span>}
        <span className="side-title">{fam.name}</span>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      <div className="inspector-body">
        <div className="field">
          <span className="field__label">Width</span>
          <div className="input-shell select-shell">
            <select value={unit.width} onChange={(e) => set('width', +e.target.value)}>
              {fam.widths.map((w) => <option key={w} value={w}>{w} mm</option>)}
            </select>
          </div>
        </div>

        {counts.map(([k, label, opts]) => (
          <div className="field" key={k}>
            <span className="field__label">{label}</span>
            <div className="input-shell select-shell">
              <select value={unit.settings[k] ?? opts[0]} onChange={(e) => set(k, +e.target.value)}>
                {opts.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        ))}

        <dl className="spec">
          <div><dt>Carcass</dt><dd>{unit.width} x {unit.height} x {unit.depth}</dd></div>
          <div><dt>Off floor</dt><dd>{unit.mountY}</dd></div>
          <div><dt>Parts</dt><dd>{unit.parts.length}</dd></div>
          {cost && <div><dt>Board</dt><dd>{money(cost.board)}</dd></div>}
          {cost && <div><dt>Hardware</dt><dd>{money(cost.hardware)}</dd></div>}
          {cost && <div className="spec-total"><dt>Cabinet</dt><dd>{money(cost.total)}</dd></div>}
        </dl>
        {cost && <p className="note est">Estimate. Prices are seeded, not quoted.</p>}

        {warns.map((w, i) => (
          <div className="warn-inline" key={i}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M8 2.5l6 11H2z" strokeLinejoin="round" /><path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
            </svg>
            <span>{w}</span>
          </div>
        ))}
      </div>

      <div className="inspector-foot">
        <button className="btn btn--ghost" onClick={() => onMove(item.uid, -1)} title="Move left">Left</button>
        <button className="btn btn--ghost" onClick={() => onMove(item.uid, 1)} title="Move right">Right</button>
        {unit.kind !== 'appliance' && unit.kind !== 'filler' && (
          <button className="btn btn--secondary" onClick={() => onOpen3D(item.uid)}>Open in 3D</button>
        )}
        <button className="btn btn--danger" onClick={() => onRemove(item.uid)}>Delete</button>
      </div>
    </div>
  );
}

/* --- planner -------------------------------------------------------------- */

export default function Planner({ project, setProject, onOpen3D, arrangement, setArrangement }) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [preset, setPreset] = useState('Iso');
  const [nonce, setNonce] = useState(0);
  const [eye, setEye] = useState(false);
  const [show, setShow] = useState({ walls: true, bench: true, wallCabs: true, appliances: true });

  const reduced = useMemo(
    () => matchMedia('(pointer: coarse)').matches || window.innerWidth < 900, []);

  const wall = project.walls.find((w) => w.id === project.activeWall) || project.walls[0];
  const lay = useMemo(() => layoutWall(wall, project.cfg), [wall, project.cfg]);
  const wallWarns = useMemo(() => wallWarnings(lay), [lay]);
  const placedSel = lay.placed.find((p) => p.item.uid === selected) || null;

  const mutate = (fn) => setProject((prev) => {
    const next = structuredClone(prev);
    const w = next.walls.find((x) => x.id === next.activeWall);
    fn(w, next);
    return next;
  });

  const addUnit = (familyId) => {
    const id = uid();
    mutate((w) => { w.units.push({ uid: id, familyId, settings: {} }); });
    setSelected(id);
  };
  const changeUnit = (u, patch) =>
    mutate((w) => {
      const it = w.units.find((x) => x.uid === u);
      if (it) it.settings = { ...it.settings, ...patch };
    });
  const removeUnit = (u) => {
    mutate((w) => { w.units = w.units.filter((x) => x.uid !== u); });
    setSelected(null);
  };
  const moveUnit = (u, dir) => mutate((w) => {
    const i = w.units.findIndex((x) => x.uid === u);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= w.units.length) return;
    const [it] = w.units.splice(i, 1);
    w.units.splice(j, 0, it);
  });
  const setWallLength = (v) => mutate((w) => { w.length = v; });

  const view3d = (
    <div className="three-wrap">
      <Kitchen3D lay={lay} cfg={project.cfg} selected={selected} setSelected={setSelected}
                 setHovered={setHovered} show={show} preset={preset} nonce={nonce}
                 eye={eye} reduced={reduced} />
      <div className="vp-toolbar float-tl">
        <div className="seg" role="group" aria-label="Camera">
          {['Front', 'Left', 'Right', 'Top', 'Iso'].map((v) => (
            <button key={v} className="seg__item" aria-pressed={preset === v && !eye}
                    onClick={() => { setEye(false); setPreset(v); setNonce((n) => n + 1); }}>{v}</button>
          ))}
        </div>
        <span className="vp-toolbar__sep" />
        <button className="seg__item eye-btn" aria-pressed={eye}
                onClick={() => { setEye((e) => !e); setNonce((n) => n + 1); }}
                title="Stand in the room at 1600. Walk with W A S D">Eye</button>
        <span className="vp-toolbar__sep" />
        {[['walls', 'Walls'], ['bench', 'Benchtop'], ['wallCabs', 'Wall cabs'], ['appliances', 'Appliances']].map(([k, label]) => (
          <button key={k} className="seg__item" aria-pressed={show[k]}
                  onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>{label}</button>
        ))}
      </div>
      {eye && <div className="eye-hint">W A S D to walk. Drag to look.</div>}
      {hovered && (
        <div className="hover-card float-tr">
          <b>{hovered.label || hovered.unit.family.name}</b>
          <span>{hovered.unit.family.name}</span>
          <span>{hovered.unit.width} x {hovered.unit.height} x {hovered.unit.depth}</span>
        </div>
      )}
    </div>
  );

  const elevation = (
    <div className="elev-wrap" onClick={() => setSelected(null)}>
      <Elevation lay={lay} cfg={project.cfg} selected={selected}
                 onSelect={setSelected} onHover={setHovered} />
    </div>
  );

  return (
    <div className="planner">

      <div className="tabs wall-tabs" role="tablist">
        {project.walls.map((w) => (
          <button key={w.id} className="tab" role="tab" aria-selected={w.id === project.activeWall}
                  onClick={() => { setProject((p) => ({ ...p, activeWall: w.id })); setSelected(null); }}>
            {w.name} <span className="tab__len">{w.length}</span>
          </button>
        ))}
        <div className="wall-len">
          <div className="seg" role="group" aria-label="Arrangement">
            {[['split', 'Split'], ['drawer', 'Drawer'], ['focus', 'Focus']].map(([k, label]) => (
              <button key={k} className="seg__item" aria-pressed={arrangement === k}
                      onClick={() => setArrangement(k)}>{label}</button>
            ))}
          </div>
          <span className="field__label">Wall length</span>
          <div className="input-shell select-shell">
            <select value={wall.length} onChange={(e) => setWallLength(+e.target.value)}
                    aria-label="Wall length">
              {[1200, 1800, 2100, 2400, 3000, 3600, 4200, 4800].map((v) => (
                <option key={v} value={v}>{v} mm</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={`planner-body arr-${arrangement}`}>
        <aside className="rail">
          <Picker onAdd={addUnit} />
        </aside>

        <section className="canvas-area">
          {arrangement === 'split' && (
            <div className="split">
              {elevation}
              {view3d}
            </div>
          )}

          {arrangement === 'drawer' && (
            <div className="drawer-arr">
              {elevation}
              <div className={`bottom-drawer ${drawerOpen ? 'is-open' : ''}`}>
                <button className="drawer-handle" onClick={() => setDrawerOpen((o) => !o)}
                        aria-expanded={drawerOpen}>
                  <span>3D</span>
                  <span className="drawer-caret">{drawerOpen ? 'Hide' : 'Show'}</span>
                </button>
                {drawerOpen && view3d}
              </div>
            </div>
          )}

          {arrangement === 'focus' && (
            <div className="focus-arr">
              {view3d}
              <div className="inset">{elevation}</div>
            </div>
          )}

          {wallWarns.length > 0 && (
            <div className="wall-warnings">
              {wallWarns.map((w, i) => (
                <div key={i} className={`warn-inline ${w.level === 'error' ? 'warn-inline--error' : ''}`}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M8 2.5l6 11H2z" strokeLinejoin="round" /><path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
                  </svg>
                  <span>{w.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="side inspector-side">
          <Inspector placed={placedSel} lay={lay} cfg={project.cfg}
                     onChange={changeUnit} onRemove={removeUnit} onMove={moveUnit}
                     onOpen3D={onOpen3D} onClose={() => setSelected(null)} />
        </aside>
      </div>
    </div>
  );
}
