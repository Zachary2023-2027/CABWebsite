# Kitchen Cabinet Builder, context document

A complete description of this application, written to be pasted into an AI as
background before asking it to change, extend, review or reason about the app.
It describes what exists, not what is planned.

Live at `https://zachary2023-2027.github.io/CABWebsite/app/`.
Repository `Zachary2023-2027/CABWebsite`, branch `claude/kitchen-cabinet-builder-p2mi6a`.

---

## 1. What it is

A browser application for designing kitchen cabinets and getting from a design
to a pile of cut, drilled parts. It is aimed at one person building frameless
European (32mm system) cabinets in a home workshop, not at a cabinet shop and
not at a customer-facing showroom.

- **All dimensions are millimetres. All money is AUD.** No other units exist
  anywhere in the app or the model.
- **Australian conventions throughout**: 900mm benchtop over a 150mm kickboard,
  560mm base carcass depth, 320mm wall carcass depth, 600mm benchtop depth.
- **All prices are estimates**, seeded in the app, and are labelled as such
  everywhere they appear.
- Everything runs client side. **There is no server, no account and no
  network call.** Projects live in the browser's localStorage and in files the
  user downloads.

### Design constraints the app is held to

These are user-imposed rules that apply to any new work:

- UI text is plain and direct. **No em dashes. No filler. No corporate
  phrasing. No emoji anywhere in the interface.**
- Priorities in order: **simplicity of use, then correctness of the maths,
  then features.** It has to stay usable on a phone or tablet in a workshop.
- **Anything new must carry through to the cut list, drilling schedule,
  nesting, costing and print output**, not just the screen it was added on.
- **Existing saved projects must not break.**
- Settings uses **no drop-down menus**; values are typed.
- The app is **light theme only**. There is no theme switcher.

---

## 2. Stack and structure

- Vite 8, React 19, three.js 0.185 via @react-three/fiber 9 and @react-three/drei 10.
- No state library, no router, no CSS framework. State is React hooks in
  `App.jsx`; the screen is a string in state.
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on push.

```
/index.html           the front page, static, marketing only
/app                  the real application (this document describes /app)
  /src                all application code
  vite.config.js      base './', SINGLE=1 env builds a self-contained HTML file
/design
  tokens.css          design tokens: colour ramp, type scale, spacing, drawing colours
  components.css      component styles shared with the standalone board pages
  components.html     component reference page
  tokens-board.html   token reference page
/docs                 this file, plus BUILD_PROMPT.md
```

### Source files in `/app/src`

**Model, no React:**

| File | Responsibility |
| --- | --- |
| `catalog.js` | `PROJECT` defaults, `PRICES`, the cabinet family table, and `buildUnit()` which turns a family plus settings into a real part list |
| `project.js` | Walls, room shape, layout, snapping, warnings, totals, and the project-wide part/fitting/unit lists |
| `nesting.js` | Shelf packing parts onto sheets, offcuts, cutting sequence |
| `drilling.js` | Hole positions per panel: pocket screws, the 32mm system, hinges |
| `pocket.js` | Pocket hole joinery: the jig geometry, spacing, screw sizes |
| `paneldim.js` | How a drilled panel is annotated: text size, which numbers fit, runs |
| `clearance.js` | Every carcass and front put in room coordinates and measured against each other |
| `elevdim.js` | The dimension chains under and beside an elevation |
| `stack.js` | The front stack, and `reveals()`/`frontSpan()`: every gap around a front |
| `optimise.js` | Width search per wall, and project-wide material and build plans |
| `storage.js` | localStorage, snapshots, validation on load, file import and export |
| `cabinet.js` | Helpers for the single-cabinet viewer: bounds, `cutSize`, `fmt` |
| `draw2d.js` | Front detail for the elevation: door styles, handles, panels, grain, appliance glyphs. Geometry only, in millimetres |

**Screens (React):** `App.jsx` (shell, rail, top strip, undo, start screen),
`Planner.jsx`, `Elevation.jsx`, `Kitchen3D.jsx`, `Viewer.jsx`, `Advanced.jsx`,
`Fields.jsx`, `Screen.jsx`, `CutList.jsx`, `Nesting.jsx`, `Drilling.jsx`,
`Hardware.jsx`, `Costing.jsx`, `Settings.jsx`, `Reference.jsx`,
`Workshop.jsx`, `Print.jsx`, `Appearance.jsx`, `app.css`.

---

## 3. The central idea

**Every part is a rectangle: length, width, thickness.** That single invariant
is what makes the cut list, the 3D view and the sheet nesting mutually
consistent, because all three read the same part list. A part is:

```js
{
  code: 'A1-SIDE-L',        // cabinet number + role
  key: 'u03a1/SIDE-L',      // stable across edits, see below
  name: 'Left side',
  group: 'carcass' | 'front' | 'back' | 'shelf' | 'box' | 'filler',
  material: 'White melamine 16mm',   // species + thickness, always
  L, W, T,                  // cut size in mm, rounded to 0.1
  size: [x, y, z],          // 3D box dimensions
  pos:  [x, y, z],          // position inside the cabinet
  explode: [x, y, z],       // direction it flies out in the exploded view
  edging: 'All four edges' | 'Front edge' | ...,
  drawer: 1 | null,         // which drawer it belongs to
  tone: 'melamine' | 'ply' | 'mdf',  // 3D material
  unitId, unitLabel, wallId, wallName   // added by allParts()
}
```

Two rules that follow from this and are easy to break:

- **Part codes are not stable.** A code contains the cabinet number, which is a
  position in the run, so deleting a cabinet shifts every code after it.
  Anything remembered against a part must use `part.key`, which is built from
  the cabinet's own uid. The "cut" ticks use `key` for exactly this reason.
- **Material names are species plus thickness** (`'Birch ply 16mm'`). That
  string is how a part finds its sheet in `PRICES.sheets`. Renaming a sheet is
  a real operation, not a label change.

---

## 4. Data model

```js
project = {
  name: 'Riverstone kitchen',
  cfg: { ...PROJECT },        // every default below, overridable per project
  room: 'straight' | 'l' | 'u',
  walls: [{
    id: 'A', name: 'Wall A', length: 3600,
    obstacles: [{ x, y, w, h, label }],
    units: [{ uid, familyId, settings: { width, height, depth, x, doors,
                                         drawers, shelves, drawerHeights,
                                         blindExtra, blindSide,
                                         cfg: { /* per-cabinet overrides */ } } }],
  }],
  activeWall: 'A',
  locked: ['uid', ...],       // cabinets the width optimiser must not touch
  extras: [{ id, name, qty, cost }],   // user-typed hardware
}
```

A **snapshot** is what gets saved: `{ schema: 2, id, name, savedAt, project,
cut: [keys], prices, quoted }`.

### Config keys (`project.cfg`, defaults from `catalog.js` `PROJECT`)

| Group | Keys and defaults |
| --- | --- |
| Heights | `benchHeight 900`, `benchThk 30`, `kick 150`, `wallMount 1500`, `wallCabHeight 720`, `tallHeight 2100`, `ceiling 2400` |
| Depths | `baseDepth 560`, `wallDepth 320`, `benchDepth 600` |
| Thickness | `carcassThk 16`, `backThk 6`, `frontThk 18`, `boxSideThk 16`, `boxBaseThk 6` |
| Boards | `carcassBoard`, `frontBoard`, `backBoard`, `boxBoard`, `boxBaseBoard` (empty means follow the sides) |
| Build | `backType 'full' \| 'rail'`, `backRailHeight 120`, `boxBaseFix 'screwed' \| 'butted'` |
| Drawers | `runnerLength 500`, `runnerClearance 21`, `boxHeight 140`, `boxSetback 20`, `baseGroove 10`, `boxClearTop 20`, `boxClearBottom 5` |
| Gaps | `reveal 3`, `revealTop 0`, `revealBottom 0`, `revealLeft`, `revealRight`, `revealBetween` (the last three empty means follow the reveal), `shelfSetback 20`, `blindClearance 50`, `frontClearance 40` |
| Joinery | `jointMethod 'pocket-screw'`, `shelfFix 'pocket' \| 'pins'`, `rearRow 'grid'` |
| Saw | `kerf 3.2`, `trim 10`, `minOffcut 150` |

**Per-cabinet overrides** live at `unit.settings.cfg` and are layered over the
project config inside `buildUnit`, so one cabinet can be 18mm birch ply while
the rest stay 16mm melamine. Everything downstream reads the part list, so cut
list, nest, drilling and costing follow automatically.

### Prices (`PRICES`, editable on Settings, mutated in place so costing sees it)

`sheets` is a map of material name to `{ size: [w, h], cost }`. Seeded with
White melamine 16 and 18mm, MDF 6mm, Birch ply 16 and 6mm. Plus `hinge 6.5`,
`runnerPair 28`, `handle 9`, `binRunner 64`, `benchPerMetre 320`,
`kickPerMetre 26`, `edgeTapePerMetre 0.6`, and `includeBench` (a boolean that
decides whether the benchtop is added to the project total).

---

## 5. Cabinet families

21 families in five groups. `kind` decides which run it occupies and how tall
it is. `fronts` decides what gets built.

**Corner:** `base-blind-l` (one full height door), `base-corner-drawer` (a drawer
across the top of the opening and a door under it, which is IKEA's
METOD/MAXIMERA corner base at 1280 x 680 x 800: 1280 along the wall, a 680
opening, and the 600 left over is the leg the return run butts into) and
`base-corner-carousel` (the same frame, one door). All three are the same
blind corner with a different stack in the opening, and the two new ones carry
a carousel as a bought fitting.

**Base:** `base-1door`, `base-2door`, `base-3drawer`, `base-4drawer`,
`base-sink` (two full height doors, and nothing over them: the plank across the
top is what a drawer bank has instead of a drawer and a sink base has no use
for one), `base-oven` (a built-in oven in the top of a base carcass with a
drawer under it), `base-pullout` (one tall front on a full extension runner),
`base-corner` (plain blind corner),
`base-blind-l` (blind corner for an L, see below), `base-micro` (open microwave
bay over a drawer), `base-bin` (one full height drawer front on a bin runner:
a drawer, not a cupboard, and no wooden box is cut because the bin carrier is
the box).

**Wall:** `wall-1door`, `wall-2door`, `wall-bridge` (short, over a cooktop or
window), `wall-open` (no doors, all edges taped).

**Tall:** `tall-pantry` (a lower and an upper pair of doors rather than 2100mm
doors), `tall-oven` (oven cavity, door above, drawer below).

**Appliance cavities** (`cavity: true`, zero parts, zero cost, they only block
out space): `app-fridge`, `app-dishwasher`, `app-cooktop` (breaks the
benchtop), `app-cooktop-oven`, `app-rangehood`.

**Filler:** `filler`, a scribe strip.

Each family carries a list of sensible widths (used by the width optimiser and
the picker), a default settings object, and a line-drawing glyph.

### The L-shape blind corner

`base-blind-l` is the cabinet that makes a corner work. The return cabinets on
the next wall butt against its side, so part of its front is dead. That dead
width is **derived, not typed**: it is the benchtop depth plus an extra you
set (`blindExtra`, default 50), so widening the benchtop widens the blind panel
and the door keeps clearing. The door takes whatever is left. `blindSide`
picks which end runs into the corner. The unit exposes `cornerReturn`, its own
depth **plus a front thickness**, which is how far along the next wall the run
has to start. The front thickness matters: the blind panel and the door stand
proud of the carcass, and a return that started at the carcass depth put one
wall's front inside the other's by a board thickness in the corner. It is
18mm, it is invisible in plan, and it is why the doors would not go on.

---

## 6. Layout and positioning

`layoutWall(wall, cfg, startOffset)` resolves a wall into placed units with
real x positions. Two cursors run along the wall: the base run on the floor and
the wall run above it. A tall unit or a full-height appliance advances both.

**Flow and pin.** A unit with no `settings.x` *flows*: it lands wherever the
run has got to, so reordering or resizing moves everything after it. Drag one
and it *pins*: it stays at that millimetre and the flow works around it. The
cursor still advances past a pinned unit. "Close gaps" unpins a whole wall and
packs it back together; "Back in line" unpins one cabinet.

**Snapping** (`snapX`). A drag pulls to the joins that matter: butted against a
neighbour on either side, the start of the wall, the end of the wall. Tolerance
60mm. A blind corner is pulled from 400mm and beats a plain butt joint at the
same distance, because the corner is the only place it works. The join that
took hold is drawn as a line up the wall and named.

### An island has four sides

Every face of an island is a face you can stand at, so all four take cabinets
and all four can carry a breakfast bar.

**A side is a frame, not a flag.** `unitFrame(p, length, depth)` in
`project.js` is the one table the whole thing rests on. A point in a cabinet's
own space, x across its width and z from its back at 0 to its front at its
depth, lands at the same formula the room uses to place a wall, so the two
compose without either knowing about the other:

| side | origin | turn |
| --- | --- | --- |
| front | `[along + width, depth]` | 180 |
| back | `[along, islandDepth - depth]` | 0 |
| left | `[depth, along]` | -90 |
| right | `[length - depth, along + width]` | +90 |

A wall is the same function returning `[along, 0]` and no turn. Front and back
come out as exactly the transforms this app already used for them. `framePoint`
and `frameBox` apply it; the 3D that draws the island, the clearance check that
measures it and the elevation all read it, so none of them can disagree.

**Each side is its own run.** Front and back run along the island's length and
the ends along its depth, so `layoutWall` keeps four cursors and `lay.runOf(side)`
says how long each is. Snapping, first free position, gaps, overlaps and the
past-the-end warning all take one of four sides instead of one of two.

**The sides take one another's corners.** A cabinet on an end butts against the
ends of the front and back runs, so what an end really has is the island's depth
less however deep those two are. On a 1120 island with 560 cabinets front and
back that is nothing at all, and it is not a mistake: the ends of such an island
are the exposed side panels of the long runs. `cornerTaken()` takes it off the
run rather than warning afterwards, so a cabinet is never dropped into a corner
that is already full, and the wall says why the end is unusable.

**Breakfast bars are a list.** `wall.bars` is an array of
`{side, depth, from, length}`, one per side, so an overhang along the back and a
return across an end is a thing you can say. Left empty, `length` is the whole
side. `wall.bar`, the single one, is read as a list of one, so nothing saved
before this breaks. The stools, the brackets, the slab and the walkway behind
each one all follow the list; a bar along part of a side is its own rectangle
beside the slab, because an L is not a piece anybody can dimension.

**Room shapes.** `straight` (one wall), `l` (two), `u` (three). The joined
walls are taken in order from the wall list, excluding the island. An L turns
at the right hand end of the first wall and runs toward the viewer; a U comes
back down the other side. Those are the only rotations that leave the doors
facing into the room. Each wall after the first inherits a `startOffset` equal
to the `cornerReturn` of the corner cabinet on the wall before it.

**Wrapping.** Adding a cabinet that will not fit on the current wall puts it on
the next wall in the run and follows it there. Dragging one off the end does
the same; dragging it back before the start returns it.

**Warnings** are computed per cabinet (`unitWarnings`), per wall
(`wallWarnings`) and across the whole floor (`clearance.js`), and all three are
listed in one strip under the drawing as well as being drawn on the cabinet:
past the end of the wall, every cabinet it overlaps, shelf span over 800mm,
drawer over 900mm, filler over 100mm, a door over 1000mm wide, blind panel too
narrow, door opening under 300mm, runs into an obstacle, gaps in the run with
their position, a wall that turns a corner with no corner cabinet, a corner
cabinet that is not last, and everything measured across the room below.

**Obstacles that block are not advice.** An obstacle set to "In the way" is a
stretch of wall that does not exist as far as the run is concerned, at the
heights it actually occupies. It comes out of `firstFreeX`, so a new cabinet
never lands in a doorway; `snapX` pushes a drag clear of it whatever the snap
wanted; and both of its edges are snap targets pulled from 250mm, so an
appliance dragged up to a doorway lands against it. A window at 900 blocks a
tall pantry and a wall cabinet and does not block the base cabinet under it.

**Clearances are measured across the room, not along one wall** (`clearance.js`).
Every carcass and every front is put into one set of room coordinates using the
room layout, so wall A and wall B are measured against each other. That is the
only frame in which the corner works: a wall by wall check cannot see the
cabinet on the next wall, and the corner is exactly where the trouble is. It
reports carcasses built through each other, fronts that occupy the same air
with both of them shut, fronts on different runs closer than `frontClearance`
(only when they are parallel: two perpendicular fronts meeting at a corner are
meant to touch), and any door that opens less than a right angle, naming what
it runs into.

---

## 7. Screens

Eleven screens, chosen from a left rail. A persistent top strip shows the
project name (editable), save state, cabinets, doors, drawers, sheets and the
estimated cost, plus Undo/Redo, Export file and Projects.

### Planner
The main screen. A cabinet picker on the left (searchable, grouped, with
line-drawing glyphs), a 2D elevation and a 3D view in the middle, an inspector
on the right.

- **Arrangements**: two. *2D* is the elevation alone filling the canvas, and
  mounts no 3D at all. *Focus* is the 3D large with the elevation inset in the
  corner. 2D is the default and the fallback when WebGL is unavailable.
- **Elevation** is drawn to scale from the same part list as the 3D, so door
  and drawer divisions cannot disagree. Fronts carry the detail the project's
  door style implies (slab, shaker, raised, glass, beadboard), a handle in the
  chosen style on the opening stile of a door or centred on a drawer, and
  grain on a timber finish. A handle sits at the end of the door you reach
  for: low on a wall cabinet, high on a base one. Appliance cavities are drawn
  as the appliance, still dashed because nothing in them is supplied. All of
  that geometry lives in `draw2d.js`, which decorates rectangles the part list
  already placed and never invents or moves one. Click to select, click a drawer front
  to select that drawer, drag to move with snapping. Shows kickboard,
  benchtop, obstacles, cabinet numbers and widths, and dimension lines.
- **Dimensions.** Three chains under the drawing and one up the left, from
  `elevdim.js`. Nearest the drawing is the base run broken into links, one per
  cabinet with every gap as a link of its own; then the wall run; then the
  whole wall across the bottom. A chain reads continuously, so its links add up
  to the total by construction, and a number too wide for its link drops to a
  second row with a leader rather than overlapping its neighbour. The height
  chain carries the kick, the carcass, the benchtop, the wall cabinets and the
  ceiling, dropping the label of any line too close to another to read. All of
  it carries into the print pack, because Print renders the same component.
- **3D** shows the whole joined run for an L or U, not one wall at a time.
  Camera presets Front/Left/Right/Top/Iso, an Eye mode that stands you in the
  room at 1600mm and walks with WASD, and toggles for walls, benchtop, wall
  cabinets and appliances. Walls are drawn one-sided so the one you stand
  behind does not hide the kitchen. The range hood is built as a canopy and
  flue; the cooktop-with-oven shows its door, handle and cooktop. Clicked part
  details sit in the bottom right corner, not floating over the model.
- **Inspector**: position along the wall, width, height, depth, doors,
  drawers, shelves, microwave bay, oven cavity, blind corner settings; per
  drawer heights with a "Make equal" button and an overrun warning; a "This
  cabinet only" section for back type, drawer base fixing, board species and
  any typed thickness; a full drawer-box section (sides board and thickness,
  base board and thickness, box height, runner length, clearance, setback,
  groove, reveal); Lock width; delete; move left and right; open in 3D.
- **Appearance** pop-up holds what the kitchen looks like: the colour of the
  fronts, carcass, kickboard and benchtop as swatches, plus door style and
  handle style. Colour is real and carries to the cut list and the print pack.
  Door style and handle style are drawing settings and the panel says so: the
  part list, the nest, the drilling and the price do not move.
- **Advanced design** pop-up holds the project defaults: room shape and wall
  lengths, back type, drawer base fixing, the five board species, and all
  thickness, height, depth and gap numbers.
- **Optimise** opens a three-tab dialog. Nothing is applied until you press
  Apply on an option.
  - *Widths*: searches width combinations for the active wall that still fit,
    keeping cabinet types and count and never touching a locked cabinet. Three
    stages: enumerate only fitting combinations with depth-first pruning, rank
    them with a cheap sheet-yield proxy, then nest the survivors for real.
    Roughly a second on a full wall.
  - *Materials*: project-wide plans that consolidate the kitchen onto one or
    two boards. Each is nested and costed for real. Applying one also clears
    board overrides set on individual cabinets.
  - *Build*: back rails instead of full backs, and rounding typed thicknesses
    to sheets you actually stock. Plans that cost more are shown in their own
    section rather than hidden.

### Cabinet
One cabinet in 3D at a time. Exploded view slider, doors open/closed/removed,
a section cut on any axis with a position slider, ghost mode, camera presets,
and toggles for back, hardware, dimensions, labels and grid. A part table
beside it; hovering or clicking a row highlights the part. A drilling strip
underneath that folds away.

### Cut list
Every part in the project. Group by cabinet, by material or flat. Filter by
cabinet, material and thickness. Tick parts off as they are cut (the ticks are
stored against the stable key and shared with the Workshop view). Running
totals of board area and edge tape. Export CSV. Button through to Workshop
view. Shows a banner if any part will not fit a sheet.

### Nesting
Sheet layouts for every material.

- **The saw** panel: cutting allowance (blade width), trim off each sheet edge,
  and smallest offcut worth keeping. Change one and everything is laid out
  again. These save with the project and are used by every screen that nests,
  so nothing can disagree about the sheet count.
- One card per sheet with a to-scale drawing, waste percentage, the offcuts
  worth keeping and where they are, and a cutting sequence (trim, rip the
  strips, crosscut each strip) written in the order a table saw wants.
- The sheet behind the parts is drawn darker than the parts, so the blade width
  reads as a real gap.
- Parts that will not come off any sheet you stock are reported at the top with
  the sheet size each one would need.

### Drilling
Hole positions for every panel, drawn flat as the panel sits on the bench with
the face you drill pointing up.

- **How it goes together is edited here**, at the top of the screen: the
  carcass joint, how shelves are held up, and the back hole row. Change one and
  every drawing on the page is a different drawing, so they belong on it.
- **Pocket screws by default.** A pocket screw is drilled in one panel only,
  the one that butts into the other, so a pocket built carcass has holes in the
  bottom, the top and the rails and a side panel with nothing in it but shelf
  pins and hinge plates. Confirmats and dowels are still there and still drill
  both halves.
- The figures come from `pocket.js`: outermost pockets 50mm in from each end of
  a joint, then no more than 150mm between them (200 on a shelf), never fewer
  than two. 9.5mm bore at 15 degrees with a 3.2mm pilot. The pocket sits back
  from the end by `(thickness / 2) / tan 15`, which is 30mm on a 16mm panel, so
  it is arithmetic and not a number to look up. #8 x 32mm coarse in 16 to 19mm
  board, from a table by thickness. A board under 12mm cannot take a pocket and
  the schedule says so rather than drawing a hole nobody can drill.
- **Shelves are drilled too.** A pocket screwed shelf is a fixed shelf and
  carries its pockets in its underside, and the sides then have no pin holes
  for it. On pins it is adjustable, nothing is drilled in the shelf, and the
  32mm template in the sides is what it was.
- Drawer boxes: the box front and back carry pockets into the sides, and so
  does a recessed base once it is thick enough. The app called that base
  "pocket screwed" for a long time before it drew a single one of the pockets.
- **Filter by kind.** Sides, then tops and rails, then shelves, then doors,
  then drawer boxes, because that is the order you drill them in and when the
  jig is set for each.
- **The numbers are readable**, which is what `paneldim.js` is for. Text is
  sized off the panel, so a 100mm rail and a 2100mm door come out the same size
  on screen; a number that will not fit is not written, but every position is
  in the setting out table beside the drawing, one row per line of holes, with
  a run at an even pitch said as "12 at 32, 96 to 448" rather than as twelve
  numbers on top of each other.
- 32mm system constants, still used for shelf pins and hinges: 32mm pitch, 5mm
  pins 13mm deep, 37mm setbacks, first hole 32mm up, 35mm cups at 22.5mm,
  hinge centres 100mm from the door ends. Two holes either side of an
  adjustable shelf so it moves 64mm up or down.

### Hardware
Grouped totals for hinges, runner pairs, handles and bin runners, with the
cabinets each is used in. Edit a unit cost and the project total follows. A
"Your own hardware" section for items the model cannot know about, with name,
quantity and cost, which carry into the project total, the shopping list and
the print pack. A plain-text shopping list you can copy.

### Costing
Cabinets allocated by part area, cost per linear metre of base run, board as
actually nested, and the project total. A per-cabinet table sorted by cost. A
"quoted" field to compare against, showing the saving in dollars and percent.
Board cost per cabinet is a share by part area; the project total uses the real
nest, and the screen says so.

### Reference
Static workshop reference: the 40mm that catches people out, standard
dimensions, cabinet width increments, appliance cavities, runner length against
cabinet depth, shelf span limits, sheet sizes, edge tape, and the 32mm system.

### Workshop
Full-screen, one part at a time, built for a phone in a shed. The three numbers
you are about to set on the saw are the biggest thing on the screen and sit on
separate lines. Swipe or arrow keys to move, space or Enter to mark cut,
Escape to leave. Filter to remaining or all. Shares the tick state with the cut
list.

### Print
Real page elements at a fixed row count, so the on-screen preview matches the
paper and the page numbers are correct. Black on white regardless of anything
else. A4 or Letter. Toggle which documents to include:

- **Elevations**: one page per wall, the drawing plus a schedule of every
  cabinet with its position along the wall, and the reasons behind any cabinet
  the drawing has outlined.
- **Cut list**: 40 rows per page.
- **Sheet layouts**: one page per sheet.
- **Drilling schedule**: four panels per page, each with every hole position
  written out under its drawing.
- **Shopping list**: sheets, hardware, your own hardware, edge tape, benchtop
  and kickboard, and the project total.

### Settings
Money and stock only; cabinet sizes live on the Planner under Advanced design.
Prices for every fitting and per-metre item. A checkbox to leave the benchtop
out of the project total (its metres and price still show, they just stop being
added). Sheet stock: add, rename, resize, reprice and remove sheets. Nothing on
this screen is a drop-down.

---

## 8. Nesting engine

Shelf packing, first fit, sorted by short edge descending. **Not an optimal
nest, a guillotine-friendly one**: every cut runs the full width of the piece
it is cutting, so the sequence can actually be followed on a table saw or track
saw. An optimal nest that needs plunge cuts is no use in a shed.

- Kerf is left between every part and comes off the space available.
- Trim comes off each edge of the sheet before anything is cut, so a part
  exactly as long as the sheet can never fit.
- Parts are rotated where that fits. **Grain direction is not tracked.**
- Offcuts over the minimum are reported with where they are.
- Parts that fit no sheet are collected and reported rather than silently
  dropped, and they never create an empty sheet you get charged for.

Invariant worth testing after any change: **every part is either placed on a
sheet or reported as oversize, and no sheet is ever empty.**

---

## 9. Saving

Two separate things, not interchangeable, and the app says so:

1. **The browser store.** Automatic, debounced 700ms, survives a reload or a
   closed tab. Does not survive clearing site data, a different browser or a
   different machine.
2. **A project file.** A `.kcb.json` the user keeps wherever they keep their
   files. The real backup and the only way to move a kitchen between devices.

`hydrate()` validates everything on load and drops what it cannot trust:
unknown families, non-numeric positions, malformed overrides, locks pointing at
cabinets that no longer exist. Older files open with sensible defaults for
anything added since. Cut ticks stored as old part codes are translated to
stable keys at the moment of opening, while the codes still line up.

**Undo** keeps 60 project states, coalesced by a 500ms pause so typing a name
is one step and not one per keystroke. Ctrl or Cmd Z, Shift to redo. Opening a
project clears the history.

---

## 10. Visual design

- Design tokens as CSS custom properties in `design/tokens.css`: a warm neutral
  ramp, a steel blue accent, five type sizes, 4px spacing, and a separate set
  of `--dw-*` colours for the drawings.
- Light only. The dark palette still exists in the tokens but is not offered,
  and `data-theme="light"` is set in the HTML so a dark machine never flashes.
- Drawings are hairline strokes, monospaced numbers and restrained fills.
- 3D materials are matte and close to the real board; doors sit one value off
  the carcass so the eye separates them without an outline.
- Touch targets clear 44px on coarse pointers. The elevation claims horizontal
  movement for dragging and leaves vertical to the page.

---

## 11. Things to be careful of when changing it

- **Positions never reach the cut list, the nest, the drilling or the costing.**
  Where a cabinet stands does not change what it is made of.
- **Cut sizes are rounded to 0.1mm once, in `mkPart`.** Do not round again
  downstream and do not display raw floats; a typed thickness of 18.2 otherwise
  produces numbers like `190.60000000000002`.
- **`PRICES` is mutated in place** so pricing functions see edits at call time.
  `PRICE_SEED` is the frozen copy that Reset goes back to.
- **Anything that nests must use `nestCfg(project)`**, or screens will disagree
  about the sheet count.
- **Computing the same number two independent ways finds real bugs here.** It
  has caught a sheet count mismatch, a cabinet count mismatch, parts silently
  missing from the nest, and cut ticks pointing at the wrong parts.

---

### Every gap around a front

Five settings, not three, and all of them are on the Advanced design panel
under "Gaps around the fronts" with a drawing that names each one:

| Setting | What it is | Empty means |
| --- | --- | --- |
| `reveal` | between two fronts, up the cabinet | 3 |
| `revealBetween` | between two doors in one opening | follow `reveal` |
| `revealLeft` / `revealRight` | each end of a front to the outside of the carcass | half `reveal` |
| `revealTop` / `revealBottom` | above the top front, below the bottom one | 0 |

`reveals(cfg)` is the one function that resolves them and `frontSpan(width, cfg)`
is the one that says where a front sits across a carcass. The two side gaps
used to be `reveal / 2` written into the builder, which made the gap you look
straight at from across the room the only one you could not set.

**The invariant, tested exhaustively** in `gaps.test.js`, over every family at
every width it offers at four different reveals: across, the fronts and the
gaps between them fill the carcass; up, the rows and their gaps fill the
opening; and every drawer box is inside the carcass it runs in. That last one
is what caught the blind corner building a box wider than its own opening, and
the exhaustive version caught the preset stacks dividing up the carcass height
instead of the opening, which pushed the bottom front out through the bottom
of the cabinet whenever a top or bottom gap was set.

### Notes, appliances and the order list

- `project.notes` is sections of lines, each line tickable. Its own screen, and
  it prints with the pack.
- `project.extras` gained a `kind`: hardware, appliance or everything else, so
  the Hardware screen holds three lists. An appliance carries a note for the
  model and the size of the hole it needs, which is the thing the planner
  blocked out a cavity for.
- The order list: every derived row has a "Have" tick that takes it out of the
  total without taking it off the list, and `project.orderExtras` are lines you
  type yourself. Both save with the project.
- The benchtop is reported by volume and area as well as by the metre, from
  `pieceVolume()` and `benchVolume()` in `runs.js`. A top is priced by the
  metre and delivered by the tonne.

### The breakfast bar is a span

`{ side, depth, from, length }`. Left empty, `length` is the whole side, which
is what every project that exists has. Set, the bar runs along part of a side
and the rest of it is ordinary cabinet: the stools, the brackets and the slab
all follow the span. A partial bar is reported as its own rectangle rather than
growing the island slab, because an L is not a piece anybody can dimension.

## 12. Known gaps

Not bugs, just not built:

- Grain direction is not tracked in nesting.
- No supplier stock list or materials screen.
- Obstacles (windows, pipes) exist in the model and are drawn, but there is no
  UI to add or edit them.
- The plain `base-corner` family predates `base-blind-l` and has no corner
  geometry; it is kept so older projects still open.
- A drawer that cannot come out because something stands in front of it is not
  checked. Doors are; drawers pull straight forward and the case is rarer.
- Wall tabs number appliances as cabinets (A4 may be a dishwasher) while the
  "Cabinets" total does not count them. The label is a position in the run.
