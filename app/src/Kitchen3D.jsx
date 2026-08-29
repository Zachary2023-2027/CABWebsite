/* ===========================================================================
   Full kitchen mode.

   Every cabinet placed on its wall at its real position, benchtop as a slab
   with the correct overhang, kickboard set back, and a room around all of it:
   walls with real thickness and real holes in them, a floor, a ceiling, and
   the appliances, fixtures and services drawn as what they are.

   That last part used to be one grey box per appliance, sized to the hole
   rather than shaped like the thing, and nothing at all for a window, a power
   point or a waste pipe. A kitchen where the fridge, the dishwasher, the oven
   and the washing machine are four identical slabs is a kitchen you cannot
   check: you cannot see which way the fridge opens, or that the oven door
   lands in the walkway, or that the tap is going to hit the window reveal.

   Three files. The shapes are in Fixtures.jsx, the arithmetic that decides
   where they go is in fixtures.js where it can be tested without a browser,
   and this file is the scene: what goes in it, how it is lit, and how the
   camera moves.
   =========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Part, boxGeo, cssVar } from './Viewer.jsx';
import {
  NO_BAR, barBrackets, barSeats, facing, islandBar, islandDepth, unitWarnings, zRange,
} from './project.js';
import { BAR_RULES } from './bar.js';
import { finishFor } from './finishes.js';
import { obstacleKind } from './obstacles.js';
import {
  barBracketPositions, barSeatPositions, benchSegments, handlesFor, islandSlab,
  skirtingRuns, wallBands,
} from './fixtures.js';
import {
  BarBracket, Box, Cooker, Cooktop, Dishwasher, Doorway, Fridge, Handle, Hood,
  Microwave, Outlet, OvenFront, SURFACE, Service, Sink, SinkPlumbing, Stool,
  Vent, Washer, Window,
} from './Fixtures.jsx';
import {
  FULL_SWING, arcPoint, degrees, doorSwing, drawerSlide, mirrorSector, openUntilBlocked,
  partSector, swingSector,
} from './motion.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* ---------------------------------------------------------------------------
   A cabinet whose fronts move.

   Shut, this is what it always was. Opened, the doors turn about their hinge
   edge and the drawers come out on their runners, carrying their boxes with
   them, because a drawer box that stays behind while its front slides away is
   a worse drawing than one that does not move at all.
   --------------------------------------------------------------------------- */

function Cabinet({ p, open, sel, ghost, warn, setHovered, setSelected, islandDepth = 0,
                   cfg, benchTop, show }) {
  const { unit, x } = p;
  const travel = unit.cfg?.runnerLength ?? 500;
  const handles = useMemo(() => (show.handles ? handlesFor(unit) : []), [unit, show.handles]);
  const handleFor = (pred) => handles.filter(pred);

  /* The two sides of an island face opposite ways, which is what makes it an
     island rather than two cabinets glued back to back with their doors
     looking at each other. The front run is the one turned around, so its
     doors open out of the front face at z 0 and the back run's out of the
     back face. Which way round that is belongs to the model: this reads it. */
  const face = facing(p, islandDepth);

  const partProps = {
    offset: [0, 0, 0], selected: sel, ghosted: ghost, hidden: false, warn,
    onHover: (pp) => setHovered(pp ? p : null),
    onSelect: () => setSelected(sel ? null : p.item.uid),
    clip: [], showLabel: false,
  };

  /* Three kinds of part: doors, which turn, anything belonging to a drawer,
     which slides, and the carcass, which does neither. */
  const doors = unit.parts.filter((q) => q.group === 'front' && q.code.includes('DOOR'));
  const drawers = new Map();
  for (const q of unit.parts) {
    if (q.drawer == null) continue;
    if (!drawers.has(q.drawer)) drawers.set(q.drawer, []);
    drawers.get(q.drawer).push(q);
  }
  const moving = new Set([...doors, ...[...drawers.values()].flat()]);
  const still = unit.parts.filter((q) => !moving.has(q));

  const body = (
    <>
      {still.map((q) => <Part key={q.code} p={q} {...partProps} />)}

      {/* What is in the cabinet rather than part of it: a sink in the top, an
          oven in the cavity, a microwave in the bay. It does not move when the
          fronts do, so it sits with the carcass. */}
      <Fittings p={p} cfg={cfg} ghost={ghost} benchTop={benchTop} show={show} />

      {doors.map((q) => {
        const swing = doorSwing(q, open);
        return (
          <group key={q.code} position={swing.pivot} rotation={[0, swing.angle, 0]}>
            {/* The part is drawn in cabinet space, so inside the pivot group it
                has to be moved back to where the pivot is. */}
            <group position={[-swing.pivot[0], -swing.pivot[1], -swing.pivot[2]]}>
              <Part p={q} {...partProps} />
              {/* The handle turns with the door it is screwed to. Drawing it
                  in cabinet space instead leaves it hanging in the air the
                  moment anything opens. */}
              {handleFor((h) => h.door === q.code).map((h) => (
                <Handle key={h.key} at={h.at} length={h.length}
                        vertical={h.vertical} ghost={ghost} />
              ))}
            </group>
          </group>
        );
      })}

      {[...drawers.entries()].map(([n, parts]) => (
        <group key={`d${n}`} position={[0, 0, drawerSlide(parts[0], open, travel).z]}>
          {parts.map((q) => <Part key={q.code} p={q} {...partProps} />)}
          {handleFor((h) => h.drawer === n).map((h) => (
            <Handle key={h.key} at={h.at} length={h.length} ghost={ghost} />
          ))}
        </group>
      ))}
    </>
  );

  if (face.flip) {
    /* A half turn about the cabinet's own middle, landed so its front face
       comes out at the offset. Turning it is the only way to face it the
       other way: moving it leaves the doors on the wrong side. */
    return (
      <group position={[x + unit.width, unit.mountY, face.offset]} rotation={[0, Math.PI, 0]}>
        <group position={[0, 0, 0]}>{body}</group>
      </group>
    );
  }

  return <group position={[x, unit.mountY, face.offset]}>{body}</group>;
}

const VIEWS = {
  Iso: [0.55, 0.55, 0.63],
  Front: [0, 0.12, 1],
  Left: [-1, 0.12, 0.25],
  Right: [1, 0.12, 0.25],
  Top: [0, 1, 0.002],
};

/* --- camera, shared behaviour with the single cabinet viewer -------------- */

function Rig({ preset, nonce, target, distance, eye, run }) {
  const { camera, controls, invalidate } = useThree();
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

  /* The canvas only draws when something asks it to. A tween and a walk are
     both changes over time with nothing else to trigger them, so they ask for
     the next frame themselves. Without this the camera moves one frame and
     stops, which looks exactly like a broken camera. */
  useEffect(() => { invalidate(); }, [preset, nonce, eye, target, distance, invalidate]);

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
      invalidate();
      return;
    }
    if (!eye) return;
    if (Object.values(keys.current).some(Boolean)) invalidate();

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

   Every one of these used to be the same grey box, sized to the hole rather
   than shaped like the thing. A kitchen where the fridge, the dishwasher, the
   oven and the washing machine are four identical slabs is a kitchen you
   cannot check: you cannot see which way the fridge opens, or that the oven
   door lands in the walkway, or that the tap is going to hit the window.

   The shapes live in Fixtures.jsx, built out of primitives from their real
   dimensions. This is only the part that decides which one a cavity gets and
   where it goes.
   ------------------------------------------------------------------------ */

function Appliance({ unit, ghost, benchHeight }) {
  const w = unit.width;
  const h = unit.height;
  const d = unit.depth;

  switch (unit.family.appliance) {
    case 'hood':
      return <Hood width={w} height={h} depth={d} ghost={ghost} />;
    case 'fridge':
      return <Fridge width={w} height={h} depth={d} ghost={ghost} />;
    case 'dw':
      return <Dishwasher width={w} height={h} depth={d} ghost={ghost} />;
    case 'washer':
      return <Washer width={w} height={h} depth={d} ghost={ghost} />;
    case 'cooktop':
      // A freestanding cooker: hob on top, oven under, which is why the bench
      // breaks either side of it.
      return <Cooker width={w} height={h} depth={d} ghost={ghost} />;
    case 'cooktopOven':
      return (
        <>
          <Box at={[w / 2, h / 2, d / 2]} size={[w, h, d]} of="darkSteel" ghost={ghost} />
          <OvenFront width={w - 20} height={Math.min(620, h - 90)} at={[10, 60, d]} ghost={ghost} />
          <Cooktop width={w} depth={d} top={benchHeight} ghost={ghost} />
        </>
      );
    default:
      return <Box at={[w / 2, h / 2, d / 2]} size={[w, h, d]} of="brushed" ghost={ghost} />;
  }
}

/* --- what a cabinet has in it or on it -----------------------------------

   A sink base has a sink, a plumbed one has a trap under it, an oven tower
   has an oven in its cavity and a microwave bay has a microwave. None of that
   is a part, so none of it was ever drawn, and a sink base looked exactly like
   a cupboard.
   ------------------------------------------------------------------------ */

function Fittings({ p, cfg, ghost, benchTop, show }) {
  const { unit } = p;
  const fronts = unit.family.fronts;
  const hasSink = fronts === 'sink' || (fronts === 'stack' && /sink/i.test(unit.family.name));
  const out = [];

  if (hasSink && show.fixtures) {
    const twin = unit.width >= 900;
    out.push(
      <Sink key="sink" width={unit.width} benchDepth={unit.depth}
            benchTop={benchTop - unit.mountY} ghost={ghost} double={twin} />,
    );
    /* The trap and the stop taps, which is the volume that argues with a
       drawer box. Only drawn inside a cabinet you can see into, because
       otherwise it is geometry nobody will ever look at. */
    if (show.plumbing) {
      out.push(
        <SinkPlumbing key="trap" width={unit.width} benchDepth={unit.depth}
                      benchTop={benchTop - unit.mountY} ghost={ghost} twin={twin} />,
      );
    }
  }

  if (unit.ovenCavity && show.fixtures) {
    out.push(
      <OvenFront key="oven" width={unit.width - 24} height={unit.ovenCavity.h}
                 at={[12, unit.ovenCavity.y, unit.depth]} ghost={ghost} />,
    );
  }

  if (unit.microBay && show.fixtures) {
    out.push(
      <group key="micro" position={[0, unit.microBay.y, 0]}>
        <Microwave width={unit.width - 40} height={unit.microBay.h - 30}
                   depth={unit.depth - 60} ghost={ghost} />
      </group>,
    );
  }

  return out.length ? <>{out}</> : null;
}

/* --- one wall's run ------------------------------------------------------
   Everything that stands on a single wall. Positions are that wall's own
   local coordinates: x along the wall, z out from it. The room places and
   turns the whole group, so a return wall needs no special cases here.
   ------------------------------------------------------------------------ */

function WallRun({ lay, cfg, selected, setSelected, setHovered, show, warnMap, open = 0 }) {
  /* How deep the island is. Its cabinets sit back to back inside it, so the
     depth is the island's own and not a cabinet's. */
  const depth = lay.island ? islandDepth(lay.wall, cfg) : 0;

  /* The breakfast bar, read from the same place the price and the checks read
     it. A drawing that works the overhang out for itself is a drawing that can
     disagree with the invoice. */
  const clear = { ...BAR_RULES, ...cfg };
  const bar = lay.island ? islandBar(lay.wall) : NO_BAR;

  /* The slab, and how far off centre it sits. The bar runs out on one side
     only, so a top that is 400 wider is 200 further over as well: centring it
     on the island puts 200 of overhang on the side with no stools. */
  const slab = useMemo(
    () => islandSlab(lay.wall.length, depth, cfg.benchOverhang ?? 20, bar),
    [lay.wall.length, depth, bar.side, bar.depth, cfg.benchOverhang],
  );

  /* The benchtop is bought rather than made, so it has no board to guess a
     colour from. It has a colour you can set, though, and the elevation reads
     the same one: a benchtop that is walnut in the drawing and stone in the
     room is two answers to one question. Left alone it is stone. */
  const benchCol = finishFor('bench', cfg)?.hex || SURFACE.stone.color;
  const kickCol = finishFor('kick', cfg)?.hex || '#4A453D';
  /* Glazed splashback. Cooler and glossier than the plaster behind it. */
  const splashCol = '#DCE3E0';

  /* Benchtop segments, same rule as the elevation. */
  /* One rule, shared with the elevation. The splashback rides on these too:
     where there is no bench there is no splashback. */
  const bench = useMemo(() => benchSegments(lay), [lay]);

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
          const evt = {
            onClick: pick,
            onPointerOver: (e) => { e.stopPropagation(); setHovered(p); },
            onPointerOut: () => setHovered(null),
          };
          const face = facing(p, lay.island ? depth : 0);
          const inner = (
            <Appliance unit={unit} ghost={ghost}
                       benchHeight={cfg.benchHeight - unit.mountY} />
          );
          return (
            <group key={p.item.uid} {...evt}>
              {face.flip ? (
                <group position={[x + unit.width, unit.mountY, face.offset]} rotation={[0, Math.PI, 0]}>
                  {inner}
                </group>
              ) : (
                <group position={[x, unit.mountY, face.offset]}>{inner}</group>
              )}
              {/* Selection reads off a wire cage rather than off a tint. Tinting
                  a fridge blue makes it stop being a fridge, which is the thing
                  drawing them properly was for. */}
              {sel && (
                <lineSegments position={[
                  x + unit.width / 2, unit.mountY + unit.height / 2,
                  (zRange(face, 0, unit.depth)[0] + zRange(face, 0, unit.depth)[1]) / 2,
                ]}>
                  <edgesGeometry args={[boxGeo(unit.width + 16, unit.height + 16, unit.depth + 16).box]} />
                  <lineBasicMaterial color={cssVar('--accent', '#356F51')} />
                </lineSegments>
              )}
            </group>
          );
        }

        return (
          <Cabinet key={p.item.uid} p={p} open={open} sel={sel} ghost={ghost} warn={warn}
                   islandDepth={lay.island ? depth : 0} cfg={cfg} show={show}
                   benchTop={cfg.benchHeight}
                   setHovered={setHovered} setSelected={setSelected} />
        );
      })}

      {/* kickboard, set back from the front face */}
      {lay.placed.filter((p) => p.where !== 'wall' && !p.unit.cavity).map((p) => (
        <mesh key={`k${p.item.uid}`} receiveShadow
              /* Under the front of the cabinet, set back from its face. Which
                 way the cabinet faces decides which end of it that is. */
              position={[p.x + p.unit.width / 2, cfg.kick / 2,
                (({ offset, flip }) => (flip ? offset - 60 : offset + p.unit.depth - 60))(
                  facing(p, lay.island ? depth : 0))]}
              onClick={noop}>
          <boxGeometry args={[p.unit.width, cfg.kick, 18]} />
          <meshStandardMaterial color={kickCol} roughness={0.86} />
        </mesh>
      ))}

      {/* The splashback: the wall between the benchtop and the wall cabinets.

          Behind the benchtop and nowhere else. It used to be one slab the whole
          length of the wall, which put it straight through every tall cabinet
          standing on that wall and left it hanging in the air past the end of
          the run. A splashback is fixed to the wall behind a bench: where there
          is no bench there is no splashback, and the benchtop segments already
          know where that is, because they break at a tall unit and at a
          freestanding cooker for the same reason. */}
      {show.bench && !lay.island && bench.map((s, i) => {
        const top = Math.min(cfg.wallMount, cfg.ceiling);
        const height = Math.max(0, top - cfg.benchHeight);
        if (height <= 0) return null;
        return (
          <mesh key={`sb${i}`} receiveShadow
                position={[s.x + s.w / 2, cfg.benchHeight + height / 2, 9]}>
            <boxGeometry args={[s.w, height, 18]} />
            {/* Cooler and glossier than the plaster it is fixed to, so it reads
                as a different material rather than as a change of mind about
                the paint, and so it takes a highlight the wall does not. */}
            <meshStandardMaterial color={splashCol} roughness={0.14} metalness={0.04} />
          </mesh>
        );
      })}

      {/* An island's top is one slab over the whole footprint, overhanging on
          every side, rather than a strip in front of one run. A breakfast bar
          runs it further out on one side, so the slab is placed off its own
          centre rather than off the island's. */}
      {show.bench && lay.island && (
        <mesh position={[lay.wall.length / 2 + slab.shiftX,
          cfg.benchHeight - cfg.benchThk / 2,
          depth / 2 + slab.shiftZ]} castShadow receiveShadow>
          <boxGeometry args={[slab.length, cfg.benchThk, slab.across]} />
          <meshStandardMaterial color={benchCol} roughness={0.32} metalness={0.05} />
        </mesh>
      )}

      {/* benchtop, continuous with a front overhang */}
      {show.bench && !lay.island && bench.map((s, i) => (
        <mesh key={i} castShadow receiveShadow
              position={[s.x + s.w / 2, cfg.benchHeight - cfg.benchThk / 2, cfg.benchDepth / 2]}>
          <boxGeometry args={[s.w + 20, cfg.benchThk, cfg.benchDepth]} />
          <meshStandardMaterial color={benchCol} roughness={0.32} metalness={0.05} />
        </mesh>
      ))}

      {/* Stools at the bar, and whatever is holding it up. Both are scale
          figures rather than things this app is designing: four stools drawn
          along an island is the fastest way to see whether four people fit at
          it, and a bracket drawn under the stone is the argument for a leg. */}
      {show.bench && lay.island && bar.depth > 0 && show.fixtures && (
        <>
          {barSeatPositions(barSeats(lay.wall, cfg, clear, bar),
            lay.wall.length, depth, bar, slab.over).map((s, i) => (
            <group key={`s${i}`} position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]}>
              <Stool ghost={false} seatHeight={Math.round(cfg.benchHeight * 0.72)} />
            </group>
          ))}
          {barBracketPositions(barBrackets(lay.wall, cfg, clear, bar),
            lay.wall.length, depth, bar).map((b, i) => (
            <group key={`b${i}`} position={[b.x, cfg.benchHeight - cfg.benchThk, b.z]}
                   rotation={[0, b.rot, 0]}>
              <BarBracket reach={Math.min(bar.depth, 320)} ghost={false} />
            </group>
          ))}
        </>
      )}
    </>
  );
}

/* --- the room -------------------------------------------------------------

   The walls were one plane each and a window was a rectangle painted on it,
   which reads as a picture hanging on a wall rather than as a hole in one.

   So a wall is built as the pieces around its openings: over the head, under
   the sill, and a pier either side. That is a real hole with a real reveal,
   and once there is a hole the window frame and the sill have somewhere to
   be. It is also the truthful drawing, because that is how the wall is
   actually built.
   ------------------------------------------------------------------------ */

const WALL_THK = 90;
const SKIRT = { height: 90, thickness: 18 };

/**
 * One wall and everything on it, and gone when you are behind it.
 *
 * A wall used to be a single sided plane, so the one you were standing behind
 * simply was not drawn and you could see the kitchen through it. A wall with
 * real thickness cannot do that trick: it has an outside face and that face
 * blocks the view, so orbiting round an L put you nose to nose with the back
 * of a slab.
 *
 * So the test is made explicit. The camera is put into the wall's own space
 * and asked which side of it it is on. In front, the wall and its skirting and
 * its window are all drawn. Behind, the whole lot disappears and you are
 * looking into the room, which is the only useful thing to be looking at.
 */
function RoomWall({ wall, length, ceiling, wallCol, trimCol, show }) {
  const ref = useRef();
  const { camera, invalidate } = useThree();
  const inFront = useRef(true);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const local = g.worldToLocal(camera.position.clone());
    // The room is at +z from the wall's face, which sits just behind zero.
    const want = local.z > 0;
    if (want !== inFront.current) {
      inFront.current = want;
      g.visible = want;
      invalidate();
    }
  });

  return (
    <group ref={ref}>
      <WallShell wall={wall} length={length} ceiling={ceiling} colour={wallCol} />
      <Skirting wall={wall} length={length} colour={trimCol} />
      <WallFittings wall={wall} show={show} />
    </group>
  );
}

function WallShell({ wall, length, ceiling, colour, ghost }) {
  const bands = useMemo(() => wallBands(wall, length, ceiling), [wall, length, ceiling]);

  return (
    <group>
      {bands.map((b, i) => (
        <mesh key={i} receiveShadow
              position={[b.x + b.w / 2, b.y + b.h / 2, -WALL_THK / 2]}>
          <boxGeometry args={[b.w, b.h, WALL_THK]} />
          <meshStandardMaterial color={colour} roughness={0.96} metalness={0}
                                transparent={ghost} opacity={ghost ? 0.2 : 1} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * What is fixed to a wall: windows, doorways, power points, services.
 *
 * Every one of these is already in the model as an obstacle with a real
 * position and size. Until now the 3D ignored all of them, so a design could
 * put a wall cabinet over a meter box and the picture said nothing.
 */
function WallFittings({ wall, ghost, show }) {
  if (!show.services) return null;
  return (wall.obstacles || []).map((o) => {
    const kind = obstacleKind(o.kind).id;
    const at = [Number(o.x) || 0, Number(o.y) || 0, 0];
    const w = Math.max(1, Number(o.w) || 0);
    const h = Math.max(1, Number(o.h) || 0);

    /* The reveal is the wall's thickness, not a number of this component's
       own. A window frame set deeper than the wall it is in sits outside the
       building, which is exactly what it looked like. */
    const body = kind === 'window' ? <Window w={w} h={h} ghost={ghost} reveal={WALL_THK} />
      : kind === 'door' ? <Doorway w={w} h={h} ghost={ghost} reveal={WALL_THK} />
        : kind === 'power' ? <Outlet w={w} h={h} ghost={ghost} />
          : kind === 'vent' ? <Vent w={w} h={h} ghost={ghost} />
            : ['waste', 'water', 'gas'].includes(kind)
              ? <Service kind={kind} w={w} h={h} ghost={ghost} />
              /* A beam, a meter box or a pipe running the height of the wall.
                 A plain block is the honest drawing of those: they are a volume
                 in the way and nothing more. */
              : <Box at={[w / 2, h / 2, 30]} size={[w, h, 60]} of="plaster" ghost={ghost} />;

    return <group key={o.id ?? `${o.x}-${o.y}`} position={at}>{body}</group>;
  });
}

/** Skirting along the bottom of a wall, broken where a doorway meets it. */
function Skirting({ wall, length, colour }) {
  return skirtingRuns(wall, length).map(({ x, w }, i) => (
    <mesh key={i} position={[x + w / 2, SKIRT.height / 2, SKIRT.thickness / 2]} receiveShadow>
      <boxGeometry args={[w, SKIRT.height, SKIRT.thickness]} />
      <meshStandardMaterial color={colour} roughness={0.7} />
    </mesh>
  ));
}

/**
 * The floor.
 *
 * Boards rather than a plane, because a plane of one colour gives the eye
 * nothing to judge distance by, and the whole reason for standing a person in
 * the room is to be able to judge distance. Drawn as long thin boxes with a
 * hairline between them, which costs one geometry and reads at any angle.
 */
function Floor({ span, colour }) {
  const board = 190;
  /* Boards over the room and a good margin round it, then flat ground out to
     the horizon under that.

     Both halves earn their place. Boards only, stopping at the edge of the
     room, read as a rug the kitchen is standing on with sky underneath.
     Ground only, out to the horizon, fills the whole picture with one colour
     and puts floorboards outside the window. Boards where the room is and
     quiet ground beyond is what a room in a house actually looks like. */
  const w = span.x + 9000;
  const d = span.z + 10000;
  const n = Math.min(140, Math.ceil(d / board));

  return (
    <group position={[span.x / 2, 0, span.z / 2 + 300]}>
      {/* Plain floor out to the horizon under the boards, in the same colour,
          so where the boards stop there is no edge to see: just grain near the
          room and flat colour away from it, going quiet in the fog. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -14, 0]}>
        <planeGeometry args={[70000, 70000]} />
        <meshStandardMaterial color={shade(colour, 0.94)} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={colour} roughness={1} />
      </mesh>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} receiveShadow
              position={[0, -1, -d / 2 + (i + 0.5) * (d / n)]}>
          <boxGeometry args={[w, 4, (d / n) - 6]} />
          <meshStandardMaterial color={i % 3 === 0 ? colour : shade(colour, i % 2 ? 0.95 : 1.05)}
                                roughness={0.68} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

/** A colour nudged lighter or darker, so the floor has grain without a texture. */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/* ---------------------------------------------------------------------------
   The background, and what the room can see of itself.

   Two separate things that both used to be one flat colour.

   The background is what is behind the kitchen when you orbit outside it. A
   single flat fill gives no horizon, so a room floating in it has no up and no
   ground: pulling back reads as the kitchen shrinking rather than as you
   stepping away. A gradient dome fixes that for the cost of one sphere.

   The environment is what the shiny things reflect. Without one, a chrome tap
   reflects nothing and renders as a flat grey stick, and stainless steel and
   matte plastic look identical. RoomEnvironment ships with three and needs no
   file fetched, which matters here: the app has no server, so an asset is a
   request that may not come back.
   --------------------------------------------------------------------------- */

function Sky({ reduced }) {
  const geo = useMemo(() => new THREE.SphereGeometry(46000, 32, 20), []);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      /* Daylight above, warm neutral at the horizon, and the ground half
         settling toward the floor's own colour so the two meet without a
         seam. The horizon is the whole point: it is what tells you the room
         is standing on something. */
      top: { value: new THREE.Color('#D8E2E4') },
      middle: { value: new THREE.Color('#F1EEE9') },
      bottom: { value: new THREE.Color('#CBC0B0') },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vH = normalize(world.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 middle; uniform vec3 bottom;
      varying float vH;
      void main() {
        /* Two ramps meeting at the horizon, so the ground half is not just the
           sky upside down. */
        vec3 c = vH > 0.0 ? mix(middle, top, pow(vH, 0.7))
                          : mix(middle, bottom, pow(-vH, 0.6));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }), []);

  if (reduced) return null;
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={-1} />;
}

/**
 * A reflection environment, built once and shared.
 *
 * Generated rather than loaded. The scene it is generated from is a lit box,
 * which is exactly what a kitchen is, so what a tap reflects is roughly what
 * it would reflect in the room.
 */
function Environment({ reduced }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    if (reduced) { scene.environment = null; return undefined; }
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose?.();
      pmrem.dispose();
    };
  }, [gl, scene, reduced]);

  return null;
}

/* --- scene --------------------------------------------------------------- */

function Room({ lay, room, cfg, selected, setSelected, setHovered, show, preset, nonce,
                eye, reduced, warnMap, open = 0, silhouette }) {
  /* The room's own surfaces. These do not follow the theme: a painted wall is
     off white in a dark room too, and a floor that goes black when the app
     does is a floor nobody can judge a walkway against. Only the sky behind
     the room follows the theme, because that is the app's background rather
     than part of the kitchen. */
  const wallCol = '#E3DED4';
  const trimCol = '#FAF8F4';
  /* Pale oak, not the orange this used to be. The floor plane runs to the
     horizon, so its colour is most of the picture whenever you orbit outside
     the room, and at the old saturation it stopped being a floor and became a
     background wash that everything else had to compete with. A floor is
     meant to be the quietest thing in a render. */
  const floorCol = '#C4B29B';

  /* One wall, or the joined run of an L or a U. Each entry carries where its
     corner is and how far it is turned, worked out by the room layout. The
     rotations are the ones that leave every door facing into the room. */
  const runs = room && room.length
    ? room.map((r) => ({ lay: r.lay, origin: r.origin, rot: r.rot }))
    : [{ lay, origin: [0, 0], rot: 0 }];

  /* Where the selected cabinet is in room coordinates, so Frame can point the
     camera at the thing you are working on rather than at the middle of the
     kitchen. The wall it is on may be turned, so its position has to come
     back through that rotation. */
  const framed = useMemo(() => {
    if (!selected) return null;
    for (const r of runs) {
      const hit = r.lay.placed.find((q) => q.item.uid === selected);
      if (!hit) continue;
      const cx = hit.x + hit.unit.width / 2;
      const cz = hit.unit.depth / 2;
      const cos = Math.cos(r.rot);
      const sin = Math.sin(r.rot);
      return {
        target: [
          r.origin[0] + cx * cos + cz * sin,
          hit.unit.mountY + hit.unit.height / 2,
          r.origin[1] - cx * sin + cz * cos,
        ],
        size: Math.max(hit.unit.width, hit.unit.height, hit.unit.depth),
      };
    }
    return null;
  }, [selected, runs]);

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
      {/* Light, in the three parts a room actually has.

          A key from high and to one side, which is what casts the shadows that
          tell you a cabinet is standing on the floor rather than floating over
          it. A fill from the opposite side so the shadow side is not black. A
          bounce off the floor, which is most of what lights the underside of a
          wall cabinet and the inside of an open one. Flat ambient alone gave a
          picture with no depth at all: every surface the same value, so an
          800 wide door and a 400 wide one were the same shape. */}
      {/* Distance haze. It starts well past anything in the kitchen, so the
          cabinets are never touched by it, and it gives the floor a horizon to
          run out to instead of an edge to stop at. The sky is exempt: fogging
          the dome as well leaves one flat colour and no horizon at all. */}
      <fog attach="fog" args={['#E9E4DA', 11000, 38000]} />

      <hemisphereLight args={['#F2F5F8', '#CFCCC6', 0.5]} />
      <directionalLight
        position={[span.x * 0.55 + 2200, 4200, span.z + 3400]}
        intensity={1.5} color="#FFF6E8"
        castShadow={!reduced}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={12}
        shadow-camera-near={100}
        shadow-camera-far={16000}
        shadow-camera-left={-(span.x + 4000)}
        shadow-camera-right={span.x + 4000}
        shadow-camera-top={span.z + 5000}
        shadow-camera-bottom={-(span.z + 3000)}
      />
      <directionalLight position={[-2600, 2200, -1800]} intensity={0.35} color="#DDE6F2" />
      <pointLight position={[span.x / 2, 260, span.z / 2 + 900]} intensity={0.25}
                  distance={6000} decay={2} color="#F0E6D4" />

      <Sky reduced={reduced} />

      <OrbitControls
        makeDefault enableDamping dampingFactor={0.09}
        minDistance={eye ? 1 : 700} maxDistance={eye ? 12000 : 20000}
        maxPolarAngle={Math.PI / 2 - 0.015}
        target={target}
      />
      {/* Frame points the camera at the selected cabinet and pulls in close
          enough to see it. Everything else keeps the whole room in view. */}
      <Rig preset={preset === 'Frame' && framed ? 'Iso' : preset} nonce={nonce}
           target={framed && preset === 'Frame' ? framed.target : target}
           distance={framed && preset === 'Frame'
             ? Math.max(1400, framed.size * 3.2) : distance}
           eye={eye} run={span.x} />

      <Floor span={span} colour={floorCol} />

      {/* The walls the cabinets stand against, one per run, built as the
          pieces around their openings so a window is a hole rather than a
          picture. An island has nothing behind it, which is what makes it an
          island, so it gets no wall. */}
      {show.walls && runs.filter((r) => !r.lay.island).map((r, i) => (
        <group key={i} position={[r.origin[0], 0, r.origin[1]]} rotation={[0, r.rot, 0]}>
          <RoomWall wall={r.lay.wall} length={r.lay.wall.length + 400}
                    ceiling={cfg.ceiling} wallCol={wallCol} trimCol={trimCol} show={show} />
        </group>
      ))}

      {/* The ceiling, drawn from one side only so it is there when you look up
          from inside and gone when you look down from outside. Without it an
          eye level walk is a room with the sky where the ceiling should be. */}
      {show.walls && (
        <mesh rotation={[Math.PI / 2, 0, 0]}
              position={[span.x / 2, cfg.ceiling, span.z / 2 + 300]}>
          <planeGeometry args={[span.x + 4800, span.z + 6000]} />
          <meshStandardMaterial color="#F7F6F3" roughness={1} side={THREE.FrontSide} />
        </mesh>
      )}

      {!reduced && (
        <ContactShadows position={[span.x / 2, 3, span.z / 2 + 300]}
                        scale={Math.max(span.x, span.z, 3000) * 2}
                        blur={2.2} opacity={0.42} far={900} resolution={1024} color="#3A332A" />
      )}

      {runs.map((r, i) => (
        <group key={r.lay.wall.id ?? i}
               position={[r.origin[0], 0, r.origin[1]]} rotation={[0, r.rot, 0]}>
          <WallRun lay={r.lay} cfg={cfg} selected={selected} setSelected={setSelected}
                   setHovered={setHovered} show={show} warnMap={warnMap} open={open} />
          {show.arcs && (
            <SwingArcs lay={r.lay} cfg={cfg} selected={selected} />
          )}
        </group>
      ))}

      {silhouette && <Person x={span.x / 2} z={Math.max(900, span.z * 0.55)} />}
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
      /* Draw when something changes, not sixty times a second at rest. A
         kitchen sitting still is the normal state of this view, and rendering
         it over and over is heat and battery for an identical picture. */
      frameloop="demand"
      dpr={props.reduced ? 1 : [1, 2]}
      camera={{ position: [2600, 2600, 3600], fov: 35, near: 10, far: 60000 }}
      /* Real shadows, and film response rather than raw linear output. Without
         the tone mapping every bright surface clips to flat white, which is
         what made a white kitchen look like cut paper. */
      shadows={props.reduced ? false : { type: THREE.PCFSoftShadowMap }}
      gl={{
        antialias: !props.reduced,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
      onPointerMissed={() => props.setSelected(null)}
      style={{ background: bg }}
    >
      <Environment reduced={props.reduced} />
      <Room {...props} warnMap={warnMap} />
    </Canvas>
  );
}


/* ---------------------------------------------------------------------------
   Swing arcs.

   The quarter circle a door's free corner travels, drawn on the floor. Green
   where the door opens all the way, amber where something stops it short, and
   the angle it actually reaches written beside it, because "this door only
   opens 40 degrees" is the useful sentence and "this door fouls" is not.
   --------------------------------------------------------------------------- */

function SwingArcs({ lay, cfg, selected }) {
  const arcs = useMemo(() => {
    const placed = lay.placed.filter((q) => !q.unit.cavity && q.unit.kind !== 'filler');
    const depth = lay.island ? islandDepth(lay.wall, cfg) : 0;
    const out = [];

    /* Everything standing in the plan, as a box seen from above, with each
       one put where its own side of the run actually is. Taking every cabinet
       as running from z 0 said the two sides of an island were in the same
       place, which is how the arcs used to report every island door as
       fouling the cabinet backing onto it. */
    const boxes = placed.map((q) => {
      const [z0, z1] = zRange(facing(q, depth), 0, q.unit.depth);
      return {
        uid: q.item.uid,
        x0: q.x, x1: q.x + q.unit.width, z0, z1,
        y0: q.unit.mountY, y1: q.unit.mountY + q.unit.height,
        label: q.unit.family.name,
      };
    });

    for (const p of placed) {
      if (selected && p.item.uid !== selected) continue;
      const doors = p.unit.parts.filter(
        (q) => q.group === 'front' && q.code.includes('DOOR'));
      if (!doors.length) continue;

      // The cabinet whose door it is cannot foul itself.
      const others = boxes.filter((q) => q.uid !== p.item.uid);
      const face = facing(p, depth);

      for (const door of doors) {
        const shut = swingSector(door, p.x, FULL_SWING, p.unit.mountY);
        const placedSector = face.flip
          ? mirrorSector(shut, face.offset)
          : { ...shut, cz: shut.cz + face.offset };

        const { angle } = openUntilBlocked(placedSector, others);
        const reach = Math.max(angle, 0.08);
        out.push({
          key: `${p.item.uid}-${door.code}`,
          sector: partSector(placedSector, reach / Math.abs(placedSector.to - placedSector.from)),
          reach: angle,
          blocked: angle < FULL_SWING - 0.01,
        });
      }
    }
    return out;
  }, [lay, cfg, selected]);

  return arcs.map((a) => <Arc key={a.key} {...a} />);
}

function Arc({ sector, reach, blocked }) {
  const points = useMemo(() => {
    /* A filled fan rather than a line, because a line on the floor at a
       shallow camera angle is almost invisible and the point of this is to be
       seen without hunting for it. */
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i <= 24; i++) {
      const [px, pz] = arcPoint(sector, i / 24);
      shape.lineTo(px - sector.cx, pz - sector.cz);
    }
    shape.lineTo(0, 0);
    return shape;
  }, [sector]);

  return (
    /* Rotating +90 about X takes the shape's own y to the room's +z. The other
       way round, which is how a floor plane is usually laid flat, sends the
       arc backwards into the wall where nothing can see it. */
    <group position={[sector.cx, 4, sector.cz]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <shapeGeometry args={[points]} />
        <meshBasicMaterial color={blocked ? '#C8892F' : '#4E8C63'}
                           transparent opacity={0.22} side={THREE.DoubleSide}
                           depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------------
   Somebody standing in the room.

   1700mm tall, which is about average for an adult in Australia. Not a model,
   just a shape: a kitchen drawn with nothing human in it gives no sense of
   whether the wall cabinets are out of reach or the walkway is wide enough to
   pass someone in.
   --------------------------------------------------------------------------- */

const PERSON_HEIGHT = 1700;

function Person({ x, z }) {
  const grey = '#8B8B88';
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, PERSON_HEIGHT * 0.46, 0]}>
        <capsuleGeometry args={[150, PERSON_HEIGHT * 0.52, 4, 12]} />
        <meshStandardMaterial color={grey} roughness={0.9}
                              transparent opacity={0.42} depthWrite={false} />
      </mesh>
      <mesh position={[0, PERSON_HEIGHT * 0.9, 0]}>
        <sphereGeometry args={[105, 16, 12]} />
        <meshStandardMaterial color={grey} roughness={0.9}
                              transparent opacity={0.42} depthWrite={false} />
      </mesh>
    </group>
  );
}
