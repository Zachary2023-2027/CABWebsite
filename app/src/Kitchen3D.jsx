/* ===========================================================================
   Full kitchen mode. Every cabinet placed on its wall at its real position,
   benchtop as a continuous slab with the correct overhang, kickboard set
   back, appliances as blocked out volumes.
   =========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Part, cssVar } from './Viewer.jsx';
import { unitWarnings } from './project.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const VIEWS = {
  Iso: [0.55, 0.55, 0.63],
  Front: [0, 0.12, 1],
  Left: [-1, 0.12, 0.25],
  Right: [1, 0.12, 0.25],
  Top: [0, 1, 0.002],
};

/* --- camera, shared behaviour with the single cabinet viewer -------------- */

function Rig({ preset, nonce, target, distance, eye, run }) {
  const { camera, controls } = useThree();
  const move = useRef(null);
  const keys = useRef({});

  useEffect(() => {
    const dn = (e) => { keys.current[e.key.toLowerCase()] = true; };
    const up = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    if (!controls) return;
    if (eye) {
      // Stand in the room at eye height, looking at the middle of the run.
      const from = new THREE.Vector3(run / 2, 1600, 2200);
      move.current = {
        t0: performance.now(),
        fromPos: camera.position.clone(), toPos: from,
        fromTgt: controls.target.clone(), toTgt: new THREE.Vector3(run / 2, 1500, 0),
      };
      return;
    }
    const d = new THREE.Vector3(...(VIEWS[preset] || VIEWS.Iso)).normalize();
    move.current = {
      t0: performance.now(),
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...target).addScaledVector(d, distance),
      fromTgt: controls.target.clone(), toTgt: new THREE.Vector3(...target),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, eye, controls]);

  useFrame((_, dt) => {
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
    if (!eye) return;

    /* Walk. W and S along the view direction, A and D across it. */
    const k = keys.current;
    const speed = 2600 * Math.min(dt, 0.05);
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const step = new THREE.Vector3();
    if (k.w || k.arrowup) step.addScaledVector(fwd, speed);
    if (k.s || k.arrowdown) step.addScaledVector(fwd, -speed);
    if (k.a || k.arrowleft) step.addScaledVector(side, -speed);
    if (k.d || k.arrowright) step.addScaledVector(side, speed);
    if (step.lengthSq() === 0) return;
    camera.position.add(step);
    camera.position.y = 1600;
    controls.target.add(step);
    controls.update();
  });

  return null;
}

/* --- appliances ----------------------------------------------------------
   Most cavities are honestly just a blocked out volume, and drawing them as
   a plain box is the truthful thing to do. Two are not: a range hood you
   recognise by its shape, and a cooktop with an oven under it, where the
   oven door is what tells you which way round the unit goes. Those two get
   built out of a few boxes so the 3D reads at a glance. */

function Hood({ unit, colour, ghost, ...evt }) {
  const w = unit.width;
  const h = unit.height;
  const d = unit.depth;
  const canopy = Math.min(200, h * 0.4);        // the flared shroud at the bottom
  const flueW = Math.max(200, w * 0.34);
  const mat = (
    <meshStandardMaterial color={colour} roughness={0.35} metalness={0.35}
                          transparent={ghost} opacity={ghost ? 0.18 : 1} />
  );
  return (
    <group {...evt}>
      {/* canopy, the wide part you stand under */}
      <mesh position={[w / 2, canopy / 2, d / 2]}>
        <boxGeometry args={[w, canopy, d]} />{mat}
      </mesh>
      {/* filter face, set just under the canopy so it catches the light */}
      <mesh position={[w / 2, 12, d / 2]}>
        <boxGeometry args={[w - 80, 24, d - 80]} />
        <meshStandardMaterial color="#8C9095" roughness={0.8}
                              transparent={ghost} opacity={ghost ? 0.18 : 1} />
      </mesh>
      {/* flue, running up the wall */}
      <mesh position={[w / 2, canopy + (h - canopy) / 2, Math.min(d, 300) / 2]}>
        <boxGeometry args={[flueW, h - canopy, Math.min(d, 300)]} />{mat}
      </mesh>
    </group>
  );
}

function CooktopOven({ unit, colour, ghost, benchHeight, ...evt }) {
  const w = unit.width;
  const h = unit.height;
  const d = unit.depth;
  const ovenH = Math.min(600, h - 100);
  const mat = (
    <meshStandardMaterial color={colour} roughness={0.5}
                          transparent={ghost} opacity={ghost ? 0.18 : 1} />
  );
  return (
    <group {...evt}>
      {/* the cavity itself */}
      <mesh position={[w / 2, h / 2, d / 2]}>
        <boxGeometry args={[w, h, d]} />{mat}
      </mesh>
      {/* oven door and handle, proud of the front face */}
      <mesh position={[w / 2, h - ovenH / 2 - 60, d + 10]}>
        <boxGeometry args={[w - 20, ovenH, 20]} />
        <meshStandardMaterial color="#3A3B3D" roughness={0.35} metalness={0.3}
                              transparent={ghost} opacity={ghost ? 0.18 : 1} />
      </mesh>
      <mesh position={[w / 2, h - 90, d + 40]}>
        <boxGeometry args={[w - 100, 26, 26]} />
        <meshStandardMaterial color="#B6BABE" roughness={0.3} metalness={0.6}
                              transparent={ghost} opacity={ghost ? 0.18 : 1} />
      </mesh>
      {/* cooktop, sitting in the benchtop cut out */}
      <mesh position={[w / 2, benchHeight + 6, d / 2 - 20]}>
        <boxGeometry args={[w - 40, 12, d - 120]} />
        <meshStandardMaterial color="#2B2C2E" roughness={0.2}
                              transparent={ghost} opacity={ghost ? 0.18 : 1} />
      </mesh>
    </group>
  );
}

/* --- one wall's run ------------------------------------------------------
   Everything that stands on a single wall. Positions are that wall's own
   local coordinates: x along the wall, z out from it. The room places and
   turns the whole group, so a return wall needs no special cases here.
   ------------------------------------------------------------------------ */

function WallRun({ lay, cfg, selected, setSelected, setHovered, show, warnMap }) {
  /* Benchtop segments, same rule as the elevation. */
  const bench = useMemo(() => {
    const segs = [];
    let cur = null;
    for (const p of lay.placed.filter((q) => q.where !== 'wall').sort((a, b) => a.x - b.x)) {
      const carries = p.unit.kind === 'base' || p.unit.kind === 'filler' ||
        (p.unit.cavity && !p.unit.breaksBench && !p.unit.fullHeight);
      if (!carries) { cur = null; continue; }
      if (cur && Math.abs(cur.x + cur.w - p.x) < 0.5) cur.w += p.unit.width;
      else { cur = { x: p.x, w: p.unit.width }; segs.push(cur); }
    }
    return segs;
  }, [lay]);

  const noop = () => {};

  return (
    <>
      {lay.placed.map((p) => {
        const { unit, x } = p;
        if (unit.kind === 'wall' && !show.wallCabs) return null;
        if (unit.cavity && !show.appliances) return null;

        const sel = selected === p.item.uid;
        const ghost = selected ? !sel : false;
        const warn = warnMap.has(p.item.uid);
        const pick = (e) => { e.stopPropagation(); setSelected(sel ? null : p.item.uid); };

        if (unit.cavity) {
          const colour = sel ? '#BBD3E6' : '#B9BDC0';
          const evt = {
            onClick: pick,
            onPointerOver: (e) => { e.stopPropagation(); setHovered(p); },
            onPointerOut: () => setHovered(null),
          };
          if (unit.family.appliance === 'hood') {
            return (
              <group key={p.item.uid} position={[x, unit.mountY, 0]}>
                <Hood unit={unit} colour={colour} ghost={ghost} {...evt} />
              </group>
            );
          }
          if (unit.family.appliance === 'cooktopOven') {
            return (
              <group key={p.item.uid} position={[x, unit.mountY, 0]}>
                <CooktopOven unit={unit} colour={colour} ghost={ghost}
                             benchHeight={cfg.benchHeight - unit.mountY} {...evt} />
              </group>
            );
          }
          return (
            <mesh key={p.item.uid}
                  position={[x + unit.width / 2, unit.mountY + unit.height / 2, unit.depth / 2]}
                  {...evt}>
              <boxGeometry args={[unit.width, unit.height, unit.depth]} />
              <meshStandardMaterial color={colour} roughness={0.55}
                                    transparent={ghost} opacity={ghost ? 0.18 : 1} />
            </mesh>
          );
        }

        return (
          <group key={p.item.uid} position={[x, unit.mountY, 0]}>
            {unit.parts.map((q) => (
              <Part key={q.code} p={q} offset={[0, 0, 0]}
                    selected={sel} ghosted={ghost} hidden={false} warn={warn}
                    onHover={(pp) => setHovered(pp ? p : null)}
                    onSelect={() => setSelected(sel ? null : p.item.uid)}
                    clip={[]} showLabel={false} />
            ))}
          </group>
        );
      })}

      {/* kickboard, set back from the front face */}
      {lay.placed.filter((p) => p.where !== 'wall' && !p.unit.cavity).map((p) => (
        <mesh key={`k${p.item.uid}`}
              position={[p.x + p.unit.width / 2, cfg.kick / 2, p.unit.depth - 60]}
              onClick={noop}>
          <boxGeometry args={[p.unit.width, cfg.kick, 18]} />
          <meshStandardMaterial color="#4A453D" roughness={0.9} />
        </mesh>
      ))}

      {/* benchtop, continuous with a front overhang */}
      {show.bench && bench.map((s, i) => (
        <mesh key={i}
              position={[s.x + s.w / 2, cfg.benchHeight - cfg.benchThk / 2, cfg.benchDepth / 2]}>
          <boxGeometry args={[s.w + 20, cfg.benchThk, cfg.benchDepth]} />
          <meshStandardMaterial color="#C9C4BB" roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

/* --- scene --------------------------------------------------------------- */

function Room({ lay, room, cfg, selected, setSelected, setHovered, show, preset, nonce,
                eye, reduced, warnMap }) {
  const wallCol = cssVar('--sunken', '#EAE7E1');

  /* One wall, or the joined run of an L or a U. Each entry carries where its
     corner is and how far it is turned, worked out by the room layout. The
     rotations are the ones that leave every door facing into the room. */
  const runs = room && room.length
    ? room.map((r) => ({ lay: r.lay, origin: r.origin, rot: r.rot }))
    : [{ lay, origin: [0, 0], rot: 0 }];

  /* The room's footprint, so the floor, the back wall and the camera all
     cover the whole thing rather than the first wall. */
  const span = useMemo(() => {
    let x = 0;
    let z = 0;
    for (const r of runs) {
      const L = r.lay.wall.length;
      // A turned run reaches out in z instead of x.
      if (Math.abs(r.rot) < 0.01) x = Math.max(x, r.origin[0] + L);
      else { x = Math.max(x, r.origin[0]); z = Math.max(z, L); }
    }
    return { x: Math.max(x, 1200), z: Math.max(z, 900) };
  }, [room, lay]);

  const target = useMemo(() => [span.x / 2, 900, span.z / 2], [span]);
  const distance = useMemo(() => {
    const reach = Math.max(span.x, span.z, cfg.ceiling, 1800);
    return (reach * 0.5 * 1.6) / Math.sin(THREE.MathUtils.degToRad(35) / 2);
  }, [span, cfg.ceiling]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[span.x * 0.6, 3400, 2600]} intensity={1.1} />
      <directionalLight position={[-1800, 1500, -1400]} intensity={0.4} />

      <OrbitControls
        makeDefault enableDamping dampingFactor={0.09}
        minDistance={eye ? 1 : 700} maxDistance={eye ? 12000 : 20000}
        maxPolarAngle={Math.PI / 2 - 0.015}
        target={target}
      />
      <Rig preset={preset} nonce={nonce} target={target} distance={distance} eye={eye} run={span.x} />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[span.x / 2, 0, span.z / 2 + 300]}>
        <planeGeometry args={[span.x + 2400, span.z + 5000]} />
        <meshStandardMaterial color={wallCol} roughness={1} />
      </mesh>

      {/* The walls the cabinets stand against, one per run.

          Each is a plane facing into the room and drawn on one side only, so
          the wall you are standing behind disappears instead of hiding the
          kitchen. In an L that is the difference between seeing the corner
          and looking at the back of a slab. */}
      {show.walls && runs.map((r, i) => (
        <group key={i} position={[r.origin[0], 0, r.origin[1]]} rotation={[0, r.rot, 0]}>
          <mesh position={[r.lay.wall.length / 2, cfg.ceiling / 2, -20]}>
            <planeGeometry args={[r.lay.wall.length + 400, cfg.ceiling]} />
            <meshStandardMaterial color={wallCol} roughness={1} side={THREE.FrontSide} />
          </mesh>
        </group>
      ))}

      {!reduced && (
        <ContactShadows position={[span.x / 2, 2, span.z / 2 + 300]}
                        scale={Math.max(span.x, span.z, 3000) * 2}
                        blur={2.6} opacity={0.3} far={1200} resolution={1024} color="#000000" />
      )}

      {runs.map((r, i) => (
        <group key={r.lay.wall.id ?? i}
               position={[r.origin[0], 0, r.origin[1]]} rotation={[0, r.rot, 0]}>
          <WallRun lay={r.lay} cfg={cfg} selected={selected} setSelected={setSelected}
                   setHovered={setHovered} show={show} warnMap={warnMap} />
        </group>
      ))}
    </>
  );
}

export default function Kitchen3D(props) {
  const [bg, setBg] = useState('#F4F2EE');
  useEffect(() => {
    const read = () => setBg(cssVar('--bg', '#F4F2EE'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    /* On System there is no data-theme to watch, so the observer never fires
       and the canvas keeps painting the old background after the machine
       switches to dark. The single cabinet viewer already listens for this. */
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => { mo.disconnect(); mq.removeEventListener('change', read); };
  }, []);

  const warnMap = useMemo(() => {
    const m = new Map();
    const lays = props.room && props.room.length ? props.room.map((r) => r.lay) : [props.lay];
    for (const lay of lays) {
      for (const p of lay.placed) {
        if (unitWarnings(p, lay, props.cfg).length) m.set(p.item.uid, true);
      }
    }
    return m;
  }, [props.lay, props.room, props.cfg]);

  return (
    <Canvas
      dpr={props.reduced ? 1 : [1, 2]}
      camera={{ position: [2600, 2600, 3600], fov: 35, near: 10, far: 60000 }}
      gl={{ antialias: !props.reduced }}
      onPointerMissed={() => props.setSelected(null)}
      style={{ background: bg }}
    >
      <Room {...props} warnMap={warnMap} />
    </Canvas>
  );
}
