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
/                     older single-page vanilla-JS viewer, still served at the site root
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
| `drilling.js` | 32mm system hole positions per panel |
| `optimise.js` | Width search per wall, and project-wide material and build plans |
| `storage.js` | localStorage, snapshots, validation on load, file import and export |
| `cabinet.js` | Helpers for the single-cabinet viewer: bounds, `cutSize`, `fmt` |

**Screens (React):** `App.jsx` (shell, rail, top strip, undo, start screen),
`Planner.jsx`, `Elevation.jsx`, `Kitchen3D.jsx`, `Viewer.jsx`, `Advanced.jsx`,
`Fields.jsx`, `Screen.jsx`, `CutList.jsx`, `Nesting.jsx`, `Drilling.jsx`,
`Hardware.jsx`, `Costing.jsx`, `Settings.jsx`, `Reference.jsx`,
`Workshop.jsx`, `Print.jsx`, `app.css`.

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
| Build | `backType 'full' \| 'rail'`, `backRailHeight 120`, `boxBaseFix 'dado' \| 'screwed'` |
| Drawers | `runnerLength 500`, `runnerClearance 21`, `boxHeight 140`, `boxSetback 20`, `baseGroove 10` |
| Gaps | `reveal 3`, `shelfSetback 20`, `blindClearance 50` |
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

**Base:** `base-1door`, `base-2door`, `base-3drawer`, `base-4drawer`,
`base-sink` (false front over two doors), `base-corner` (plain blind corner),
`base-blind-l` (blind corner for an L, see below), `base-micro` (open microwave
bay over a drawer), `base-bin` (one door on a bin runner).

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
picks which end runs into the corner. The unit exposes `cornerReturn` (its own
depth), which is how far along the next wall the run has to start.

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

**Room shapes.** `straight` (one wall), `l` (two), `u` (three). The joined
walls are taken in order from the wall list, excluding the island. An L turns
at the right hand end of the first wall and runs toward the viewer; a U comes
back down the other side. Those are the only rotations that leave the doors
facing into the room. Each wall after the first inherits a `startOffset` equal
to the `cornerReturn` of the corner cabinet on the wall before it.

**Wrapping.** Adding a cabinet that will not fit on the current wall puts it on
the next wall in the run and follows it there. Dragging one off the end does
the same; dragging it back before the start returns it.

**Warnings** are computed per cabinet (`unitWarnings`) and per wall
(`wallWarnings`) and are drawn on the cabinet itself: past the end of the wall,
overlaps another cabinet, shelf span over 800mm, drawer over 900mm, filler over
100mm, doors over 1000mm, blind panel too narrow, door opening under 300mm,
runs into an obstacle, gaps in the run with their position, a wall that turns a
corner with no corner cabinet, a corner cabinet that is not last.

---

## 7. Screens

Eleven screens, chosen from a left rail. A persistent top strip shows the
project name (editable), save state, cabinets, doors, drawers, sheets and the
estimated cost, plus Undo/Redo, Export file and Projects.

### Planner
The main screen. A cabinet picker on the left (searchable, grouped, with
line-drawing glyphs), a 2D elevation and a 3D view in the middle, an inspector
on the right.

- **Arrangements**: Split (elevation and 3D side by side), Drawer (elevation
  with the 3D in a collapsible tray), Focus (3D large with the elevation
  inset).
- **Elevation** is drawn to scale from the same part list as the 3D, so door
  and drawer divisions cannot disagree. Click to select, click a drawer front
  to select that drawer, drag to move with snapping. Shows kickboard,
  benchtop, obstacles, cabinet numbers and widths, and dimension lines.
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
32mm system hole positions, drawn flat as the panel sits on the bench.

- Opens on every cabinet at once, with each card labelled by its cabinet.
- The picker says how many panels each cabinet has, or that it has nothing to
  drill.
- **The template is for shelves.** A drawer bank carries its load on the
  runners and a filler is a strip of board, so neither has holes. Doors are
  drilled for their hinges and appear with their cabinet. Landing on a cabinet
  with nothing says why and offers a way back.
- Constants: 32mm pitch, 5mm shelf pins 13mm deep, 37mm front and back
  setbacks, first hole 32mm up, 35mm hinge cups 12.5mm deep at 22.5mm setback,
  hinge centres 100mm from the door ends, 8mm construction holes. Two holes
  either side of each shelf so it moves 64mm up or down.

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
- **Drilling schedule**: four panels per page.
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

## 12. Known gaps

Not bugs, just not built:

- Grain direction is not tracked in nesting.
- No supplier stock list or materials screen.
- Obstacles (windows, pipes) exist in the model and are drawn, but there is no
  UI to add or edit them.
- The plain `base-corner` family predates `base-blind-l` and has no corner
  geometry; it is kept so older projects still open.
- Wall tabs number appliances as cabinets (A4 may be a dishwasher) while the
  "Cabinets" total does not count them. The label is a position in the run.
