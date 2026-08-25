import { useEffect, useMemo, useRef, useState } from 'react';
import { finish } from './finishes.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { bounds } from './cabinet.js';
import { carcassInterior, drawerSetout } from './catalog.js';
import { chainStops, dimLines, levelOff, mmLabel } from './dim.js';
import { openingSide } from './draw2d.js';

/* Materials. Matte, close to the real board. Doors sit one value off the
   carcass so the eye separates them without needing the outline to do it.
   These do not follow the theme: white melamine is off white in a dark room
   too. Only the background and the ground follow the theme. */
/* Kept for the demo cabinet in cabinet.js, which describes its parts by tone
   rather than by role. Anything built by the catalog carries a finish and
   reads that instead. */
const TONES = {
  melamine: { color: '#F1EDE6', roughness: 0.80, metalness: 0 },
  front:    { color: '#DED6C6', roughness: 0.78, metalness: 0 },
  mdf:      { color: '#C0B49B', roughness: 0.90, metalness: 0 },
  ply:      { color: '#D9BD8C', roughness: 0.82, metalness: 0 },
  metal:    { color: '#9AA0A6', roughness: 0.45, metalness: 0.55 },
};

/** What a part is made of, as three.js wants it. */
function surfaceFor(p) {
  if (p.finish) {
    const f = finish(p.finish);
    return { color: f.hex, roughness: f.roughness, metalness: f.metalness };
  }
  return TONES[p.tone] || TONES[p.material?.tone] || TONES.melamine;
}

const EDGE = '#2A2722';

/* Selection, in the accent. Read from the tokens rather than written out
   here, so changing the accent changes what a selected part looks like
   instead of leaving one blue cabinet in a green app. Fallbacks match the
   light theme, for the frame or two before the sheet is parsed. */
const SELECT_FILL = () => cssVar('--accent-weak', '#E7EFE9');
const SELECT_EDGE = () => cssVar('--accent', '#356F51');
const smoothstep = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* Geometry cache. A kitchen repeats the same panel size many times over, so
   identical boxes share one BoxGeometry and one EdgesGeometry rather than
   allocating a pair per part. */
const geoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) {
    const box = new THREE.BoxGeometry(w, h, d);
    g = { box, edges: new THREE.EdgesGeometry(box) };
    geoCache.set(k, g);
  }
  return g;
}

export function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* --- one part ------------------------------------------------------------ */

export function Part({ p, offset, selected, ghosted, hidden, onHover, onSelect, clip, showLabel,
                       warn, swing }) {
  const { box: geo, edges } = boxGeo(p.size[0], p.size[1], p.size[2]);

  const tone = surfaceFor(p);
  const centre = [
    p.pos[0] + p.size[0] / 2 + offset[0],
    p.pos[1] + p.size[1] / 2 + offset[1],
    p.pos[2] + p.size[2] / 2 + offset[2],
  ];

  if (hidden) return null;

  const body = (
    <group position={swing ? [centre[0] - swing.pivot[0], centre[1], centre[2] - swing.pivot[1]]
      : centre}>
      <mesh
        geometry={geo}
        /* Every panel casts and takes a shadow. Without this a kitchen is lit
           flat: a wall cabinet throws nothing onto the splashback under it, so
           it reads as painted on the wall rather than hanging off it, and the
           whole picture loses its depth. Costs nothing where the canvas has no
           shadow map, which is the single cabinet viewer. */
        castShadow
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); onHover(p); }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null); }}
        onClick={(e) => { e.stopPropagation(); onSelect(p); }}
      >
        <meshStandardMaterial
          color={selected ? SELECT_FILL() : tone.color}
          roughness={tone.roughness}
          metalness={tone.metalness}
          transparent={ghosted}
          opacity={ghosted ? 0.16 : 1}
          depthWrite={!ghosted}
          clippingPlanes={clip}
          clipShadows
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={1}>
        <lineBasicMaterial
          color={selected ? SELECT_EDGE() : warn ? '#B4791E' : EDGE}
          transparent
          opacity={ghosted ? 0.12 : selected || warn ? 1 : 0.55}
          clippingPlanes={clip}
        />
      </lineSegments>
      {showLabel && !ghosted && (
        <Html center distanceFactor={900} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className="pt-label">{p.code.split('-').slice(1).join('-')}</span>
        </Html>
      )}
    </group>
  );

  /* A door does not slide open, it swings, so opening one is a rotation about
     its hinge stile. The outer group stands on the hinge and turns; the inner
     group carries the panel back out to where it really is. Without a swing
     there is no outer group at all and this is the same node it always was. */
  if (!swing) return body;
  return (
    <group position={[swing.pivot[0], 0, swing.pivot[1]]} rotation={[0, swing.angle, 0]}>
      {body}
    </group>
  );
}

/* --- dimension annotation -------------------------------------------------
   The geometry, and the drawing conventions behind it, are in dim.js so they
   can be checked without a browser. This is only the drawing of them.
   --------------------------------------------------------------------------- */

function Dim({ a, b, dir, off, label, dimColor }) {
  const g = dimLines(a, b, dir, off);
  if (!g) return null;      // nothing to measure, and no room to say so
  return (
    <group>
      {g.witness.map((seg, i) => (
        <Line key={`w${i}`} points={seg} color={dimColor} lineWidth={1} />
      ))}
      <Line points={g.line} color={dimColor} lineWidth={1} />
      {g.arrows.map((seg, i) => (
        <Line key={`a${i}`} points={seg} color={dimColor} lineWidth={1} />
      ))}
      <Html center position={g.mid} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <span className="dim-label">{label}</span>
      </Html>
    </group>
  );
}

/* A continuous chain: each link starts where the last one ended, so the parts
   add up to the whole by construction. */
function DimChain({ at, point, dir, off, dimColor }) {
  return (
    <group>
      {at.slice(0, -1).map((v, i) => (
        <Dim key={`${v}-${at[i + 1]}`} a={point(v)} b={point(at[i + 1])}
             dir={dir} off={off} dimColor={dimColor}
             label={mmLabel(at[i + 1] - v)} />
      ))}
    </group>
  );
}

/* The overall sizes. `level` steps them outwards so a detail chain can sit
   inside them, which is the order a drawing puts them in. */
function Dimensions({ size, dimColor, level = 0 }) {
  const [W, H, D] = size;
  const off = levelOff(level);
  return (
    <group>
      <Dim a={[-W / 2, 2, D / 2]} b={[W / 2, 2, D / 2]} dir={[0, 0, 1]} off={off}
           label={mmLabel(W)} dimColor={dimColor} />
      <Dim a={[-W / 2, 0, D / 2]} b={[-W / 2, H, D / 2]} dir={[-1, 0, 0]} off={off}
           label={mmLabel(H)} dimColor={dimColor} />
      <Dim a={[W / 2, 2, -D / 2]} b={[W / 2, 2, D / 2]} dir={[1, 0, 0]} off={off}
           label={mmLabel(D)} dimColor={dimColor} />
    </group>
  );
}

/* --- where the drawer boxes sit ------------------------------------------
   Read off the finished part list, so a dimension cannot disagree with the
   box it points at. Two chains, both in the front plane:

   - up the left, every drawer in the cabinet: the floor to the underside of
     the first box, the box itself, the gap to the next, and so on to the top.
     The gaps ARE the clearances, so a box being squeezed shows it here.
   - across the bottom, the side setout. Every drawer in a cabinet shares it,
     so it is drawn once off the lowest box rather than repeated up the run.
   --------------------------------------------------------------------------- */

function DrawerDims({ cabinet, dimColor }) {
  const setout = useMemo(() => drawerSetout(cabinet), [cabinet]);
  if (!setout.length) return null;

  const [W, H, D] = cabinet.size;
  /* The parts are drawn inside a group shifted to centre the cabinet, so the
     dimensions are shifted the same way and can be written in the cabinet's
     own coordinates, which is what the setout is in. */
  const onLeft = (y) => [-W / 2, y, D / 2];
  const onFloor = (x) => [x - W / 2, 0, D / 2];

  /* The carcass faces are stops in their own right, so the board thickness
     is a dimension you can read rather than something swallowed into the gap
     next to it: outside, the panel, the clearance, then the box. */
  const inside = carcassInterior(cabinet);
  const up = chainStops(0, H, [
    ...(inside ? [inside.floor, inside.ceiling] : []),
    ...setout.flatMap((d) => [d.bottom, d.top]),
  ]);
  const across = chainStops(0, W, [
    ...(inside ? [inside.left, inside.right] : []),
    setout[0].left, setout[0].right,
  ]);

  return (
    <group>
      <DimChain at={up} point={onLeft} dir={[-1, 0, 0]}
                off={levelOff(0)} dimColor={dimColor} />
      <DimChain at={across} point={onFloor} dir={[0, -1, 0]}
                off={levelOff(0)} dimColor={dimColor} />
    </group>
  );
}

/* --- camera presets, animated -------------------------------------------- */

/* Directions only. The distance is computed from what is actually on screen,
   so a preset frames the cabinet whether it is assembled or fully exploded. */
const PRESET_DIRS = {
  Front: [0, 0, 1],
  Left: [-1, 0, 0],
  Right: [1, 0, 0],
  Top: [0, 1, 0.0015],
  Iso: [0.62, 0.46, 0.74],
};

function CameraRig({ preset, target, nonce, distance }) {
  const { camera, controls } = useThree();
  const move = useRef(null);   // full preset move
  const dolly = useRef(null);  // distance only, keeps the current angle
  const tgt = useMemo(() => new THREE.Vector3(...target), [target]);

  useEffect(() => {
    if (!controls) return;
    const d = new THREE.Vector3(...(PRESET_DIRS[preset] || PRESET_DIRS.Iso)).normalize();
    move.current = {
      t0: performance.now(),
      fromPos: camera.position.clone(),
      toPos: tgt.clone().addScaledVector(d, distance),
      fromTgt: controls.target.clone(),
      toTgt: tgt.clone(),
    };
    dolly.current = null;
    // distance is deliberately not a dependency: a preset press should frame
    // the current state, but changing explode must not re-run the whole move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, controls]);

  /* Dragging the exploded slider dollies out so the assembly stays framed.
     Direction and target are untouched, so the user keeps their orbit, and
     the dolly stops as soon as it lands rather than fighting a manual zoom. */
  useEffect(() => {
    if (!controls || move.current) return;
    const cur = camera.position.distanceTo(controls.target);
    if (Math.abs(cur - distance) < 1) return;
    dolly.current = { t0: performance.now(), from: cur, to: distance };
  }, [distance, controls, camera]);

  useFrame(() => {
    if (!controls) return;

    const m = move.current;
    if (m) {
      const k = Math.min(1, (performance.now() - m.t0) / 400);
      const e = easeOut(k);
      camera.position.lerpVectors(m.fromPos, m.toPos, e);
      controls.target.lerpVectors(m.fromTgt, m.toTgt, e);
      controls.update();
      if (k >= 1) move.current = null;
      return;
    }

    const d = dolly.current;
    if (d) {
      const k = Math.min(1, (performance.now() - d.t0) / 300);
      const want = d.from + (d.to - d.from) * easeOut(k);
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, want);
      controls.update();
      if (k >= 1) dolly.current = null;
    }
  });

  return null;
}

/* --- scene --------------------------------------------------------------- */

function Scene({
  cabinet, explode, doors, selected, hovered, setHovered, setSelected,
  show, ghostMode, section, preset, nonce, reduced, theme,
}) {
  const [W, H, D] = cabinet.size;
  const { gl, camera } = useThree();

  const t = smoothstep(explode / 100);

  /* Frame from the real bounds rather than a guessed distance, so a preset
     fits the cabinet whether it is assembled or fully exploded. */
  const bAss = useMemo(() => bounds(cabinet, 0), [cabinet]);
  const bExp = useMemo(() => bounds(cabinet, 1), [cabinet]);

  /* How far in front of the carcass an open cabinet reaches: a door swung
     back stands out by its own width, a drawer by its runner travel. The
     frame has to allow for it or opening the cabinet pushes half of it off
     screen. */
  const openReach = useMemo(() => {
    if (doors !== 'open') return 0;
    let reach = 0;
    for (const q of cabinet.parts) {
      if (q.group !== 'front') continue;
      if (q.drawer) reach = Math.max(reach, cabinet.cfg.runnerLength);
      else if (!q.code.endsWith('-BLIND') && !q.code.endsWith('-FALSE')) {
        reach = Math.max(reach, q.size[0]);
      }
    }
    return reach;
  }, [cabinet, doors]);

  const target = useMemo(() => [
    bAss.min[0] + bAss.size[0] / 2 - W / 2,
    bAss.min[1] + bAss.size[1] / 2,
    /* An open cabinet reaches forward, so the middle of what you are looking
       at is in front of the middle of the carcass. */
    bAss.min[2] + bAss.size[2] / 2 - D / 2 + openReach * (1 - t) / 2,
  ], [bAss, W, D, openReach, t]);

  const distance = useMemo(() => {
    const now = [0, 1, 2].map((i) => bAss.size[i] + (bExp.size[i] - bAss.size[i]) * t);
    now[2] += openReach * (1 - t);
    const radius = Math.max(...now) * 0.5 * 1.42;
    return radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
  }, [bAss, bExp, t, camera, openReach]);

  const dimColor = cssVar('--dw-dim', '#7A736A');
  const groundColor = cssVar('--sunken', '#EAE7E1');

  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);

  /* A clipping plane keeps the half space where normal . point + constant >= 0.
     With a negative normal and the constant set to the cut position, that
     keeps everything below the cut on that axis, which is what a section
     drawing shows. The cabinet group is offset, so these are world values. */
  const clip = useMemo(() => {
    if (!section.on || reduced) return [];
    const range = { x: [-W / 2, W / 2], y: [0, H], z: [-D / 2, D / 2] }[section.axis];
    const normal = { x: [-1, 0, 0], y: [0, -1, 0], z: [0, 0, -1] }[section.axis];
    const at = range[0] + (section.pos / 100) * (range[1] - range[0]);
    return [new THREE.Plane(new THREE.Vector3(...normal), at)];
  }, [section, W, H, D, reduced]);

  const travel = cabinet.cfg.runnerLength;
  const openAmt = doors === 'open' ? 1 : 0;

  const all = useMemo(
    () => [...cabinet.parts, ...cabinet.hardware],
    [cabinet],
  );

  const partOffset = (p) => {
    const ex = [p.explode[0] * t, p.explode[1] * t, p.explode[2] * t];
    // Opening and exploding at once reads as noise, so opening fades out.
    if (p.drawer && (p.group === 'front' || p.group === 'box')) {
      ex[2] += travel * openAmt * (1 - t);
    }
    return ex;
  };

  const isHidden = (p) => {
    if (p.group === 'back' && !show.back) return true;
    if (p.group === 'hardware' && !show.hardware) return true;
    if (p.group === 'front' && doors === 'hidden') return true;
    return false;
  };

  /* Opening a cabinet means opening all of it. A drawer runs out on its
     runners, which the offset above already does, and a door turns on its
     hinges, which is this. Without it, Open did nothing at all to a cabinet
     with no drawers in it: you pressed it on a pantry and watched a sealed
     box stay sealed.

     The hinges are on the stile away from the handle, which is the rule the
     elevation already uses to decide where to draw the handle, so the two
     views agree about which way a door opens. A blind panel and a false
     front are screwed on and do not move.

     Nothing swings while the cabinet is exploded: the parts are flying apart
     to be looked at individually and turning one of them as it goes reads as
     a glitch. */
  const swingOf = (p) => {
    if (!openAmt || t > 0.02) return null;
    if (p.group !== 'front' || p.drawer) return null;
    if (p.code.endsWith('-BLIND') || p.code.endsWith('-FALSE')) return null;

    const hinge = openingSide(p.pos[0], p.size[0], W) === 'right' ? 'left' : 'right';
    const pivotX = hinge === 'left' ? p.pos[0] : p.pos[0] + p.size[0];
    /* Just under a right angle. A door drawn at exactly 90 degrees lines up
       edge on with the carcass side and disappears. */
    const angle = THREE.MathUtils.degToRad(95) * (hinge === 'left' ? -1 : 1);
    return { hinge, pivot: [pivotX, p.pos[2] + p.size[2] / 2], angle };
  };

  return (
    <>
      <ambientLight intensity={0.58} />
      <directionalLight position={[1500, 2300, 1700]} intensity={1.2} />
      <directionalLight position={[-1600, 950, -900]} intensity={0.45} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.09}
        minDistance={450}
        maxDistance={5000}
        maxPolarAngle={Math.PI / 2 - 0.02}
        target={target}
      />
      <CameraRig preset={preset} target={target} nonce={nonce} distance={distance} />

      {show.grid && (
        <Grid
          args={[6000, 6000]}
          cellSize={100}
          cellThickness={0.5}
          cellColor={dimColor}
          sectionSize={1000}
          sectionThickness={0.8}
          sectionColor={dimColor}
          fadeDistance={5200}
          fadeStrength={1.5}
          followCamera={false}
          infiniteGrid
          position={[0, 0, 0]}
        />
      )}

      {!reduced && (
        <ContactShadows
          position={[0, 1, 0]}
          scale={2400}
          blur={2.4}
          opacity={theme === 'dark' ? 0.5 : 0.32}
          far={900}
          resolution={1024}
          color="#000000"
        />
      )}

      <group position={[-W / 2, 0, -D / 2]}>
        {all.map((p) => (
          <Part
            key={p.code}
            p={p}
            offset={partOffset(p)}
            selected={selected === p.code}
            ghosted={(ghostMode || selected) && selected !== p.code}
            hidden={isHidden(p)}
            onHover={setHovered}
            onSelect={(pp) => setSelected(selected === pp.code ? null : pp.code)}
            clip={clip}
            showLabel={show.labels}
            swing={swingOf(p)}
          />
        ))}
      </group>

      {show.dims && (
        <Dimensions size={cabinet.size} dimColor={dimColor} level={show.setout ? 1 : 0} />
      )}
      {show.setout && <DrawerDims cabinet={cabinet} dimColor={dimColor} />}

      {/* The part name and size used to hang over the model on a leader, which
          covered the very thing you were pointing at. It is a fixed panel in
          the bottom right corner of the viewer now, drawn by the screen. */}
    </>
  );
}

/* --- public component ---------------------------------------------------- */

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export default function Viewer(props) {
  const [bg, setBg] = useState('#F4F2EE');
  useEffect(() => {
    const read = () => setBg(cssVar('--bg', '#F4F2EE'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => { mo.disconnect(); mq.removeEventListener('change', read); };
  }, []);

  return (
    <Canvas
      dpr={props.reduced ? 1 : [1, 2]}
      camera={{ position: [1080, 1160, 1280], fov: 35, near: 10, far: 30000 }}
      gl={{ antialias: !props.reduced, powerPreference: 'high-performance' }}
      onPointerMissed={() => props.setSelected(null)}
      style={{ background: bg }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
