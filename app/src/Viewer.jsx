import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { bounds, cutSize } from './cabinet.js';

/* Materials. Matte, close to the real board. Doors sit one value off the
   carcass so the eye separates them without needing the outline to do it.
   These do not follow the theme: white melamine is off white in a dark room
   too. Only the background and the ground follow the theme. */
const TONES = {
  melamine: { color: '#F1EDE6', roughness: 0.80, metalness: 0 },
  front:    { color: '#DED6C6', roughness: 0.78, metalness: 0 },
  mdf:      { color: '#C0B49B', roughness: 0.90, metalness: 0 },
  ply:      { color: '#D9BD8C', roughness: 0.82, metalness: 0 },
  metal:    { color: '#9AA0A6', roughness: 0.45, metalness: 0.55 },
};

const EDGE = '#2A2722';
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

export function Part({ p, offset, selected, ghosted, hidden, onHover, onSelect, clip, showLabel, warn }) {
  const { box: geo, edges } = boxGeo(p.size[0], p.size[1], p.size[2]);

  const tone = TONES[p.tone] || TONES[p.material?.tone] || TONES.melamine;
  const centre = [
    p.pos[0] + p.size[0] / 2 + offset[0],
    p.pos[1] + p.size[1] / 2 + offset[1],
    p.pos[2] + p.size[2] / 2 + offset[2],
  ];

  if (hidden) return null;

  return (
    <group position={centre}>
      <mesh
        geometry={geo}
        castShadow={false}
        onPointerOver={(e) => { e.stopPropagation(); onHover(p); }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null); }}
        onClick={(e) => { e.stopPropagation(); onSelect(p); }}
      >
        <meshStandardMaterial
          color={selected ? '#BBD3E6' : tone.color}
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
          color={selected ? '#1D5E8C' : warn ? '#B4791E' : EDGE}
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
}

/* --- dimension annotation ------------------------------------------------ */

function Dim({ from, to, label, dimColor }) {
  const mid = from.map((v, i) => (v + to[i]) / 2);
  return (
    <group>
      <Line points={[from, to]} color={dimColor} lineWidth={1} />
      <Html center position={mid} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <span className="dim-label">{label}</span>
      </Html>
    </group>
  );
}

function Dimensions({ size, dimColor }) {
  const [W, H, D] = size;
  const o = 90;
  return (
    <group>
      <Dim from={[-W / 2, 2, D / 2 + o]} to={[W / 2, 2, D / 2 + o]} label={`${W}`} dimColor={dimColor} />
      <Dim from={[-W / 2 - o, 0, D / 2]} to={[-W / 2 - o, H, D / 2]} label={`${H}`} dimColor={dimColor} />
      <Dim from={[W / 2 + o, 2, -D / 2]} to={[W / 2 + o, 2, D / 2]} label={`${D}`} dimColor={dimColor} />
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

  const target = useMemo(() => [
    bAss.min[0] + bAss.size[0] / 2 - W / 2,
    bAss.min[1] + bAss.size[1] / 2,
    bAss.min[2] + bAss.size[2] / 2 - D / 2,
  ], [bAss, W, D]);

  const distance = useMemo(() => {
    const now = [0, 1, 2].map((i) => bAss.size[i] + (bExp.size[i] - bAss.size[i]) * t);
    const radius = Math.max(...now) * 0.5 * 1.42;
    return radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
  }, [bAss, bExp, t, camera]);

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
          />
        ))}
      </group>

      {show.dims && <Dimensions size={cabinet.size} dimColor={dimColor} />}

      {hovered && (
        <Html
          position={[0, H + 120, 0]}
          center
          zIndexRange={[30, 20]}
          style={{ pointerEvents: 'none' }}
        >
          <span className="hover-card">
            <b>{hovered.code}</b>
            <span>{hovered.name}</span>
            <span>{cutSize(hovered)}</span>
          </span>
        </Html>
      )}
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
