/* ===========================================================================
   The things in a kitchen that are not cabinets.

   A cabinet is a box of rectangles and the model already knows every one of
   them, so the 3D can draw it exactly. Everything else in the room was a grey
   box: the sink, the cooktop, the oven, the fridge, the dishwasher, the
   window, the pipes. All of them the same grey box, all of them the size of
   the hole they go in rather than the shape of the thing.

   That is not a small cosmetic problem. A kitchen you cannot recognise is a
   kitchen you cannot check. You cannot see that the tap is going to foul the
   window reveal, or that the oven door opens into the walkway, or that the
   waste pipe comes out behind a drawer box, if all four of those are the same
   featureless slab.

   So everything here is built from its real dimensions out of primitives.
   Nothing is a texture and nothing is loaded: the app has no server, so an
   asset is a request that may not come back, and a kitchen that renders as
   grey boxes on a slow connection is the problem this file exists to fix.

   Coordinates are the same as everywhere else in the 3D: x along the wall,
   y up from the floor, z out into the room from the wall, millimetres.
   =========================================================================== */

import { useMemo } from 'react';
import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Materials.

   Named by what the thing is made of rather than by colour, so a change to
   what stainless steel looks like happens once. Metalness and roughness are
   the two that actually carry the read: a tap has to look wet and an oven
   door has to look like dark glass, and both of those are about how they take
   the light rather than about their colour.
   --------------------------------------------------------------------------- */

export const SURFACE = {
  steel: { color: '#B9BEC4', roughness: 0.28, metalness: 0.92 },
  brushed: { color: '#A8ADB3', roughness: 0.44, metalness: 0.85 },
  chrome: { color: '#D6DADE', roughness: 0.09, metalness: 1 },
  darkSteel: { color: '#54585C', roughness: 0.35, metalness: 0.7 },
  enamel: { color: '#F2F1EE', roughness: 0.32, metalness: 0.04 },
  black: { color: '#26282B', roughness: 0.4, metalness: 0.12 },
  glassDark: { color: '#15171A', roughness: 0.06, metalness: 0.2 },
  ceramic: { color: '#FBFAF7', roughness: 0.12, metalness: 0.02 },
  rubber: { color: '#33363A', roughness: 0.95, metalness: 0 },
  copper: { color: '#B07A4E', roughness: 0.35, metalness: 0.8 },
  pvc: { color: '#F0EFEA', roughness: 0.6, metalness: 0 },
  brass: { color: '#C6A263', roughness: 0.3, metalness: 0.85 },
  timber: { color: '#B8875A', roughness: 0.7, metalness: 0 },
  stone: { color: '#CBC6BD', roughness: 0.35, metalness: 0.05 },
  plaster: { color: '#EDEAE4', roughness: 0.96, metalness: 0 },
  tile: { color: '#E4E7E7', roughness: 0.18, metalness: 0.03 },
  fabric: { color: '#7C7F85', roughness: 0.94, metalness: 0 },
};

/**
 * A material by name, ghosted where something else is selected.
 *
 * Every fixture takes the same ghost flag the cabinets do, so selecting a
 * cabinet fades the room around it rather than fading the cabinets and
 * leaving the appliances solid in front of them.
 */
export function Surface({ of = 'steel', tint, ghost, opacity, ...rest }) {
  const s = SURFACE[of] || SURFACE.steel;
  return (
    <meshStandardMaterial
      color={tint || s.color}
      roughness={s.roughness}
      metalness={s.metalness}
      transparent={ghost || opacity != null}
      opacity={ghost ? 0.14 : (opacity ?? 1)}
      depthWrite={!ghost}
      {...rest}
    />
  );
}

/** Glass. Its own thing, because it is the only surface you see through. */
export function Glass({ ghost, tint = '#AFC4CB', opacity = 0.3 }) {
  return (
    <meshStandardMaterial color={tint} roughness={0.04} metalness={0.1}
                          transparent opacity={ghost ? 0.08 : opacity}
                          depthWrite={false} side={THREE.DoubleSide} />
  );
}

/* A box, positioned by its centre, in millimetres. Nearly every shape below
   is one of these, so it is worth not writing out three times a line. */
export const Box = ({ at, size, of, tint, ghost, opacity, ...rest }) => (
  <mesh position={at} castShadow receiveShadow {...rest}>
    <boxGeometry args={size} />
    <Surface of={of} tint={tint} ghost={ghost} opacity={opacity} />
  </mesh>
);

/* A cylinder standing on its own axis. Rotated so `axis` says which way it
   points, because a pipe out of a wall and a tap up off a bench are the same
   shape turned. */
export const Tube = ({ at, r, len, of, tint, ghost, axis = 'y', seg = 20, r2 }) => {
  const rot = axis === 'y' ? [0, 0, 0]
    : axis === 'x' ? [0, 0, Math.PI / 2]
      : [Math.PI / 2, 0, 0];
  return (
    <mesh position={at} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[r2 ?? r, r, len, seg]} />
      <Surface of={of} tint={tint} ghost={ghost} />
    </mesh>
  );
};

/* ---------------------------------------------------------------------------
   The sink.

   Drawn from the cabinet it sits in rather than from a fixed size, because a
   1200 sink base takes a double bowl and a 600 one does not. Bowls are
   recessed into the top, which means they are drawn as a lining rather than
   as a solid: four walls and a floor, so you can see into them from above,
   which is the angle nearly everybody looks at a kitchen plan from.

   The tap goes behind the bowl, and its height is the thing worth seeing: a
   gooseneck under a window that opens inward is the classic mistake, and now
   the drawing shows it.
   --------------------------------------------------------------------------- */

const BOWL = {
  depth: 180,      // how far down into the cabinet the bowl goes
  rim: 12,         // the lip standing proud of the benchtop
  wall: 8,
};

export function Sink({ width, benchTop, benchDepth, ghost, double }) {
  /* Two bowls once there is room for two that are worth having, one otherwise.
     Below this a second bowl is a place to put one mug. */
  const twin = double ?? width >= 900;
  const gap = 60;
  const usable = Math.min(width - 160, twin ? 780 : 500);
  const bowlW = twin ? (usable - gap) / 2 : usable;
  const bowlD = Math.min(benchDepth - 220, 420);

  const cx = width / 2;
  const cz = benchDepth / 2 - 30;
  const top = benchTop;

  const bowl = (ox, key) => {
    const x0 = cx + ox - bowlW / 2;
    const z0 = cz - bowlD / 2;
    const w = BOWL.wall;
    return (
      <group key={key}>
        {/* the four sides of the lining, and its floor */}
        <Box at={[x0 + w / 2, top - BOWL.depth / 2, cz]} size={[w, BOWL.depth, bowlD]} of="brushed" ghost={ghost} />
        <Box at={[x0 + bowlW - w / 2, top - BOWL.depth / 2, cz]} size={[w, BOWL.depth, bowlD]} of="brushed" ghost={ghost} />
        <Box at={[x0 + bowlW / 2, top - BOWL.depth / 2, z0 + w / 2]} size={[bowlW, BOWL.depth, w]} of="brushed" ghost={ghost} />
        <Box at={[x0 + bowlW / 2, top - BOWL.depth / 2, z0 + bowlD - w / 2]} size={[bowlW, BOWL.depth, w]} of="brushed" ghost={ghost} />
        <Box at={[x0 + bowlW / 2, top - BOWL.depth, cz]} size={[bowlW, w, bowlD]} of="brushed" ghost={ghost} />
        {/* waste outlet, so the plumbing below has somewhere to arrive */}
        <Tube at={[x0 + bowlW / 2, top - BOWL.depth + 6, cz]} r={45} len={10} of="steel" ghost={ghost} />
      </group>
    );
  };

  return (
    <group>
      {/* the rim, one piece around both bowls */}
      <Box at={[cx, top + BOWL.rim / 2, cz]}
           size={[usable + 90, BOWL.rim, bowlD + 90]} of="brushed" ghost={ghost} />
      {twin
        ? [bowl(-(bowlW + gap) / 2, 'l'), bowl((bowlW + gap) / 2, 'r')]
        : [bowl(0, 'one')]}
      <Tap at={[cx, top, cz - bowlD / 2 - 70]} ghost={ghost} />
    </group>
  );
}

/**
 * A mixer tap. A gooseneck, because that is what nearly everybody puts in and
 * it is the one that fouls a window.
 */
export function Tap({ at, ghost, height = 320 }) {
  const [x, y, z] = at;
  const reach = 190;
  const arc = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, height * 0.55, 0),
      new THREE.Vector3(0, height * 0.92, reach * 0.16),
      new THREE.Vector3(0, height, reach * 0.55),
      new THREE.Vector3(0, height * 0.86, reach),
    ]);
    return new THREE.TubeGeometry(curve, 20, 14, 12, false);
  }, [height]);

  return (
    <group position={[x, y, z]}>
      {/* base and column */}
      <Tube at={[0, 8, 0]} r={34} len={16} of="chrome" ghost={ghost} />
      <Tube at={[0, height * 0.28, 0]} r={17} len={height * 0.56} of="chrome" ghost={ghost} />
      <mesh geometry={arc} castShadow>
        <Surface of="chrome" ghost={ghost} />
      </mesh>
      {/* the lever, thrown to one side so it reads as a mixer */}
      <group position={[0, height * 0.56, -14]} rotation={[-0.5, 0, 0]}>
        <Box at={[0, 0, -40]} size={[16, 14, 90]} of="chrome" ghost={ghost} />
      </group>
      {/* aerator */}
      <Tube at={[0, height * 0.84 - 14, reach]} r={13} len={26} of="chrome" ghost={ghost} />
    </group>
  );
}

/**
 * What is under the sink.
 *
 * A bottle trap and two stop taps. Not decoration: this is the volume that
 * argues with a drawer box, and the reason a sink base has no shelf. Drawn
 * only when the cabinet it is in has no drawer in the way of it.
 */
export function SinkPlumbing({ width, benchTop, benchDepth, ghost, twin }) {
  const cx = width / 2;
  const cz = benchDepth / 2 - 30;
  const top = benchTop - BOWL.depth;
  const spread = twin ? 210 : 0;

  const leg = (ox, key) => (
    <group key={key} position={[cx + ox, 0, cz]}>
      <Tube at={[0, top - 60, 0]} r={22} len={120} of="pvc" ghost={ghost} />
      {/* the trap itself, the fat bit that eats the back of a drawer */}
      <Tube at={[0, top - 165, 0]} r={44} len={110} of="pvc" ghost={ghost} />
      <Tube at={[0, top - 235, 0]} r={22} len={40} of="pvc" ghost={ghost} />
    </group>
  );

  return (
    <group>
      {twin ? [leg(-spread / 2, 'l'), leg(spread / 2, 'r')] : [leg(0, 'one')]}
      {/* the run back to the wall */}
      <Tube at={[cx, top - 250, cz / 2]} r={22} len={cz} of="pvc" ghost={ghost} axis="z" />
      {/* stop taps, one hot one cold */}
      {[-90, 90].map((ox) => (
        <group key={ox} position={[cx + ox, 480, 60]}>
          <Tube at={[0, 0, 30]} r={11} len={60} of="chrome" ghost={ghost} axis="z" />
          <Tube at={[0, 34, 60]} r={9} len={68} of="chrome" ghost={ghost} />
          <Tube at={[0, 72, 60]} r={28} len={12} of={ox < 0 ? 'copper' : 'chrome'} ghost={ghost} />
        </group>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------------
   Cooking.
   --------------------------------------------------------------------------- */

/**
 * A cooktop sitting in the benchtop.
 *
 * Induction by default, because that is a flat glass plate with printed rings
 * and it draws cleanly. Gas gets cast trivets, which are the shape you read a
 * gas hob by from across a room.
 */
export function Cooktop({ width, depth, top, ghost, gas = false, burners }) {
  const w = Math.min(width - 60, 900);
  const d = Math.min(depth - 120, 520);
  const cx = width / 2;
  const cz = depth / 2 - 40;
  const n = burners ?? (w >= 800 ? 5 : 4);

  /* Four in a square, five with one in the middle. Any more than that on a
     domestic hob is a commercial range, which is a different drawing. */
  const spots = useMemo(() => {
    const ax = w * 0.24;
    const az = d * 0.24;
    const four = [[-ax, -az], [ax, -az], [-ax, az], [ax, az]];
    return n >= 5 ? [...four, [0, 0]] : four.slice(0, n);
  }, [w, d, n]);

  return (
    <group position={[cx, top, cz]}>
      {/* the plate, sitting just proud of the stone */}
      <Box at={[0, 5, 0]} size={[w, 10, d]} of={gas ? 'enamel' : 'glassDark'} ghost={ghost} />
      {spots.map(([ox, oz], i) => (gas ? (
        <group key={i} position={[ox, 12, oz]}>
          {/* burner cap and the trivet fingers around it */}
          <Tube at={[0, 14, 0]} r={44} r2={34} len={28} of="black" ghost={ghost} />
          {[0, 1, 2, 3].map((k) => (
            <Box key={k} at={[Math.cos((k * Math.PI) / 2) * 62, 26, Math.sin((k * Math.PI) / 2) * 62]}
                 size={[k % 2 ? 14 : 110, 12, k % 2 ? 110 : 14]} of="black" ghost={ghost} />
          ))}
        </group>
      ) : (
        <mesh key={i} position={[ox, 11, oz]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.min(w, d) * 0.11, Math.min(w, d) * 0.13, 32]} />
          <meshStandardMaterial color="#7C7268" roughness={0.5}
                                transparent opacity={ghost ? 0.14 : 0.9} side={THREE.DoubleSide} />
        </mesh>
      )))}
      {/* touch controls along the front edge */}
      {!gas && (
        <Box at={[0, 11, d / 2 - 34]} size={[w * 0.5, 2, 26]} of="darkSteel" ghost={ghost} />
      )}
    </group>
  );
}

/**
 * An oven, as a front.
 *
 * Positioned by whoever draws it, because the same front goes in a tall tower,
 * under a cooktop and in a freestanding cooker. Dark glass with a steel
 * surround and a bar handle, which is what makes an oven read as an oven and
 * not as a cupboard door.
 */
export function OvenFront({ width, height, at, ghost, controls = true }) {
  const inset = 26;
  const barY = height - 74;

  return (
    <group position={at}>
      <Box at={[width / 2, height / 2, 12]} size={[width, height, 24]} of="brushed" ghost={ghost} />
      {/* the glass, set into the door */}
      <Box at={[width / 2, height / 2 - (controls ? 34 : 0), 26]}
           size={[width - inset * 2, height - inset * 2 - (controls ? 68 : 0), 8]}
           of="glassDark" ghost={ghost} />
      {/* a bar handle across the top, standing off the door */}
      <Tube at={[width / 2, barY, 62]} r={13} len={width - 60} of="steel" ghost={ghost} axis="x" />
      {[-1, 1].map((s) => (
        <Tube key={s} at={[width / 2 + s * (width / 2 - 30), barY, 42]} r={9} len={40} of="steel" ghost={ghost} axis="z" />
      ))}
      {controls && (
        <>
          <Box at={[width / 2, height - 26, 26]} size={[width - inset * 2, 34, 6]} of="darkSteel" ghost={ghost} />
          {[-1, 1].map((s) => (
            <Tube key={s} at={[width / 2 + s * (width * 0.3), height - 26, 34]} r={16} len={16} of="steel" ghost={ghost} axis="z" />
          ))}
        </>
      )}
    </group>
  );
}

/**
 * A freestanding cooker: oven under, hob on top, control panel between.
 *
 * The one appliance that is not a cavity with something slid into it, which is
 * why the benchtop breaks either side of it, and why drawing it as a blocked
 * out volume told you nothing about which way round it went.
 */
export function Cooker({ width, height, depth, ghost, gas = true }) {
  const panelH = 110;
  const ovenH = height - panelH - 90;
  const knobs = gas ? 5 : 4;

  return (
    <group>
      {/* body */}
      <Box at={[width / 2, height / 2, depth / 2]} size={[width, height, depth]} of="enamel" ghost={ghost} />
      {/* plinth, set back so it reads as standing on feet */}
      <Box at={[width / 2, 45, depth / 2 - 20]} size={[width - 20, 90, depth - 40]} of="darkSteel" ghost={ghost} />
      <OvenFront width={width} height={ovenH} at={[0, 90, depth]} ghost={ghost} controls={false} />
      {/* control panel with knobs, at the top where you reach it */}
      <Box at={[width / 2, height - panelH / 2, depth + 8]} size={[width, panelH, 16]} of="brushed" ghost={ghost} />
      {/* Array.from hands its callback the value and the index and nothing
          else, so the count has to be a name rather than the third argument
          every other map has. */}
      {Array.from({ length: knobs }, (_, i) => (
        <Tube key={i} at={[(width * (i + 1)) / (knobs + 1), height - panelH / 2, depth + 30]}
              r={22} len={30} of="steel" ghost={ghost} axis="z" />
      ))}
      <Cooktop width={width} depth={depth} top={height} ghost={ghost} gas={gas} />
    </group>
  );
}

/**
 * A range hood.
 *
 * A tapered canopy over a flue, which is the silhouette you recognise one by.
 * The taper matters: a straight box is a cupboard, and a hood that reads as a
 * cupboard is one nobody notices is too low over the cooktop.
 */
export function Hood({ width, height, depth, ghost }) {
  const canopy = Math.min(230, height * 0.42);
  const flueW = Math.max(220, width * 0.32);
  const flueD = Math.min(depth, 320);

  const shell = useMemo(() => {
    /* Four sided taper: wide and deep at the bottom, narrow at the top. Built
       as a lathe would not do it, so it is a cylinder with four segments,
       which is a frustum with square ends. */
    const g = new THREE.CylinderGeometry(1, 1, 1, 4, 1, false, Math.PI / 4);
    return g;
  }, []);

  return (
    <group>
      <mesh geometry={shell}
            position={[width / 2, canopy / 2, depth / 2]}
            scale={[(width / 2) * Math.SQRT2, canopy, (depth / 2) * Math.SQRT2]}
            castShadow>
        <Surface of="brushed" ghost={ghost} />
      </mesh>
      {/* the rim, so the taper ends on a line rather than a point */}
      <Box at={[width / 2, 14, depth / 2]} size={[width, 28, depth]} of="steel" ghost={ghost} />
      {/* baffle filters, angled, catching the light under the canopy */}
      {[-1, 1].map((s) => (
        <Box key={s} at={[width / 2 + s * width * 0.2, 24, depth / 2]}
             size={[width * 0.34, 8, depth - 90]} of="darkSteel" ghost={ghost} />
      ))}
      {/* light strip */}
      <Box at={[width / 2, 20, depth - 46]} size={[width * 0.5, 6, 34]}
           of="ceramic" ghost={ghost} />
      {/* flue */}
      <Box at={[width / 2, canopy + (height - canopy) / 2, flueD / 2]}
           size={[flueW, height - canopy, flueD]} of="brushed" ghost={ghost} />
    </group>
  );
}

/* ---------------------------------------------------------------------------
   Things that slide into a hole.
   --------------------------------------------------------------------------- */

/** A dishwasher. Integrated fronts are a cabinet door, so this is the exposed
    kind: a steel front with a recessed handle and a control strip. */
export function Dishwasher({ width, height, depth, ghost }) {
  return (
    <group>
      <Box at={[width / 2, height / 2, depth / 2]} size={[width, height, depth]} of="darkSteel" ghost={ghost} />
      <Box at={[width / 2, height / 2, depth]} size={[width - 12, height - 20, 22]} of="brushed" ghost={ghost} />
      {/* the control strip along the top of the door */}
      <Box at={[width / 2, height - 46, depth + 12]} size={[width - 60, 44, 6]} of="black" ghost={ghost} />
      {/* recessed handle */}
      <Box at={[width / 2, height - 100, depth + 6]} size={[width - 90, 30, 18]} of="steel" ghost={ghost} />
      {/* kick vent */}
      <Box at={[width / 2, 40, depth + 4]} size={[width - 40, 60, 10]} of="black" ghost={ghost} />
    </group>
  );
}

/** A fridge. Two doors with a shadow line between them and vertical bar
    handles, which is what tells you where the hinges are and which side it
    opens, and therefore whether it opens into the walkway. */
export function Fridge({ width, height, depth, ghost, freezerAt = 0.32 }) {
  const split = height * freezerAt;
  const handle = (y, h) => (
    <group>
      <Tube at={[width - 90, y, depth + 58]} r={13} len={h} of="steel" ghost={ghost} />
      {[-1, 1].map((s) => (
        <Tube key={s} at={[width - 90, y + (s * h) / 2, depth + 34]} r={9} len={44} of="steel" ghost={ghost} axis="z" />
      ))}
    </group>
  );

  return (
    <group>
      {/* The carcass in the same steel as the doors, because a fridge is one
         colour all over and a dark body reads as a black slab from the side.
         The doors stand proud of it and the shadow gap between them is drawn
         dark, which is what tells you where the hinges are, and therefore
         which way it opens and into what. */}
      <Box at={[width / 2, height / 2, depth / 2]} size={[width, height, depth]} of="brushed" ghost={ghost} />
      {/* freezer below, fridge above, with the gap between them drawn dark */}
      <Box at={[width / 2, split / 2, depth + 8]} size={[width - 16, split - 14, 18]} of="steel" ghost={ghost} />
      <Box at={[width / 2, split + (height - split) / 2, depth + 8]}
           size={[width - 16, height - split - 14, 18]} of="steel" ghost={ghost} />
      {handle(split - 260, 460)}
      {handle(split + 300, 640)}
      {/* the shadow gap, and a plinth vent */}
      <Box at={[width / 2, split, depth + 4]} size={[width, 10, 12]} of="black" ghost={ghost} />
      <Box at={[width / 2, 30, depth + 4]} size={[width - 40, 44, 10]} of="black" ghost={ghost} />
    </group>
  );
}

/**
 * A washing machine.
 *
 * Front loader: a round glass door, a detergent drawer and a control panel,
 * and it stands on feet rather than sitting on a kick. Australian laundries
 * put one under the benchtop next to the tub, so it belongs in the same
 * drawing as the kitchen it opens off.
 */
export function Washer({ width, height, depth, ghost }) {
  const r = Math.min(width, height - 240) * 0.36;
  const doorY = height * 0.46;

  return (
    <group>
      <Box at={[width / 2, height / 2, depth / 2]} size={[width, height, depth]} of="enamel" ghost={ghost} />
      {/* control panel across the top */}
      <Box at={[width / 2, height - 60, depth + 6]} size={[width - 20, 110, 14]} of="enamel" ghost={ghost} />
      <Box at={[width * 0.62, height - 60, depth + 16]} size={[width * 0.4, 52, 4]} of="black" ghost={ghost} />
      <Tube at={[width * 0.22, height - 60, depth + 26]} r={34} len={22} of="darkSteel" ghost={ghost} axis="z" />
      {/* detergent drawer, always the left third */}
      <Box at={[width * 0.22, height - 150, depth + 12]} size={[width * 0.34, 60, 24]} of="enamel" ghost={ghost} />
      {/* the door: a rim, a recess and the glass in it */}
      <Tube at={[width / 2, doorY, depth + 14]} r={r + 34} len={28} of="brushed" ghost={ghost} axis="z" seg={40} />
      <Tube at={[width / 2, doorY, depth + 4]} r={r} len={26} of="darkSteel" ghost={ghost} axis="z" seg={40} />
      <mesh position={[width / 2, doorY, depth + 26]} rotation={[0, 0, 0]}>
        <sphereGeometry args={[r, 28, 20, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        <Glass ghost={ghost} tint="#8FA6AE" opacity={0.42} />
      </mesh>
      {/* feet */}
      {[[60, 60], [width - 60, 60], [60, depth - 60], [width - 60, depth - 60]].map(([fx, fz], i) => (
        <Tube key={i} at={[fx, 16, fz]} r={24} len={32} of="black" ghost={ghost} />
      ))}
    </group>
  );
}

/** A microwave in an open bay. Door, window, control panel down one side. */
export function Microwave({ width, height, depth, ghost }) {
  const doorW = width * 0.7;
  return (
    <group>
      <Box at={[width / 2, height / 2, depth / 2]} size={[width, height, depth]} of="darkSteel" ghost={ghost} />
      <Box at={[doorW / 2, height / 2, depth]} size={[doorW, height - 14, 20]} of="brushed" ghost={ghost} />
      <Box at={[doorW / 2, height / 2, depth + 12]} size={[doorW - 70, height - 90, 6]} of="glassDark" ghost={ghost} />
      {/* control panel and a bar handle on the closing edge */}
      <Box at={[width - (width - doorW) / 2, height / 2, depth + 8]}
           size={[width - doorW - 12, height - 30, 14]} of="black" ghost={ghost} />
      <Tube at={[doorW - 24, height / 2, depth + 34]} r={10} len={height - 120} of="steel" ghost={ghost} />
    </group>
  );
}

/* ---------------------------------------------------------------------------
   The room itself.
   --------------------------------------------------------------------------- */

/**
 * A window, as a hole with a frame in it.
 *
 * The reveal is what makes it read: a plain rectangle painted on a wall looks
 * like a picture, and a recess with a sill looks like a window. The sill also
 * happens to be the thing a benchtop runs into, so drawing it is not decoration.
 */
export function Window({ w, h, ghost, reveal = 120, sill = 30 }) {
  const f = 45;   // frame section
  return (
    <group>
      {/* the reveal, four returns going back into the wall */}
      <Box at={[w / 2, h + reveal / 2 - reveal / 2, -reveal / 2]} size={[w, 1, reveal]} of="plaster" ghost={ghost} visible={false} />
      <Box at={[w / 2, h, -reveal / 2]} size={[w + f, 14, reveal]} of="plaster" ghost={ghost} />
      <Box at={[0, h / 2, -reveal / 2]} size={[14, h, reveal]} of="plaster" ghost={ghost} />
      <Box at={[w, h / 2, -reveal / 2]} size={[14, h, reveal]} of="plaster" ghost={ghost} />
      {/* sill, proud of the wall, which is what the benchtop meets */}
      <Box at={[w / 2, -sill / 2, -reveal / 2 + 18]} size={[w + 90, sill, reveal + 40]} of="stone" ghost={ghost} />

      {/* frame */}
      <group position={[0, 0, -reveal + f / 2]}>
        <Box at={[w / 2, f / 2, 0]} size={[w, f, f]} of="enamel" ghost={ghost} />
        <Box at={[w / 2, h - f / 2, 0]} size={[w, f, f]} of="enamel" ghost={ghost} />
        <Box at={[f / 2, h / 2, 0]} size={[f, h, f]} of="enamel" ghost={ghost} />
        <Box at={[w - f / 2, h / 2, 0]} size={[f, h, f]} of="enamel" ghost={ghost} />
        {/* one mullion, so it reads as a pair of sashes rather than a hole */}
        <Box at={[w / 2, h / 2, 0]} size={[f * 0.7, h, f]} of="enamel" ghost={ghost} />
        <mesh position={[w / 2, h / 2, -4]}>
          <planeGeometry args={[w - f * 2, h - f * 2]} />
          <Glass ghost={ghost} />
        </mesh>
      </group>
    </group>
  );
}

/** A doorway: an opening with an architrave round it and nothing in it. */
export function Doorway({ w, h, ghost, reveal = 110 }) {
  const a = 60;
  return (
    <group>
      <Box at={[w / 2, h, -reveal / 2]} size={[w, 14, reveal]} of="plaster" ghost={ghost} />
      <Box at={[0, h / 2, -reveal / 2]} size={[14, h, reveal]} of="plaster" ghost={ghost} />
      <Box at={[w, h / 2, -reveal / 2]} size={[14, h, reveal]} of="plaster" ghost={ghost} />
      <Box at={[w / 2, h + a / 2, 8]} size={[w + a * 2, a, 22]} of="enamel" ghost={ghost} />
      <Box at={[-a / 2, h / 2, 8]} size={[a, h + a, 22]} of="enamel" ghost={ghost} />
      <Box at={[w + a / 2, h / 2, 8]} size={[a, h + a, 22]} of="enamel" ghost={ghost} />
    </group>
  );
}

/** A power point. Small, and worth drawing: it is the thing a splashback and
    a wall cabinet both have to work around. */
export function Outlet({ w, h, ghost }) {
  return (
    <group>
      <Box at={[w / 2, h / 2, 6]} size={[Math.max(w, 115), Math.max(h, 78), 12]} of="enamel" ghost={ghost} />
      {[-1, 1].map((s) => (
        <Box key={s} at={[w / 2 + s * Math.max(w, 115) * 0.22, h / 2, 14]}
             size={[30, 34, 6]} of="black" ghost={ghost} />
      ))}
    </group>
  );
}

/** A service coming out of the wall: waste, water or gas. Pipes, at the size
    and height the obstacle says, so a drawer box drawn through one is
    visible instead of implied. */
export function Service({ kind, w, h, ghost }) {
  const tone = kind === 'gas' ? 'brass' : kind === 'water' ? 'copper' : 'pvc';
  const r = Math.max(18, Math.min(w, h) / 2);
  const out = kind === 'waste' ? 160 : 90;

  return (
    <group>
      {/* escutcheon flat on the wall, then the pipe out of it */}
      <Tube at={[w / 2, h / 2, 6]} r={r + 16} len={12} of="enamel" ghost={ghost} axis="z" />
      <Tube at={[w / 2, h / 2, out / 2]} r={r} len={out} of={tone} ghost={ghost} axis="z" />
      {kind !== 'waste' && (
        /* a stop tap on the end, with its handle */
        <>
          <Tube at={[w / 2, h / 2, out]} r={r + 10} len={34} of="chrome" ghost={ghost} axis="z" />
          <Box at={[w / 2, h / 2 + r + 26, out]} size={[16, 46, 16]} of="chrome" ghost={ghost} />
        </>
      )}
      {kind === 'waste' && (
        <Tube at={[w / 2, h / 2 + 60, out]} r={r} len={120} of={tone} ghost={ghost} />
      )}
    </group>
  );
}

/** A vent or flue penetration. A grille, not a hole. */
export function Vent({ w, h, ghost }) {
  const bars = Math.max(3, Math.floor(h / 34));
  return (
    <group>
      <Box at={[w / 2, h / 2, 8]} size={[w + 24, h + 24, 16]} of="brushed" ghost={ghost} />
      {Array.from({ length: bars }, (_, i) => (
        <Box key={i} at={[w / 2, ((i + 0.5) * h) / bars, 18]} size={[w - 12, h / bars - 10, 6]}
             of="darkSteel" ghost={ghost} />
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------------
   The breakfast bar.
   --------------------------------------------------------------------------- */

/**
 * A stool at the bar.
 *
 * Not furniture the app is designing. It is a scale figure at seat height:
 * four stools drawn along a 2400 island is the fastest way to see whether
 * four people actually fit at it, and whether the one on the end is sitting
 * in the walkway.
 */
export function Stool({ ghost, seatHeight = 650 }) {
  const r = 165;
  return (
    <group>
      <Tube at={[0, seatHeight, 0]} r={r} len={44} of="timber" ghost={ghost} seg={28} />
      <Tube at={[0, seatHeight - 60, 0]} r={54} len={80} of="darkSteel" ghost={ghost} />
      <Tube at={[0, seatHeight / 2 - 40, 0]} r={26} len={seatHeight - 130} of="brushed" ghost={ghost} />
      {/* foot ring, which is what makes a stool read as a bar stool */}
      <mesh position={[0, 220, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[135, 12, 8, 28]} />
        <Surface of="brushed" ghost={ghost} />
      </mesh>
      <Tube at={[0, 12, 0]} r={175} len={24} of="darkSteel" ghost={ghost} seg={28} />
    </group>
  );
}

/**
 * What holds the overhang up.
 *
 * A flat plate bracket, which is the common one: it screws to the carcass and
 * runs out under the stone. Drawn so you can see it is in the way of somebody's
 * knees, which is the argument against brackets and for a leg.
 */
export function BarBracket({ reach, ghost, drop = 180 }) {
  return (
    <group>
      <Box at={[0, -drop / 2, -30]} size={[12, drop, 60]} of="darkSteel" ghost={ghost} />
      <Box at={[0, -14, reach / 2 - 30]} size={[12, 28, reach]} of="darkSteel" ghost={ghost} />
      {/* the gusset between the two, which is where the strength is */}
      <mesh position={[0, -28, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[Math.min(reach, drop) * 0.8, Math.min(reach, drop) * 0.8, 12, 3, 1, false, Math.PI]} />
        <Surface of="darkSteel" ghost={ghost} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------------
   Cabinet hardware.
   --------------------------------------------------------------------------- */

/**
 * A bar handle on a front.
 *
 * The order list has been counting handles all along and the drawing has never
 * shown one. They are most of what a kitchen looks like from across a room,
 * and a handle on a drawer next to a wall is a knuckle you are going to skin.
 */
export function Handle({ at, length, ghost, vertical = false, stand = 34 }) {
  const [x, y, z] = at;
  const half = length / 2;
  return (
    <group position={[x, y, z]}>
      <Tube at={[0, 0, stand]} r={9} len={length} of="steel" ghost={ghost}
            axis={vertical ? 'y' : 'x'} />
      {[-1, 1].map((s) => (
        <Tube key={s}
              at={[vertical ? 0 : s * half, vertical ? s * half : 0, stand / 2]}
              r={7} len={stand} of="steel" ghost={ghost} axis="z" />
      ))}
    </group>
  );
}
