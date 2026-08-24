# Blender asset pipeline

How assets authored in Blender get into the 3D viewer, what the rules are, and
what to ask for. Written to be pasted into a Blender-connected Claude session.

Read `CONTEXT.md` first. This document assumes it.

---

## 0. What this is for, and what it is not for

The viewer draws two different kinds of thing, and only one of them can come
from Blender.

**Parametric, stays in code, permanently.** Carcass sides, tops, bottoms,
backs, shelves, doors, drawer fronts, drawer boxes, benchtops, kickboards,
fillers and panels. Every one of these is a rectangle whose size is computed
from typed millimetres, and the cut list, the sheet nesting and the drilling
schedule all read the same part list. A Blender mesh here would have to be
non-uniformly scaled to fit, which distorts its edge profile and its detail,
and it would put a second source of truth next to the one holding the app
together. Do not model cabinets.

**Fixed, real objects, comes from Blender.** Anything with real dimensions
that never derive from the part list: tapware, sinks, appliances, handles,
stools, power points, waste traps, window and door joinery, skirting and
cornice profiles, light fittings. `Fixtures.jsx` builds all of these out of
boxes and tubes today and says so in its own header. That is the honest
approximation Blender replaces.

**Surface detail, also comes from Blender, and matters more than the meshes.**
Every material in the app is a flat hex plus a roughness and a metalness.
Perfectly uniform surfaces are the single strongest reason the render reads as
computer graphics rather than as a room. Baked detail maps fix that.

---

## 1. The budget, which decides everything else

Assets are inlined into the bundle as base64. There is no network request
after load and there is a single-file build. That is a deliberate constraint
and it is not being relaxed.

Base64 costs 4 bytes for every 3 bytes of binary, and already-compressed
binary does not gzip further, so **base64 size is the real transfer size**.

| | Binary | As base64 | Notes |
| --- | --- | --- | --- |
| Total asset budget | 1.1 MB | 1.5 MB | Hard ceiling for the whole library |
| One mesh, typical | 30 to 50 KB | 40 to 67 KB | Draco compressed glTF |
| One mesh, hero item | 60 KB | 80 KB | Tapware, a sink, a fridge front |
| One greyscale detail map | 15 to 40 KB | 20 to 53 KB | See below |

That budget buys roughly **twenty meshes and six detail maps**. It does not
buy more. Every request in this document is sized against it.

### The rule that makes textures affordable

Do not author a texture per finish. `finishes.js` already holds colour
separately from surface, and the viewer already tints materials per role. So
the library is not twelve colour textures, it is a small set of **greyscale
detail maps that every finish shares and tints at runtime**:

- one board micro-surface map, used by all twelve melamine and MDF finishes
- one timber grain map, used by oak, walnut, birch and pine, tinted per species
- one plaster tooth map for walls and ceilings
- one brushed metal streak map

Four maps, under 200 KB of base64, covering every surface in the room. Colour
never comes from a texture. Colour comes from `finishes.js`.

Large-scale features that cannot tile, chiefly stone benchtop veining, are not
shipped as images at all. They are generated in a shader from parameters, and
the Blender session's job is to supply those parameters rather than a bitmap.

---

## 2. The standing contract

Paste this section into every Blender session. It does not change between
batches. Everything here exists because getting it wrong costs a full
round trip.

### Units and axes

- **Work in millimetres.** Set the scene unit system to Metric, unit scale
  0.001, length unit Millimeters. Every number quoted in this document is
  millimetres.
- The viewer's coordinate system is **Y up**, x along the wall, y up from the
  floor, z out into the room away from the wall. Blender is Z up. The glTF
  exporter converts this. **Apply all transforms before export**
  (`Object > Apply > All Transforms`) so no object carries a residual
  rotation or a non-unit scale.
- Export scale must land such that **one glTF unit equals one millimetre**.
  The viewer's scene is in millimetres throughout and does no rescaling.
  Confirm this on the first asset by checking a known dimension in the
  exported file.

### Origins and pivots

The origin is not decorative. The viewer positions objects by their origin and
in some cases rotates them about it.

- **Default:** origin at the centre of the object's footprint in x and z, and
  at the **lowest point in y**. An object placed at y=0 sits on the floor.
- **Wall-mounted items** (power points, switches, vents, taps mounted to a
  splashback): origin at the centre of the mounting face, with the object
  extending in +z away from the wall.
- **Anything that hinges or turns** (a tap lever, a tap spout that swivels, a
  door, an appliance door): origin **on the hinge or rotation axis**, and the
  moving part must be its own named child object so the viewer can rotate it
  independently.
- **Anything that drops into a benchtop** (sinks, cooktops): origin at the
  **top face**, centred, so it can be placed directly at bench height.

### Naming

Object and material names are read programmatically. They must be exact.

- Objects: `kebab-case`, describing the part, not its appearance.
  `tap-body`, `tap-spout`, `tap-lever`, `tap-aerator`, `tap-base-plate`.
- The root empty for a delivered asset is named for the asset itself:
  `tap-mixer-gooseneck`.
- Moving parts are suffixed so intent is unambiguous: `-pivot` for anything
  the viewer will rotate, `-slide` for anything it will translate.
- Materials: `mat-` plus the material family, matching the names already in
  `Fixtures.jsx` where one exists. The existing set is `steel`, `brushed`,
  `chrome`, `darkSteel`, `enamel`, `black`, `glassDark`, `ceramic`, `rubber`,
  `copper`, `pvc`, `brass`, `timber`, `stone`, `plaster`, `tile`, `fabric`.
  So: `mat-chrome`, `mat-brushed`. **Do not invent a new material family
  without saying so explicitly in the delivery notes**, because the viewer has
  to be taught it.

### Topology

- **Triangles, quads, no n-gons.** Triangulate on export.
- No interior geometry. If it cannot be seen, delete it. A tap has no thread
  inside it and a fridge has no compressor.
- **Every hard edge gets a bevel.** This is the most important line in this
  document. A 90 degree edge with no bevel catches no highlight and is the
  loudest possible signal that something is computer generated. Two segments
  at 0.3 mm is enough on small items, 0.5 mm on appliance panels. Use a
  weighted normal modifier afterwards so the bevel shades cleanly.
- Shade smooth with an autosmooth angle around 30 degrees, sharpened by the
  bevel rather than by split normals where possible.
- Curved surfaces get enough segments to read at close orbit but no more. A
  tap spout is a hero object seen from 400 mm away and deserves 24 sided
  tubes. A waste pipe seen through a cabinet opening does not, and gets 12.
- **Stay inside the triangle budget quoted per asset.** If the shape cannot be
  made within it, say so in the delivery notes rather than exceeding it.

### UVs

- Every mesh is UV unwrapped, non-overlapping, in the 0 to 1 space.
- Scale UVs to be **consistent in world space** across an asset, so a detail
  map tiles at the same physical size on every part of it.
- Mark seams where a real object has a seam. Objects are small and seams are
  cheap.

### Materials

The viewer does not read Blender material node trees. glTF export flattens
them, and this pipeline deliberately ships almost no texture images.

- Use **Principled BSDF only**, with flat values rather than node networks.
- Set base colour, roughness and metalness to real values. These get read out
  of the file and turned into entries the viewer can use, so they should be
  physically sensible: chrome is roughness 0.05 to 0.1 and metalness 1,
  brushed steel is roughness 0.4 to 0.5 and metalness 0.85, enamel is
  roughness 0.3 and metalness 0.
- **Do not bake or attach per-object textures.** They do not fit in the
  budget. Surface character comes from the shared detail maps described in
  section 4.
- Glass parts get their own material named `mat-glass` and are exported as a
  separate object, because the viewer applies a transmissive material to them
  rather than the exported one.
- Keep the material count per asset to **four or fewer**. Each one is a draw
  call, and the working mode has to stay fast on a phone.

### Export settings

Export **glTF 2.0 binary, `.glb`**, with:

- Format: glTF Binary
- Include: Selected Objects, plus Custom Properties
- Transform: +Y Up **on**
- Geometry: Apply Modifiers **on**, UVs **on**, Normals **on**, Tangents
  **off**, Vertex Colors **off**, Materials: Export
- Compression: **Draco on**, position quantisation 14, normal 10, texture
  coordinate 12, generic 12
- Animation: **off**, entirely. The viewer animates things itself.
- No cameras, no lights, no empties other than the named root.

### What to deliver, per asset

Four things, every time. The script matters as much as the mesh.

1. **The generator script, `<asset-name>.py`.** A standalone Blender Python
   script that builds the asset from named numeric constants at the top of the
   file and exports the `.glb`. This is the actual deliverable. It means a
   variant is free to regenerate, a dimension can be corrected without a new
   chat session, and the exact pivot positions and dimensions can be read out
   of the source rather than guessed from the mesh.
2. **The exported `<asset-name>.glb`**, Draco compressed, within budget.
3. **A manifest entry**, as JSON, in the shape given in section 5.
4. **Delivery notes**: final triangle count, final file size in bytes,
   the bounding box in millimetres, every named object and what it is for,
   every material used, and anything that had to be compromised to stay in
   budget.

---

## 3. Batch one, the pilot

Two assets. Deliberately small. The point of a pilot is to find the scale,
pivot and export problems on asset one rather than on asset thirty, so build
these two, deliver them, and let them land in the viewer before anything else
is authored.

### 3.1 Asset: `tap-mixer-gooseneck`

The worst offender in the current viewer. `Fixtures.jsx` builds the tap from
three cylinders. A tap is nothing but curve and reflection, and cylinders
cannot fake either, so it renders as a grey stick standing on the bench. It is
also the object a client's eye goes to first, because it is the shiniest thing
in the room.

**What it is:** a single-lever gooseneck kitchen mixer, deck mounted through
the benchtop, chrome. The common Australian kitchen tap. Not a pull-out
spray, not a wall mounted set, not a three piece tap set. Those are separate
assets for a later batch.

**Dimensions**, millimetres. Verify against a real product before building;
these are the intended targets.

| Feature | Value |
| --- | --- |
| Overall height, floor of bench to top of arc | 320 |
| Spout outlet height above bench | 250 |
| Spout reach, centre of body to centre of outlet | 210 |
| Body diameter | 45 |
| Base plate diameter | 55 |
| Base plate height | 8, with a soft crown rather than a flat disc |
| Spout tube diameter | 28, tapering to 24 at the outlet |
| Gooseneck arc radius | 95 |
| Lever length | 90 |
| Lever pivot height above bench | 300 |
| Bench penetration below origin | 0, the model stops at the bench |

**Named objects:**

- `tap-base-plate`, the escutcheon sitting on the bench
- `tap-body`, the vertical column
- `tap-spout`, the gooseneck arc and the outlet, one continuous swept tube
- `tap-aerator`, the outlet fitting at the tip, a slightly wider ring
- `tap-lever-pivot`, the handle. **Its origin is on its rotation axis**, which
  is horizontal and runs through the body at 300 mm, so the viewer can lift
  and swing it.

**Materials:** `mat-chrome` for everything except the aerator, which is
`mat-brushed` so the tip reads as a separate part rather than as more of the
same shine. Two materials, no more.

**Budget:** 6,000 triangles, 60 KB binary. Spend the triangles on the
gooseneck arc and the transition where the spout leaves the body, because that
fillet is what makes a tap look cast rather than assembled from pipe.

**Origin:** centre of the base plate, at its lowest point, which is bench
surface level. Placing the asset at bench height with no offset must put it
correctly on the bench.

**Bevels:** every edge, including the rim of the base plate, both ends of the
aerator, and the lever's outline. The base plate crown and the body meet in a
fillet, not a hard corner.

**What makes or breaks this asset:** the continuity of the spout sweep. If the
arc has a visible facet or a shading break where the radius changes, the
reflection will crawl across it when the camera orbits and it will look worse
than the three cylinders it replaced. Get the sweep clean before adding any
other detail.

### 3.2 Asset: `surface-detail-set`

Not a mesh. Four small tileable greyscale maps, which every material in the
room will share and tint. This is the highest realism return in the whole
project per byte spent, because it converts every flat surface in the app at
once.

**Every map is:**

- **Greyscale, single channel**, saved as an 8 bit PNG. Colour never comes
  from these. Colour comes from `finishes.js`.
- **Seamlessly tileable.** Verify by tiling four by four and looking for the
  seam and for any feature distinctive enough to be spotted repeating.
- **Centred on mid grey (128).** These are multiplied against a base value at
  runtime, so 128 must mean no change. A map that averages brighter or darker
  than mid grey will shift every surface that uses it.
- **Low contrast.** The temptation is to make these readable on their own.
  Resist it. Real melamine varies by a couple of percent, not by fifty.
- Delivered with **the physical size the map represents**, in millimetres, so
  the viewer can tile it at the right world scale.

| Map | Size | Represents | Physical tile |
| --- | --- | --- | --- |
| `detail-board.png` | 512 | The pressed micro-texture of melamine faced board. Very fine, slightly directional, like a shallow orange peel. Amplitude a few percent. | 200 mm |
| `detail-grain.png` | 512 | Timber grain, straight and open, readable as oak. Tinted per species at runtime, so it must not be species specific in its own value range. | 400 mm along the grain |
| `detail-plaster.png` | 256 | Painted plasterboard tooth. Barely there. Its whole job is to stop a wall reading as a flat card. | 300 mm |
| `detail-brushed.png` | 256 | Directional brush streaks for stainless steel. Strongly anisotropic, running in one axis. | 60 mm |

**Each map is used as a roughness modulation**, not as a bump or a colour.
Roughness variation is what sells a real surface, because it changes how the
highlight breaks up across it, and it costs one channel instead of three.

**Also deliver, as numbers rather than as images**, a parameter set describing
stone benchtop veining, so it can be generated in a shader instead of shipped
as a bitmap. Veining is a large scale feature and a tiling image would repeat
visibly across a three metre bench. Give, for each of three stone types (a
white engineered stone with fine grey veins, a warm speckled stone, and a dark
stone with a single bold vein):

- base colour and vein colour as hex
- vein density, in veins per metre
- vein width in millimetres, and how much it varies
- vein angle in degrees from the long axis, and its variation
- speckle density, size in millimetres, and contrast
- the surface roughness of the polished face

**Budget:** 200 KB base64 for all four maps combined. If a map cannot hit
that, halve its resolution before reducing its quality, because these are
tiled small and detail is cheaper to lose than tileability.

---

## 4. The full inventory, for later batches

The whole road, so the pilot can be judged against where it is going. Nothing
here is authorised yet. Items are grouped by what they do for the render
rather than by what they are, and ordered within each group by how much they
change the picture.

Every item inherits the standing contract in section 2. Dimensions marked with
a question mark need confirming before that batch is commissioned.

### Group A, tapware and the sink

The shiniest objects in the room and the ones the eye lands on.

| Asset | Notes |
| --- | --- |
| `tap-mixer-gooseneck` | The pilot. Done first. |
| `tap-mixer-pullout` | Same body, hose spout, visible weight below. |
| `tap-mixer-square` | The squared off profile, for a contemporary scheme. |
| `tap-filtered-secondary` | The small second tap beside the mixer. |
| `sink-single-bowl` | Undermount and topmount variants. 400 by 400 by 200 bowl, 10 mm corner radius. |
| `sink-double-bowl` | 800 wide overall. |
| `sink-with-drainer` | The pressed drainer flutes are the whole point of it. |
| `sink-waste-basket` | The strainer in the plughole, seen from above constantly. |
| `sink-mixer-flexi-hoses` | Braided hose, seen when the sink base is open. |

### Group B, appliances

Currently boxes sized to their cutout. The silhouette is what identifies them.

| Asset | Notes |
| --- | --- |
| `fridge-french-door-900` | Handles, door gasket, the shadow line between doors. |
| `fridge-upright-700` | |
| `dishwasher-fascia-600` | 598 wide. Fascia, control strip, handle, kick vent. |
| `oven-wall-600` | Glass door, handle rail, control fascia, vent slot above. |
| `oven-wall-double-600` | |
| `cooktop-gas-600` and `-900` | Trivets are the detail that matters. Cast iron, not tubes. |
| `cooktop-induction-600` and `-900` | Glass, printed zone rings, touch controls. |
| `rangehood-canopy-900` | |
| `rangehood-undermount-600` | |
| `microwave-built-in` | |
| `washer-front-load-600` | Door glass and drum are visible through it. |
| `cooker-freestanding-900` | Oven plus cooktop as one unit. |

### Group C, the room shell

What surrounds the kitchen. Cheap geometry, large effect, because these fill
the frame whenever the camera pulls back.

| Asset | Notes |
| --- | --- |
| `skirting-profile-*` | Delivered as a **cross section profile**, not a mesh. The viewer extrudes it along a run. AU pine: 67, 92, 138 high, in bullnose, colonial and square. |
| `cornice-profile-*` | Same. 55 and 75 cove, plus a square set option. |
| `architrave-profile-*` | Same. 42 and 67. |
| `window-casement-single` | Frame, sash, glazing bar, reveal, sill, stay. Reveal is 120 in the app. |
| `window-awning-double` | |
| `window-sliding-double` | |
| `window-hardware` | Winder, latch, hinge. Small, seen close. |
| `door-panel-2040x820` | Standard AU internal door, 35 thick, four panel and flush variants. |
| `door-frame-and-stop` | |
| `door-furniture` | Lever set, latch, hinges. |
| `floor-board-profile` | Board width, join profile, end match. 130 and 180. |
| `splashback-tile-profile` | Tile size, grout width and depth, edge bevel. |

### Group D, services and the small detail

The things that make a kitchen look installed rather than assembled. Each one
is tiny and none of them are currently anything but a coloured box.

| Asset | Notes |
| --- | --- |
| `gpo-double-au` | Australian AS/NZS 3112 three pin double socket. The app already carries this at 120 by 80, which matches a standard plate. The angled pins are what make it read as Australian. |
| `gpo-single-au` | |
| `switch-plate-1-gang` to `-4-gang` | |
| `waste-bottle-trap-40` | Chrome, seen every time the sink base opens. |
| `waste-p-trap-40` | |
| `stop-tap-quarter-turn` | |
| `gas-bayonet-point` | |
| `downlight-90` | 90 mm cutout, the AU standard. |
| `strip-light-under-cabinet` | Also acts as a real light source in the scene. |
| `vent-grille-round` and `-rect` | |
| `duct-flexible-150` | For the rangehood run. |
| `hinge-concealed-110` | Seen every time a door opens in the viewer. |
| `drawer-runner-soft-close` | Seen every time a drawer opens. |

### Group E, handles

Small, repeated on every front in the kitchen, and therefore visible in every
single frame. Very high value for very little geometry.

`handle-d-bar-round`, `handle-d-bar-square`, `handle-bow`, `handle-knob-round`,
`handle-knob-knurled`, `handle-edge-pull`, `handle-recessed-finger`,
`handle-shell-pull`. Each in the standard centre distances: 96, 128, 160, 224,
320. Deliver as **one parametric script** producing all lengths from one
profile rather than as separate models.

### Group F, styling props

Only for presentation mode, never in working mode. Their entire job is to give
the render scale and life. Keep them few, keep them plain, and keep them out
of the way of the cabinetry, which is the thing being sold.

`stool-bar-timber`, `stool-bar-metal`, `bowl-fruit`, `board-chopping`,
`kettle`, `plant-potted-small`, `tea-towel-hanging`, `canister-set`,
`glass-tumbler`, `pendant-light`.

### Group G, the outside

Currently nothing at all sits beyond the windows, which is why a window reads
as a hole rather than as a source of daylight. This group is the largest
single realism gain available for the smallest amount of geometry.

| Asset | Notes |
| --- | --- |
| `backdrop-garden` | A shallow 2.5D card set of foliage and fence at a few depths, seen only through glass and always defocused. Costs almost nothing and completely changes what a window is. |
| `backdrop-suburban` | Neighbouring roofline and sky. |
| `backdrop-courtyard` | Paving and a wall. |
| `sky-parameters` | Not a mesh and not an HDRI. Numbers describing sun elevation and azimuth, sky colour at zenith and horizon, and ground bounce colour, for four times of day. The viewer already generates its sky in a shader and can drive it from these. |

---

## 5. The manifest

Every delivered asset carries a JSON entry. The viewer reads the manifest
rather than hard coding what exists, so a new asset is a data change.

```json
{
  "id": "tap-mixer-gooseneck",
  "kind": "tapware",
  "name": "Gooseneck mixer",
  "file": "tap-mixer-gooseneck.glb",
  "bytes": 48210,
  "triangles": 5840,
  "bounds": { "x": 55, "y": 320, "z": 236 },
  "origin": "base-plate-centre-bottom",
  "mount": "benchtop",
  "materials": ["chrome", "brushed"],
  "moving": [
    { "object": "tap-lever-pivot", "type": "rotate",
      "axis": [1, 0, 0], "at": [0, 300, 0], "range": [0, 35] }
  ],
  "tier": "presentation",
  "fallback": "Tap"
}
```

Two fields carry the whole design.

**`tier`** is `working` or `presentation`. Working mode assets load always.
Presentation mode assets load only when the full render is turned on. This is
what keeps the viewer usable on a phone in a workshop while still being able
to produce a picture worth showing a client.

**`fallback`** names the existing procedural component in `Fixtures.jsx` that
draws this thing today. It is never removed. If an asset fails to parse, is
not in the bundle, or the device cannot afford it, the viewer draws the
fallback and carries on. Nothing in the app is allowed to depend on an asset
being present.

---

## 6. What happens on the viewer side

For context, so the Blender work is aimed at the right target. None of this
needs Blender and most of it is worth more than any single mesh. Listed
roughly in order of how much it changes the picture.

1. **Bevel every panel edge.** Every cabinet part is drawn with a sharp
   cornered box. A 0.3 mm arris that catches a highlight is the difference
   between board and a coloured rectangle, and in a room made entirely of
   rectangles nothing else comes close to this in effect.
2. **Ambient occlusion.** There is none today, only a contact shadow under the
   whole run. The 3 mm reveals between doors, the underside of the benchtop
   nose, the inside of the toe kick and the back corners of every carcass all
   currently glow where they should go dark.
3. **A progressive still pass.** Orbit rough and fast, and when the camera
   stops, accumulate jittered frames for about 400 ms and resolve to a clean
   still with depth of field. This gives a phone a usable frame rate and a
   client a near offline quality image from the same code, and it doubles as
   the render for the print pack.
4. **AgX tone mapping** in place of ACES at 0.95 exposure. A white kitchen is
   almost entirely highlight and ACES crushes it.
5. **Two modes**, working and presentation, driven by the manifest `tier`.
6. **A real sun**, with elevation and azimuth from the `sky-parameters`, plus
   a light portal at each window opening so daylight enters where a window is
   rather than uniformly.
7. **Transmissive glass** for windows and oven doors, with a slight tint and a
   very slight surface irregularity.
8. **Clearcoat** on gloss two pack fronts, which currently look identical to
   matte melamine because only roughness separates them.
9. **The detail maps from section 3.2**, applied as roughness modulation and
   tinted by `finishes.js`.
10. **Shader generated stone**, from the parameters in section 3.2.

---

## 7. Questions that need answering before batch two

Batch one is small enough to build without these. Batch two is not.

### About the kitchens themselves

1. What ceiling height should the room default to? 2400, 2550 or 2700.
2. Are the kitchens usually against a plasterboard wall, or is a tiled or
   stone splashback the norm? This decides how much tile work is worth doing.
3. Is there a bulkhead above the wall cabinets, or do they run to the ceiling,
   or is there open space above them? All three look completely different and
   each needs its own trim.
4. Which appliance brands and models actually get specified? A generic oven is
   fine, but if it is always the same three brands then the fascia proportions
   should match them.
5. Overhead cabinet lighting: is under cabinet strip lighting normal, and are
   there pendants over an island? Both are light sources, not just objects.
6. Flooring: timber, tile, vinyl plank, or polished concrete? And is it laid
   along the run or across it?

### About the render

7. Which single view sells a kitchen best in your experience: a three quarter
   view from the corner of the room, a straight elevation, or a low camera
   near bench height? The presentation mode should default to it.
8. Should presentation mode include styling props at all, or does a bare
   kitchen sell the cabinetry better?
9. How dark are you willing to let the render go? Real interior daylight has
   deep shadows, and the current lighting is flat and bright, which is safe
   and slightly lifeless.
10. Do you want a night mode with artificial lighting only? It is the single
    most flattering way to render a kitchen and it needs the light fittings
    modelled to work.

### About scope and effort

11. How many Blender round trips are you actually willing to do? Twenty
    assets is twenty sessions unless the scripts are written to produce
    families, which is why section 2 asks for the generator script.
12. Is 1.5 MB of base64 acceptable in the bundle, given it is parsed on every
    page load? If the answer turns out to be no, the honest fix is
    progressive enhancement with fetched assets, and it is worth deciding
    that before the library is built rather than after.
13. Should the single file build carry the assets too, or drop to the
    procedural fallbacks? Carrying them makes it a very large HTML file.
14. Are the appliance and tapware shapes allowed to be generic, or do they
    need to be recognisable as specific products? Generic is faster, safer
    and avoids modelling someone's product without asking.

### About the pilot specifically

15. Is 320 mm the right overall tap height, or should it match a specific tap
    you would actually fit? `Fixtures.jsx` uses 320 as its default and that
    number came from nowhere in particular.
16. Chrome, brushed nickel, matte black or brass as the default tapware
    finish? Matte black and brass are currently very common and both are
    already in the `SURFACE` table.
