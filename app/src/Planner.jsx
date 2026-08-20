import { useEffect, useMemo, useRef, useState } from 'react';
import Elevation from './Elevation.jsx';
import Kitchen3D from './Kitchen3D.jsx';
import { finishFor } from './finishes.js';
import { FAMILIES, FAMILY, GROUPS, PROJECT, boardNames, buildUnit, unitCost } from './catalog.js';
import { optimiseProject, optimiseWall } from './optimise.js';
import { Advanced, OptimiseResult } from './Advanced.jsx';
import { Board, Choice, Close, Num, Pick, Section, Warn } from './Fields.jsx';
import { RUNNERS } from './hardware.js';
import { OBSTACLE_LIST, natureOf, newObstacle, obstacleKind } from './obstacles.js';
import { round1 } from './mm.js';
import { downloadSvg, safeFileName } from './storage.js';
import StackEditor from './StackEditor.jsx';
import {
  ROOM_SHAPES, WALL_KINDS, floorPlan, isIsland, islandAt, islandDepth, layoutFor,
  money, placeOnRun, roomLayout, roomWallIds, uid, unitServices, unitWarnings,
  wallWarnings,
} from './project.js';

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
  cornerL: <><rect x="2" y="4" width="20" height="16" /><path d="M14 4v16" /><path d="M14 8h8M14 16h8" strokeDasharray="2 2" /><circle cx="11.5" cy="12" r="1" /></>,
  micro: <><rect x="3" y="3" width="18" height="18" /><rect x="5" y="5" width="10" height="7" /><circle cx="18" cy="8.5" r="0.9" /><path d="M3 14h18" /><path d="M10 17.5h4" /></>,
  bin: <><rect x="4" y="3" width="16" height="18" /><path d="M8 7h8l-1 11H9z" /><path d="M9.5 5h5" /></>,
  cooktopOven: <><rect x="3" y="3" width="18" height="18" strokeDasharray="2 2" /><circle cx="8" cy="6.5" r="1.6" /><circle cx="16" cy="6.5" r="1.6" /><path d="M3 10h18" /><rect x="6" y="13" width="12" height="5" /></>,
  hood: <><path d="M3 20h18l-4-7H7z" /><path d="M9.5 13V4h5v9" /><path d="M6 20v1M18 20v1" /></>,
  filler: <><rect x="10" y="3" width="4" height="18" /></>,
};

/* The glyph is filled with the finish the fronts are actually going to be, so
   the picker shows you cabinets in your kitchen's colour rather than in the
   abstract. Faint, because it is an icon and not a swatch. */
const Glyph = ({ name, tint }) => (
  <svg className="glyph" viewBox="0 0 24 24" fill={tint || 'none'} fillOpacity={tint ? 0.28 : 0}
       stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
       aria-hidden="true">{G[name] || G.door1}</svg>
);

/* --- picker --------------------------------------------------------------- */

function Picker({ onAdd, cfg }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('Base');
  const term = q.trim().toLowerCase();
  const match = (f) =>
    !term || f.name.toLowerCase().includes(term) || f.desc.toLowerCase().includes(term) ||
    f.group.toLowerCase().includes(term);

  /* Kind first. There are enough presets now that one long list is a scroll
     rather than a choice: you know whether you are putting in a base, a wall
     or a tall cabinet before you know which one, so that is the first thing
     asked. A search still looks across all of them, because when you know the
     name you should not have to know the kind. */
  const shown = FAMILIES.filter((f) => !f.retired && match(f));
  const kinds = GROUPS.filter((g) => shown.some((f) => f.group === g));
  const activeKind = kinds.includes(kind) ? kind : kinds[0];
  const list = term ? shown : shown.filter((f) => f.group === activeKind);
  const groups = term
    ? kinds.map((g) => [g, shown.filter((f) => f.group === g)]).filter(([, l]) => l.length)
    : [[activeKind, list]];

  return (
    <div className="picker">
      <div className="input-shell picker-search">
        <input type="text" value={q} placeholder="Search cabinets"
               aria-label="Search cabinets" onChange={(e) => setQ(e.target.value)} />
      </div>
      {!term && (
        <div className="seg picker-kinds" role="group" aria-label="Kind of cabinet">
          {kinds.map((g) => (
            <button key={g} className="seg__item" aria-pressed={g === activeKind}
                    onClick={() => setKind(g)}>{g}</button>
          ))}
        </div>
      )}
      <div className="picker-list">
        {groups.map(([g, glist]) => (
          <section key={g}>
            {term && <span className="field__label picker-group">{g}</span>}
            {glist.map((f) => (
              <button key={f.id} className="pick" onClick={() => onAdd(f.id)} title={f.desc}>
                <Glyph name={f.glyph} tint={finishFor('front', cfg).hex} />
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

/* The overrides that live in the drawer box section, so it can tell whether
   this cabinet has departed from the project in there. */
const BOX_KEYS = ['boxBoard', 'boxSideThk', 'boxBaseBoard', 'boxBaseThk', 'boxHeight',
  'runnerDeduction', 'runnerLength', 'boxSetback', 'baseGroove', 'reveal'];

/* --- inspector ------------------------------------------------------------ */

function Inspector({ placed, lay, cfg, selDrawer, setSelDrawer, locked, onLock,
                    onChange, onConvert, onDuplicate, onOverride, onRemove, onMove, onDrop, onUnpin,
                    onOpen3D, onClose }) {
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
  /* Not warnings. A waste pipe inside a sink base is the reason the sink base
     is there, and calling it a problem trains you to ignore the problems. */
  const services = unitServices(placed, lay);
  const cost = unit.cavity ? null : unitCost(unit);
  const set = (patch) => onChange(item.uid, patch);
  const over = item.settings?.cfg || {};
  const eff = (k) => over[k] ?? cfg[k];
  const editable = !unit.cavity && unit.kind !== 'filler';

  const boards = boardNames();

  /* The stored figure is what the runner takes off the opening. The gap each
     side is the same fact the way you measure it, and it is what the field
     shows, exactly as the project panel does. The old field here edited
     runnerClearance, which the geometry stopped reading when runners became
     profiles, so it looked live and changed nothing. */
  const effDeduction = over.runnerDeduction !== undefined
    ? over.runnerDeduction : cfg.runnerDeduction;
  const gapEachSide = round1(((effDeduction ?? RUNNERS['tandem-563h'].insideDeduction)
    - 2 * (over.boxSideThk ?? cfg.boxSideThk)) / 2);
  const fronts = unit.parts.filter((q) => q.code.includes('DRWR-F'));

  return (
    <div className="inspector">
      <div className="side-head">
        {placed.label && <span className="badge badge--accent badge--num">{placed.label}</span>}
        <span className="side-title">{fam.name}</span>
        <Close onClick={onClose} />
      </div>

      <div className="inspector-body">
        {fam.retired && FAMILY[fam.replacedBy] && (
          <div className="sub retired-row">
            <p className="note">
              This is the older corner cabinet. Its blind width was a number you
              typed, so widening the benchtop left the door with nothing to swing
              clear of. The one that replaces it works the blind out from the
              benchtop depth, so it follows.
            </p>
            <button className="btn btn--secondary"
                    onClick={() => onConvert(item.uid, fam.replacedBy)}>
              Change it to {FAMILY[fam.replacedBy].name}
            </button>
          </div>
        )}

        {placed.pinned && (
          <div className="sub-head pin-row">
            <span className="note">Placed by hand. Its neighbours will not push it.</span>
            <button className="btn btn--ghost" onClick={() => onUnpin(item.uid)}
                    title="Let this cabinet flow after the one before it again">Back in line</button>
          </div>
        )}

        <div className="settings-grid">
          <Num label="Along the wall" value={Math.round(placed.x)} min={0} max={12000}
               onChange={(v) => onDrop(item.uid, v ?? placed.x)} />
          <Num label="Width" value={unit.width} min={50} max={1400}
               onChange={(v) => set({ width: v ?? unit.width })} />
          <Num label="Height" value={unit.height} min={100} max={2400}
               onChange={(v) => set({ height: v })} />
          <Num label="Depth" value={unit.depth} min={100} max={900}
               onChange={(v) => set({ depth: v })} />
        </div>

        {editable && (
          <>
            <div className="settings-grid">
              {fam.fronts === 'doors' && unit.kind !== 'tall' && !unit.settings.stack && (
                <Pick label="Doors" value={String(unit.settings.doors ?? 1)} options={['1', '2']}
                      onChange={(v) => set({ doors: +v })} />
              )}
              {(fam.fronts === 'drawers' || fam.fronts === 'microwave') && !unit.settings.stack && (
                <Pick label="Drawers" value={String(unit.settings.drawers ?? 3)}
                      options={['1', '2', '3', '4', '5']}
                      onChange={(v) => set({ drawers: +v, drawerHeights: undefined })} />
              )}
              {fam.fronts !== 'drawers' && fam.fronts !== 'bin' && (
                <Pick label="Shelves" value={String(unit.settings.shelves ?? 0)}
                      options={['0', '1', '2', '3', '4', '5']}
                      onChange={(v) => set({ shelves: +v })} />
              )}
              {fam.fronts === 'microwave' && (
                <Num label="Microwave bay" value={unit.settings.microH ?? 380}
                     onChange={(v) => set({ microH: v ?? 380 })} />
              )}
              {fam.corner && (
                <Num label="Blind past the benchtop" value={unit.blindExtra}
                     min={0} max={600}
                     onChange={(v) => set({ blindExtra: v ?? unit.blindExtra, blindWidth: undefined })} />
              )}
              {fam.corner && (
                <Choice label="Corner is on the" value={unit.settings.blindSide || 'right'}
                        options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]}
                        onChange={(v) => set({ blindSide: v })} />
              )}
              {fam.fronts === 'oven' && (
                <Num label="Oven cavity" value={unit.settings.ovenH ?? 600}
                     onChange={(v) => set({ ovenH: v ?? 600 })} />
              )}
            </div>

            {unit.corner && (
              <p className="note corner-sum">
                Blind panel {eff('benchDepth')} benchtop + {unit.blindExtra} past it
                = {unit.blindWidth}mm. Door {Math.round(unit.width - unit.blindWidth - 2 * eff('reveal'))}mm.
                The return cabinets start {unit.cornerReturn}mm along the next wall.
              </p>
            )}

            {services.map((t, i) => <Warn key={`s${i}`} level="note">{t}</Warn>)}

            {unit.stack && unit.stack.rows.length > 0 && (
              <Section title="Front layout">
                <StackEditor unit={unit} cfg={cfg} selRow={selDrawer} setSelRow={setSelDrawer}
                             onStack={(stack) => set({ stack, drawerHeights: undefined })} />
                {unit.stack.errors.map((e, i) => <Warn key={`e${i}`} level="error">{e}</Warn>)}
                {unit.stack.warnings.map((w, i) => <Warn key={`w${i}`}>{w}</Warn>)}
              </Section>
            )}

            <Section title="Boards, this cabinet only" defaultOpen={Object.keys(over).length > 0}
                     action={Object.keys(over).length > 0 ? (
                       <button className="btn btn--ghost"
                               onClick={() => onOverride(item.uid, null)}>Match project</button>
                     ) : null}>
              <div className="settings-grid">
                <Choice label="Back" value={eff('backType') || 'full'}
                        options={[{ value: 'full', label: 'Full panel' }, { value: 'rail', label: 'Rail only' }]}
                        onChange={(v) => onOverride(item.uid, { backType: v })} />
                {fronts.length > 0 && (
                  <Choice label="Drawer base" value={eff('boxBaseFix') || 'dado'}
                          options={[{ value: 'dado', label: 'Dado' }, { value: 'screwed', label: 'Screwed' }]}
                          onChange={(v) => onOverride(item.uid, { boxBaseFix: v })} />
                )}
              </div>
              <div className="settings-grid">
                <Board label="Carcass board" value={eff('carcassBoard')} options={boards}
                       onChange={(v) => onOverride(item.uid, { carcassBoard: v })} />
                <Num label="Carcass thickness" value={eff('carcassThk')}
                     onChange={(v) => onOverride(item.uid, { carcassThk: v ?? cfg.carcassThk })} />
                <Board label="Front board" value={eff('frontBoard')} options={boards}
                       onChange={(v) => onOverride(item.uid, { frontBoard: v })} />
                <Num label="Front thickness" value={eff('frontThk')}
                     onChange={(v) => onOverride(item.uid, { frontThk: v ?? cfg.frontThk })} />
                <Board label="Back board" value={eff('backBoard')} options={boards}
                       onChange={(v) => onOverride(item.uid, { backBoard: v })} />
                <Num label="Back thickness" value={eff('backThk')}
                     onChange={(v) => onOverride(item.uid, { backThk: v ?? cfg.backThk })} />
              </div>
            </Section>

            {fronts.length > 0 && (
              <Section title="Drawer boxes, this cabinet"
                       /* Folded unless this cabinet already departs from the
                          project in here, in which case it opens showing you
                          what. */
                       defaultOpen={BOX_KEYS.some((k) => over[k] !== undefined)}>
                <p className="note">
                  The box is what holds the load, so it is worth being able to build it
                  out of something other than the carcass. Every panel here is its own
                  material and its own thickness.
                </p>
                <div className="settings-grid">
                  <Board label="Box sides board" value={eff('boxBoard')} options={boards}
                         onChange={(v) => onOverride(item.uid, { boxBoard: v })} />
                  <Num label="Box side thickness" value={eff('boxSideThk')}
                       onChange={(v) => onOverride(item.uid, { boxSideThk: v ?? cfg.boxSideThk })} />
                  <Board label="Box base board" value={eff('boxBaseBoard')} options={boards}
                         placeholder="Same as the sides"
                         onChange={(v) => onOverride(item.uid, { boxBaseBoard: v })} />
                  <Num label="Box base thickness" value={eff('boxBaseThk')}
                       onChange={(v) => onOverride(item.uid, { boxBaseThk: v ?? cfg.boxBaseThk })} />
                  <Num label="Box side height" value={eff('boxHeight')}
                       onChange={(v) => onOverride(item.uid, { boxHeight: v ?? cfg.boxHeight })} />
                  <Num label="Gap each side" value={gapEachSide}
                       onChange={(v) => onOverride(item.uid, {
                         runnerDeduction: v === null ? null : 2 * (v + eff('boxSideThk')),
                       })} />
                  <Num label="Runner length" value={eff('runnerLength')}
                       onChange={(v) => onOverride(item.uid, { runnerLength: v ?? cfg.runnerLength })} />
                  <Num label="Box behind the front" value={eff('boxSetback')}
                       onChange={(v) => onOverride(item.uid, { boxSetback: v ?? cfg.boxSetback })} />
                  <Num label="Base groove from the bottom" value={eff('baseGroove')}
                       onChange={(v) => onOverride(item.uid, { baseGroove: v ?? cfg.baseGroove })} />
                  <Num label="Gap between fronts" value={eff('reveal')}
                       onChange={(v) => onOverride(item.uid, { reveal: v ?? cfg.reveal })} />
                </div>
              </Section>
            )}
          </>
        )}

        <dl className="spec">
          <div><dt>Carcass</dt><dd>{unit.width} x {unit.height} x {unit.depth}</dd></div>
          <div><dt>Off floor</dt><dd>{unit.mountY}</dd></div>
          <div><dt>Parts</dt><dd>{unit.parts.length}</dd></div>
          {cost && <div><dt>Board</dt><dd>{money(cost.board)}</dd></div>}
          {cost && <div><dt>Hardware</dt><dd>{money(cost.hardware)}</dd></div>}
          {cost && <div className="spec-total"><dt>Cabinet</dt><dd>{money(cost.total)}</dd></div>}
        </dl>
        {cost && <p className="note est">Estimate. Prices are seeded, not quoted.</p>}

        {warns.map((w, i) => <Warn key={i}>{w}</Warn>)}
      </div>

      <div className="inspector-foot">
        <label className="check lock-check">
          <input type="checkbox" checked={!!locked} onChange={() => onLock(item.uid)} />
          <span className="check__box">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
          </span>
          <span className="check__text">Lock width</span>
        </label>
        <button className="btn btn--ghost" onClick={() => onMove(item.uid, -1)}>Left</button>
        <button className="btn btn--ghost" onClick={() => onMove(item.uid, 1)}>Right</button>
        {editable && (
          <button className="btn btn--secondary" onClick={() => onOpen3D(item.uid)}>Open in 3D</button>
        )}
        <button className="btn btn--secondary" onClick={() => onDuplicate(item.uid)}>Duplicate</button>
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
  const [show, setShow] = useState({
    walls: true, bench: true, wallCabs: true, appliances: true,
    arcs: false, person: false,
  });
  /* How far the fronts are open, 0 to 1. A kitchen drawn shut is a wall of
     boxes: opening it is how you see whether the drawers clear the handles
     and whether a door can be used at all. */
  const [open, setOpen] = useState(0);
  const [keysOpen, setKeysOpen] = useState(false);
  const [selObstacle, setSelObstacle] = useState(null);
  const elevRef = useRef(null);
  /* Which side of an island you are working on. Meaningless on a wall, and
     harmless there: a wall's cabinets are all on its one side. */
  const [side, setSide] = useState('front');
  const [wallsOpen, setWallsOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [selDrawer, setSelDrawer] = useState(null);
  const [opt, setOpt] = useState(null);
  const [optBusy, setOptBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const reduced = useMemo(
    () => matchMedia('(pointer: coarse)').matches || window.innerWidth < 900, []);

  const wall = project.walls.find((w) => w.id === project.activeWall) || project.walls[0];
  const lay = useMemo(() => layoutFor(project, wall), [project, wall]);
  const wallWarns = useMemo(() => wallWarnings(lay, project), [lay, project]);
  /* The whole joined run, so the 3D can show the corner rather than one wall
     at a time. A straight kitchen has nothing to join, so it stays as it was. */
  /* What the 3D shows.

     The joined run when there is one, plus every island where it actually
     stands, because an island you cannot see in the room with the walls is
     the one thing an island is for. A straight kitchen with no island still
     shows the wall you are working on, as it always did. */
  const room = useMemo(() => {
    const joined = project.room && project.room !== 'straight';
    const plan = floorPlan(project);
    const islands = plan.filter((r) => r.island);

    if (joined) return plan;
    if (!islands.length) return null;

    /* Straight, with an island. Show the wall you are on beside it, unless
       that is the island itself. */
    const active = project.walls.find((w) => w.id === project.activeWall);
    const here = active && !isIsland(active)
      ? [{ wall: active, lay: layoutFor(project, active), origin: [0, 0], rot: 0 }] : [];
    return [...here, ...islands];
  }, [project]);
  const roomIds = useMemo(
    () => (project.room && project.room !== 'straight' ? roomWallIds(project) : []), [project]);
  const placedSel = lay.placed.find((p) => p.item.uid === selected) || null;

  /* Hover holds a cabinet, not a snapshot of one. Resolving it against the
     current layout on every render means the card shows what the cabinet is
     now, rather than the sizes it had when the pointer went over it. */
  const hov = useMemo(() => {
    if (!hovered) return null;
    const id = hovered.item.uid;
    const lays = room ? room.map((r) => r.lay) : [lay];
    for (const l of lays) {
      const hit = l.placed.find((p) => p.item.uid === id);
      if (hit) return hit;
    }
    return null;
  }, [hovered, lay, room]);

  const mutate = (fn) => setProject((prev) => {
    const next = structuredClone(prev);
    const w = next.walls.find((x) => x.id === next.activeWall);
    fn(w, next);
    return next;
  });

  /* Adding a cabinet.

     It goes in the first gap on this wall that it actually fits in. If it
     will not fit anywhere and this wall turns a corner, it goes on the next
     wall in the run instead and the planner follows it there, which is what
     wrapping around a corner means when the walls are separate drawings.
     A blind corner is different: it belongs in the corner, so that is where
     it lands. */
  const addUnit = (familyId) => {
    const id = uid();
    const fam = FAMILY[familyId];
    const probe = buildUnit('probe', familyId, {}, project.cfg);

    /* Which side of an island it starts out looking at. A wall has one side,
       so this is always the front there and the setting is never written. */
    const wantSide = lay.island && side === 'back' ? 'back' : 'front';

    const place = (targetWall, targetLay, at = 'front') => {
      if (probe.corner) {
        const left = (probe.settings?.blindSide || 'right') === 'left';
        return {
          x: left ? targetLay.startOffset
            : Math.max(targetLay.startOffset, targetWall.length - probe.width),
          side: at,
        };
      }
      /* The rule lives in the model, so this screen cannot have its own
         slightly different version of it. */
      return placeOnRun(targetLay, probe, probe.width, at);
    };

    const landed = place(wall, lay, wantSide);
    let x = landed.x;
    let targetId = wall.id;
    const landedSide = landed.side;

    if (x === null) {
      const ids = roomWallIds(project);
      const i = ids.indexOf(wall.id);
      const nextId = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
      const nextWall = nextId ? project.walls.find((w) => w.id === nextId) : null;
      if (nextWall) {
        const nextLay = layoutFor(project, nextWall);
        const nx = place(nextWall, nextLay).x;
        if (nx !== null) { x = nx; targetId = nextId; }
      }
    }

    setProject((prev) => {
      const next = structuredClone(prev);
      const w = next.walls.find((q) => q.id === targetId);
      const settings = x === null ? {} : { x };
      if (landedSide === 'back') settings.side = 'back';
      w.units.push({ uid: id, familyId, settings });
      if (targetId !== prev.activeWall) next.activeWall = targetId;
      return next;
    });
    setSelected(id);
    setSelDrawer(null);

    /* Follow it. A cabinet that went on the other side of the island is not
       on the side you are looking at, and leaving the view where it was makes
       it look as though nothing happened. */
    if (landedSide !== wantSide) setSide(landedSide);

    if (targetId !== wall.id) {
      const name = project.walls.find((w) => w.id === targetId)?.name || targetId;
      setNotice(`${fam?.name || 'Cabinet'} did not fit on ${wall.name}, so it went on ${name}.`);
    } else if (landedSide !== wantSide) {
      setNotice(`The ${wantSide} of ${wall.name} is full, so ${fam?.name || 'the cabinet'} went on the ${landedSide}.`);
    } else if (x === null) {
      setNotice(`${fam?.name || 'Cabinet'} does not fit on ${wall.name}. It is on the end, past the wall.`);
    } else setNotice(null);
  };

  /* Committing a drag.

     Dragged off the end of a wall that turns a corner, a cabinet carries on
     to the next wall rather than piling up past the end. Dragged back before
     the start, it goes back the way it came. */
  const dropUnit = (u, x) => {
    const ids = roomWallIds(project);
    const i = ids.indexOf(wall.id);
    const placed = lay.placed.find((q) => q.item.uid === u);
    if (!placed) return;
    const w = placed.unit.width;

    const hop = (dir) => {
      const id = ids[i + dir];
      if (i < 0 || !id) return false;
      const target = project.walls.find((q) => q.id === id);
      if (!target) return false;
      const tLay = layoutFor(project, target);
      const nx = dir > 0 ? tLay.startOffset : Math.max(0, target.length - w);
      setProject((prev) => {
        const next = structuredClone(prev);
        const from = next.walls.find((q) => q.id === wall.id);
        const idx = from.units.findIndex((q) => q.uid === u);
        if (idx < 0) return prev;
        const [item] = from.units.splice(idx, 1);
        item.settings = { ...item.settings, x: Math.round(nx) };
        next.walls.find((q) => q.id === id).units.push(item);
        next.activeWall = id;
        return next;
      });
      setNotice(`Moved to ${target.name}, around the corner.`);
      return true;
    };

    if (x > wall.length - w / 2 && hop(1)) return;
    if (x + w < lay.startOffset + w / 2 && i > 0 && hop(-1)) return;

    setNotice(null);
    mutate((wl) => {
      const it = wl.units.find((q) => q.uid === u);
      if (it) it.settings = { ...it.settings, x: Math.round(x) };
    });
  };

  /* Unpin everything on this wall and let it pack back together. */
  const closeGaps = () => {
    setNotice(null);
    mutate((wl) => {
      for (const it of wl.units) {
        if (it.settings && 'x' in it.settings) { const s = { ...it.settings }; delete s.x; it.settings = s; }
      }
    });
  };

  const unpin = (u) => mutate((wl) => {
    const it = wl.units.find((q) => q.uid === u);
    if (it && it.settings) { const s = { ...it.settings }; delete s.x; it.settings = s; }
  });
  const changeUnit = (u, patch) =>
    mutate((w) => {
      const it = w.units.find((x) => x.uid === u);
      if (it) it.settings = { ...it.settings, ...patch };
    });
  /* Swap a cabinet onto a different preset, keeping the settings that still
     mean something. Used by the one time offer to move an old blind corner
     onto the one that derives its blind width from the benchtop. */
  const convertUnit = (u, toFamilyId) => mutate((w) => {
    const it = w.units.find((x) => x.uid === u);
    if (!it || !FAMILY[toFamilyId]) return;
    const keep = { ...it.settings };
    /* The stack belonged to the old preset's front, and the old blind width
       was an absolute number. Both are dropped so the new preset resolves its
       own, rather than carrying a front that no longer describes the cabinet. */
    delete keep.stack;
    delete keep.blindWidth;
    it.familyId = toFamilyId;
    it.settings = keep;
  });

  /* Duplicate a cabinet, dropped in straight after the one it came from.

     Everything about it comes along: its width, its front stack, its own
     board overrides. What does not come along is its position, because two
     cabinets pinned to the same millimetre are one cabinet drawn twice. The
     copy flows after the original instead. */
  /* mutate is a functional setState, so its recipe runs when React gets round
     to it and not on this line. Anything made inside it is still null when the
     next statement reads it. The id is decided out here instead, where it is
     known now, and the recipe uses it. */
  const duplicateUnit = (u) => {
    const newUid = uid();
    mutate((w) => {
      const i = w.units.findIndex((x) => x.uid === u);
      if (i < 0) return;
      const src = w.units[i];
      const settings = structuredClone(src.settings || {});
      delete settings.x;
      w.units.splice(i + 1, 0, { uid: newUid, familyId: src.familyId, settings });
    });
    setSelected(newUid);
  };

  /* Move a cabinet along its wall by a step. Nudging pins it, the same as
     dragging does, because putting something at a millimetre you chose is
     what pinning means. */
  const nudge = (u, dx) => {
    const at = lay.placed.find((q) => q.item.uid === u);
    if (!at) return;
    dropUnit(u, Math.max(0, Math.round(at.x + dx)));
  };

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

  /* --- what is already on the wall ---------------------------------------- */

  const addObstacle = (kindId) => {
    // Made out here for the same reason the duplicate's id is.
    const made = newObstacle(kindId, Math.round((wall.length || 3600) / 2));
    mutate((w) => { w.obstacles = [...(w.obstacles || []), made]; });
    setSelObstacle(made.id);
  };

  const changeObstacle = (id, patch) => mutate((w) => {
    w.obstacles = (w.obstacles || []).map((o) => (o.id === id ? { ...o, ...patch } : o));
  });

  const removeObstacle = (id) => {
    mutate((w) => { w.obstacles = (w.obstacles || []).filter((o) => o.id !== id); });
    setSelObstacle(null);
  };

  /* Per cabinet overrides live on the unit as settings.cfg. buildUnit layers
     them over the project config, so the cut list, drilling, nest, costing
     and print all follow without any of them knowing this screen exists.
     A null patch clears the lot and puts the cabinet back on the defaults. */
  const setOverride = (u, patch) => mutate((w) => {
    const it = w.units.find((x) => x.uid === u);
    if (!it) return;
    if (patch === null) { const s = { ...it.settings }; delete s.cfg; it.settings = s; return; }
    it.settings = { ...it.settings, cfg: { ...(it.settings.cfg || {}), ...patch } };
  });

  const setCfg = (patch) => setProject((prev) => ({ ...prev, cfg: { ...prev.cfg, ...patch } }));
  const resetCfg = () => setProject((prev) => ({ ...prev, cfg: { ...PROJECT } }));

  /* Room shape and the length of any wall in it. Changing the shape only
     changes which walls are joined at a corner: nothing is deleted, so
     switching back to one wall gives you everything you had. */
  const setRoom = (shape) => setProject((prev) => ({ ...prev, room: shape }));
  const setLengthOf = (id, v) => setProject((prev) => ({
    ...prev, walls: prev.walls.map((w) => (w.id === id ? { ...w, length: v } : w)),
  }));

  /* --- the walls themselves ----------------------------------------------- */

  const changeWall = (id, patch) => setProject((prev) => ({
    ...prev, walls: prev.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
  }));

  /* A new wall or island. The id has to be unique and short, because it is
     the prefix on every part code that comes off it: A1-SIDE-L is readable,
     a generated id is not. */
  const addWall = (kind) => {
    const used = new Set(project.walls.map((w) => w.id));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    let id;
    if (kind === 'island') {
      let n = 1;
      while (used.has(n === 1 ? 'ISL' : `ISL${n}`)) n += 1;
      id = n === 1 ? 'ISL' : `ISL${n}`;
    } else {
      id = [...letters].find((c) => !used.has(c)) || `W${used.size + 1}`;
    }

    const wallCount = project.walls.filter((w) => !isIsland(w)).length;
    const islandCount = project.walls.filter((w) => isIsland(w)).length;

    const made = kind === 'island'
      ? {
        id, name: islandCount ? `Island ${islandCount + 1}` : 'Island', kind: 'island',
        length: 2400, depth: 1120, obstacles: [], units: [],
      }
      : {
        id, name: `Wall ${letters[wallCount] || id}`, kind: 'wall',
        length: 3600, obstacles: [], units: [],
      };

    setProject((prev) => ({ ...prev, walls: [...prev.walls, made], activeWall: id }));
    setSelected(null);
    setSide('front');
  };

  /* Removing one takes its cabinets with it, which is worth saying out loud
     rather than finding out afterwards. The last one cannot go: a kitchen
     with no walls is not a state anything downstream can draw. */
  const removeWall = (id) => {
    const w = project.walls.find((q) => q.id === id);
    const count = (w?.units || []).length;
    if (count && !confirm(
      `Remove ${w.name} and the ${count} cabinet${count === 1 ? '' : 's'} on it?`)) return;

    setProject((prev) => {
      if (prev.walls.length <= 1) return prev;
      const walls = prev.walls.filter((q) => q.id !== id);
      return {
        ...prev,
        walls,
        locked: (prev.locked || []).filter(
          (uid2) => walls.some((q) => q.units.some((u) => u.uid === uid2))),
        activeWall: prev.activeWall === id ? walls[0].id : prev.activeWall,
      };
    });
    setSelected(null);
  };

  /* Locks are a property of the kitchen, not of this session, so a cabinet
     you have already built stays locked after a reload. */
  const locked = project.locked || [];
  const toggleLock = (u) => setProject((prev) => {
    const cur = prev.locked || [];
    return { ...prev, locked: cur.includes(u) ? cur.filter((x) => x !== u) : [...cur, u] };
  });

  /* The search takes about a second on a full wall. Yield the frame first so
     the button can show it is working instead of freezing the tablet. */
  const runOptimise = () => {
    setOptBusy(true);
    setTimeout(() => {
      try {
        setOpt({
          ...optimiseWall(wall, project.cfg, new Set(locked)),
          project: optimiseProject(project),
        });
      } finally { setOptBusy(false); }
    }, 30);
  };

  const applyOptimise = (widths) => {
    mutate((w) => { w.units.forEach((it, i) => { it.settings = { ...it.settings, width: widths[i] }; }); });
    setOpt(null);
  };

  /* A project wide plan. It patches the defaults, and where the plan is about
     boards it also clears the board a single cabinet was set to, because
     leaving one cabinet on the old species is exactly what the plan is trying
     to stop. Thicknesses and everything else set per cabinet are left alone. */
  const applyPlan = (plan) => {
    const boardKeys = ['carcassBoard', 'frontBoard', 'backBoard', 'boxBoard', 'boxBaseBoard'];
    setProject((prev) => {
      const next = structuredClone(prev);
      next.cfg = { ...next.cfg, ...plan.patch };
      if (plan.strip) {
        for (const w of next.walls) {
          for (const it of w.units) {
            if (!it.settings?.cfg) continue;
            for (const k of boardKeys) delete it.settings.cfg[k];
            if (!Object.keys(it.settings.cfg).length) delete it.settings.cfg;
          }
        }
      }
      return next;
    });
    setOpt(null);
  };

  const pickUnit = (u, drawer = null) => { setSelected(u); setSelDrawer(drawer); };

  /* ---------------------------------------------------------------------------
     Keyboard.

     What you do over and over while laying out a kitchen: pick a cabinet,
     nudge it, copy it, get rid of it. Doing that with the mouse alone means
     crossing to the inspector and back for every one.

     A shortcut never fires while you are typing. A field's own keys belong to
     the field, and Delete inside a width box has to delete a digit and not the
     cabinet the box belongs to.
     --------------------------------------------------------------------------- */
  useEffect(() => {
    const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
      || el.isContentEditable);

    const onKey = (e) => {
      if (typing(e.target)) return;
      if (e.altKey) return;

      const step = e.shiftKey ? 50 : 10;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        if (!selected) return;
        e.preventDefault();
        duplicateUnit(selected);
        return;
      }
      if (e.metaKey || e.ctrlKey) return;

      switch (e.key) {
        case 'Escape':
          setSelected(null); setSelDrawer(null);
          break;
        case 'Delete':
        case 'Backspace':
          if (!selected) return;
          e.preventDefault();
          removeUnit(selected);
          break;
        case 'ArrowLeft':
          if (!selected) return;
          e.preventDefault();
          nudge(selected, -step);
          break;
        case 'ArrowRight':
          if (!selected) return;
          e.preventDefault();
          nudge(selected, step);
          break;
        case '[':
          if (selected) moveUnit(selected, -1);
          break;
        case ']':
          if (selected) moveUnit(selected, 1);
          break;
        case '?':
          setKeysOpen((k) => !k);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const view3d = (
    <div className="three-wrap">
      <Kitchen3D lay={lay} room={room} cfg={project.cfg} selected={selected} setSelected={(u) => pickUnit(u)}
                 setHovered={setHovered} show={show} preset={preset} nonce={nonce}
                 eye={eye} reduced={reduced} open={open} silhouette={show.person} />
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
        {[['walls', 'Walls'], ['bench', 'Benchtop'], ['wallCabs', 'Wall cabs'], ['appliances', 'Appliances'],
          ['arcs', 'Door swing'], ['person', 'Person']].map(([k, label]) => (
          <button key={k} className="seg__item" aria-pressed={show[k]}
                  onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>{label}</button>
        ))}
        <span className="vp-toolbar__sep" />
        <button className="seg__item" disabled={!selected}
                onClick={() => { setEye(false); setPreset('Frame'); setNonce((n) => n + 1); }}
                title="Move the camera to the selected cabinet">Frame</button>
      </div>

      <div className="vp-toolbar float-bl open-control">
        <label className="field__label" htmlFor="open-fronts">Open</label>
        <input id="open-fronts" type="range" min="0" max="100" step="1"
               value={Math.round(open * 100)}
               onChange={(e) => setOpen(Number(e.target.value) / 100)} />
        <span className="num">{Math.round(open * 100)}%</span>
        <button className="btn btn--ghost"
                onClick={() => setOpen((o) => (o > 0 ? 0 : 1))}>
          {open > 0 ? 'Shut' : 'Open'}
        </button>
      </div>
      {eye && <div className="eye-hint">W A S D to walk. Drag to look.</div>}
      {hov && (
        <div className="part-card float-br">
          <b>{hov.label || hov.unit.family.name}</b>
          <span>{hov.unit.family.name}</span>
          <span>{hov.unit.width} x {hov.unit.height} x {hov.unit.depth}</span>
        </div>
      )}
    </div>
  );

  const elevation = (
    <div className="elev-wrap" ref={elevRef} onClick={() => pickUnit(null)}>
      <Elevation lay={lay} cfg={project.cfg} selected={selected} selDrawer={selDrawer}
                 onSelect={pickUnit} onHover={setHovered} onDrag={dropUnit}
                 onObstacle={(id) => { setSelObstacle(id); setSelected(null); }}
                 side={side} />

      {/* An island has two sides. You work on one at a time, and a cabinet
          added while the back is showing goes on the back. */}
      {lay.island && (
        <div className="seg elev-side no-print" role="group" aria-label="Which side of the island">
          {[['front', 'Front'], ['back', 'Back']].map(([k, label]) => (
            <button key={k} className="seg__item" aria-pressed={side === k}
                    onClick={(e) => { e.stopPropagation(); setSide(k); setSelected(null); }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn--ghost elev-svg no-print"
              title="Save this elevation as an SVG you can open anywhere"
              onClick={(e) => {
                e.stopPropagation();
                const svg = elevRef.current?.querySelector('svg');
                downloadSvg(svg, safeFileName(`${project.name} ${wall.name}`, '.svg'));
              }}>
        SVG
      </button>
    </div>
  );

  return (
    <div className="planner">

      <div className="tabs wall-tabs" role="tablist">
        {project.walls.map((w) => (
          <button key={w.id}
                  className={`tab ${roomIds.includes(w.id) ? 'tab--room' : ''} ${isIsland(w) ? 'tab--island' : ''}`}
                  role="tab" aria-selected={w.id === project.activeWall}
                  title={isIsland(w) ? 'Free standing, two sides'
                    : roomIds.includes(w.id) ? 'Joined at a corner in this room shape' : undefined}
                  onClick={() => { setProject((p) => ({ ...p, activeWall: w.id })); setSelected(null); setSide('front'); }}>
            {w.name} <span className="tab__len">{w.length}</span>
          </button>
        ))}
        <button className="tab tab--add" onClick={() => setWallsOpen(true)}
                title="Add, remove and set up the walls and islands in this kitchen">
          Walls
        </button>

        <div className="wall-len">
          <div className="seg" role="group" aria-label="Arrangement">
            {[['split', 'Split'], ['drawer', 'Drawer'], ['focus', 'Focus']].map(([k, label]) => (
              <button key={k} className="seg__item" aria-pressed={arrangement === k}
                      onClick={() => setArrangement(k)}>{label}</button>
            ))}
          </div>
          <button className="btn btn--ghost" onClick={closeGaps}
                  title="Unpin every cabinet on this wall and pack them back together">Close gaps</button>
          <button className="btn btn--ghost" onClick={() => setAdvOpen(true)}>Advanced design</button>
          <button className="btn btn--ghost" onClick={runOptimise} disabled={optBusy}>
            {optBusy ? 'Working' : 'Optimise'}
          </button>
        </div>
      </div>

      <div className={`planner-body arr-${arrangement}`}>
        <aside className="rail">
          <Picker onAdd={addUnit} cfg={project.cfg} />
          <Obstacles wall={wall} selected={selObstacle} onSelect={setSelObstacle}
                     onAdd={addObstacle} onChange={changeObstacle} onRemove={removeObstacle} />
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

          {(notice || wallWarns.length > 0) && (
            <div className="wall-warnings">
              {notice && (
                <div className="warn-inline warn-inline--note">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <circle cx="8" cy="8" r="6" /><path d="M8 7.4v4M8 5.1v.1" strokeLinecap="round" />
                  </svg>
                  <span>{notice}</span>
                </div>
              )}
              {wallWarns.map((w, i) => (
                <div key={i} className={`warn-inline ${w.level === 'error' ? 'warn-inline--error'
                  : w.level === 'note' ? 'warn-inline--note' : ''}`}>
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
                     onDrop={dropUnit} onUnpin={unpin}
                     selDrawer={selDrawer} setSelDrawer={setSelDrawer}
                     locked={placedSel ? locked.includes(placedSel.item.uid) : false}
                     onLock={toggleLock} onOverride={setOverride}
                     onChange={changeUnit} onConvert={convertUnit}
                     onDuplicate={duplicateUnit}
                     onRemove={removeUnit} onMove={moveUnit}
                     onOpen3D={onOpen3D} onClose={() => pickUnit(null)} />
        </aside>
      </div>

      {advOpen && (
        <Advanced cfg={project.cfg} onChange={setCfg} onReset={resetCfg}
                  onClose={() => setAdvOpen(false)} />
      )}
      {keysOpen && <Shortcuts onClose={() => setKeysOpen(false)} />}
      {wallsOpen && (
        <WallManager project={project} onClose={() => setWallsOpen(false)}
                     onRoom={setRoom} onChange={changeWall} onAdd={addWall}
                     onRemove={removeWall} onSelect={(id) => {
                       setProject((p) => ({ ...p, activeWall: id }));
                       setSelected(null); setSide('front');
                     }} />
      )}
      {opt && (
        <OptimiseResult result={opt} project={project} wall={wall} locked={locked}
                        onApply={applyOptimise} onApplyPlan={applyPlan}
                        onClose={() => setOpt(null)} />
      )}
    </div>
  );
}


/* ---------------------------------------------------------------------------
   The shortcuts, written down.

   A shortcut nobody knows about is not a shortcut. Press ? to see them, which
   is itself one of them, so the list says so first.
   --------------------------------------------------------------------------- */

const KEYS = [
  ['?', 'Show this list'],
  ['Esc', 'Nothing selected'],
  ['Left and Right', 'Nudge the selected cabinet 10mm'],
  ['Shift and Left or Right', 'Nudge it 50mm'],
  ['[ and ]', 'Move it earlier or later in the run'],
  ['Ctrl D, or Cmd D', 'Duplicate it'],
  ['Delete', 'Remove it'],
  ['Ctrl Z, or Cmd Z', 'Undo. Add Shift to redo'],
];

function Shortcuts({ onClose }) {
  return (
    <div className="dialog-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog keys-dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="adv-head">
          <div>
            <span className="dialog__title">Keyboard</span>
            <p className="note">These work on the planner, whenever you are not typing in a field.</p>
          </div>
          <Close onClick={onClose} />
        </div>
        <div className="adv-body">
          <table className="keys-table">
            <tbody>
              {KEYS.map(([key, what]) => (
                <tr key={key}><th scope="row"><kbd>{key}</kbd></th><td>{what}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------------------
   What is already on the wall.

   A kitchen is not drawn on an empty wall. The window, the waste pipe, the
   meter box: each of them changes what you can build, and until now none of
   them could be said out loud unless you edited the source.
   --------------------------------------------------------------------------- */

function Obstacles({ wall, selected, onSelect, onAdd, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const list = wall.obstacles || [];
  const current = list.find((o) => o.id === selected) || null;

  return (
    <section className={`obstacles ${open || list.length ? 'is-open' : ''}`}>
      <button className="sub-toggle obstacles-head" aria-expanded={open || list.length > 0}
              onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="field__label">On this wall</span>
        {list.length > 0 && <span className="badge badge--neutral badge--num">{list.length}</span>}
      </button>

      {(open || list.length > 0) && (
        <>
          {list.length > 0 && (
            <ul className="obstacle-list">
              {list.map((o) => (
                <li key={o.id}>
                  <button className={`obstacle-row ${o.id === selected ? 'is-sel' : ''}`}
                          onClick={() => onSelect(o.id === selected ? null : o.id)}>
                    <span className={`obstacle-dot obstacle-dot--${natureOf(o)}`} />
                    <span className="obstacle-name">{o.label}</span>
                    <span className="num">{Math.round(o.x)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {current && (
            <div className="obstacle-fields">
              <p className="note">{obstacleKind(current.kind).note}</p>
              <div className="settings-grid">
                <Board label="What it is" value={current.label} options={OBSTACLE_LIST.map((k) => k.name)}
                       onChange={(v) => onChange(current.id, { label: v })} />
                <Choice label="Treat it as" value={natureOf(current)}
                        options={[{ value: 'blocks', label: 'In the way' },
                          { value: 'service', label: 'Build around it' },
                          { value: 'note', label: 'Just a note' }]}
                        onChange={(v) => onChange(current.id, { nature: v })} />
              </div>
              <div className="settings-grid">
                <Num label="Along the wall" value={Math.round(current.x)} min={0} max={12000}
                     onChange={(v) => onChange(current.id, { x: v ?? current.x })} />
                <Num label="Off the floor" value={Math.round(current.y)} min={0} max={3000}
                     onChange={(v) => onChange(current.id, { y: v ?? current.y })} />
                <Num label="Wide" value={Math.round(current.w)} min={1} max={6000}
                     onChange={(v) => onChange(current.id, { w: v ?? current.w })} />
                <Num label="Tall" value={Math.round(current.h)} min={1} max={3000}
                     onChange={(v) => onChange(current.id, { h: v ?? current.h })} />
              </div>
              <button className="btn btn--danger"
                      onClick={() => onRemove(current.id)}>Remove it</button>
            </div>
          )}

          <div className="obstacle-add">
            {OBSTACLE_LIST.map((k) => (
              <button key={k.id} className="btn btn--ghost" title={k.note}
                      onClick={() => onAdd(k.id)}>{k.name}</button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}


/* ---------------------------------------------------------------------------
   The walls in this kitchen.

   The tabs used to be however many walls the starter project happened to
   have, and the room shape and the wall lengths lived in Advanced design, two
   screens away from the tabs they were about. Everything about what a wall is
   is here now, next to the list of them.
   --------------------------------------------------------------------------- */

function WallManager({ project, onClose, onRoom, onChange, onAdd, onRemove, onSelect }) {
  const roomIds = roomWallIds(project);
  const walls = project.walls.filter((w) => !isIsland(w));
  const islands = project.walls.filter((w) => isIsland(w));
  const shape = ROOM_SHAPES.find((s) => s.id === (project.room || 'straight'));

  const row = (w) => {
    const inRoom = roomIds.includes(w.id);
    const island = isIsland(w);
    return (
      <div className={`wall-row ${w.id === project.activeWall ? 'is-active' : ''}`} key={w.id}>
        <div className="wall-row__head">
          <button className="wall-row__name" onClick={() => onSelect(w.id)}
                  title="Work on this one">
            {w.name}
            {inRoom && <span className="badge badge--neutral">In the room shape</span>}
            {island && <span className="badge badge--accent">Free standing</span>}
          </button>
          <button className="btn btn--danger" disabled={project.walls.length <= 1}
                  onClick={() => onRemove(w.id)}>Remove</button>
        </div>

        <div className="settings-grid">
          <Board label="Name" value={w.name} options={[]}
                 onChange={(v) => onChange(w.id, { name: v })} />
          <Num label={island ? 'Long' : 'Length'} value={w.length} min={300} max={12000}
               onChange={(v) => onChange(w.id, { length: v ?? w.length })} />
          {island && (
            <Num label="Deep" value={islandDepth(w, project.cfg)} min={300} max={2400}
                 onChange={(v) => onChange(w.id, { depth: v ?? islandDepth(w, project.cfg) })} />
          )}
        </div>

        {island && (
          <div className="settings-grid">
            <Num label="Along the back wall" value={islandAt(w, project.cfg).x} min={0} max={12000}
                 onChange={(v) => onChange(w.id, {
                   at: { ...islandAt(w, project.cfg), x: v ?? islandAt(w, project.cfg).x },
                 })} />
            <Num label="Out from the back wall" value={islandAt(w, project.cfg).y} min={0} max={9000}
                 onChange={(v) => onChange(w.id, {
                   at: { ...islandAt(w, project.cfg), y: v ?? islandAt(w, project.cfg).y },
                 })} />
          </div>
        )}

        {island && (
          <p className="note">
            Cabinets go on both sides, back to back. Deep enough for two of them
            is {project.cfg.baseDepth * 2}mm; less than that and one side is
            shallower than a standard cabinet. Where it stands decides the
            walkway either side of it, which Checks measures.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="dialog-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog walls-dialog" role="dialog" aria-modal="true" aria-label="Walls">
        <div className="adv-head">
          <div>
            <span className="dialog__title">Walls</span>
            <p className="note">
              What this kitchen is built against. The shape decides which walls meet
              at a corner; anything past it stands on its own, and so does an island.
            </p>
          </div>
          <Close onClick={onClose} />
        </div>

        <div className="adv-body">
          <section className="adv-group">
            <span className="field__label">Room shape</span>
            <div className="settings-grid">
              <Choice label="Shape" value={project.room || 'straight'}
                      options={ROOM_SHAPES.map((x) => ({ value: x.id, label: x.name }))}
                      onChange={onRoom} />
            </div>
            <p className="note">
              The first {shape.walls} wall{shape.walls === 1 ? '' : 's'} join at a corner.
              An L turns at the right hand end of the first wall. A U comes back down
              the other side. Put a blind corner cabinet at the end of each wall that
              turns, so the next run starts clear of it.
            </p>
          </section>

          <section className="adv-group">
            <span className="field__label">Walls</span>
            {walls.map(row)}
            <div className="group-foot">
              <button className="btn btn--secondary" onClick={() => onAdd('wall')}>
                Add a wall
              </button>
            </div>
          </section>

          <section className="adv-group">
            <span className="field__label">Islands</span>
            {islands.length === 0 && (
              <p className="note">
                None yet. An island stands free in the middle of the floor with a
                length and a depth of its own, and takes cabinets on both sides.
              </p>
            )}
            {islands.map(row)}
            <div className="group-foot">
              <button className="btn btn--secondary" onClick={() => onAdd('island')}>
                Add an island
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
