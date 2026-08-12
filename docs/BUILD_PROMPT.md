# Build Prompt — Kitchen Cabinet Builder

> **Provenance note.** The source design (`Kitchen Cabinet Builder.dc.html` in Claude
> Design project `6ac2271e-f28c-498a-9602-27fa1c299b36`, plus the `support.js` it imports)
> could not be read from this environment — `DesignSync` requires an interactive
> `/design-login`, which Claude Code on the web cannot run, and the design URL returns
> HTTP 403 to unauthenticated fetches. This prompt is therefore a **reconstructed
> specification** for a kitchen cabinet builder, not a transcription of that file.
> Anything below marked _(assumption)_ should be checked against the real design once
> its contents are available.

---

## 1. The prompt

Build a **Kitchen Cabinet Builder** — a single-page web app where a homeowner or
kitchen designer lays out a wall of cabinets, chooses door style / finish / hardware,
sees a live to-scale elevation drawing of the result, and gets a running price estimate
they can export as a quote.

Ship it as a **dependency-free static site**: plain HTML, CSS, and ES modules. No build
step, no framework, no CDN requests. It must run from any static file server and deploy
to GitHub Pages unchanged. Target modern evergreen browsers only.

Everything below is a requirement unless explicitly marked optional.

---

## 2. Domain model and units

All internal measurements are **inches**, stored as numbers. Display units are a
user-facing toggle (inches ↔ centimetres); conversion is display-only and never mutates
stored state.

Use these North American cabinet constants:

| Constant | Value | Meaning |
| --- | --- | --- |
| `TOE_KICK` | 4.5″ | Recessed kick under base and tall cabinets |
| `BASE_BOX_H` | 34.5″ | Top of base cabinet box (before countertop) |
| `COUNTER_T` | 1.5″ | Countertop slab thickness → finished counter at 36″ |
| `BASE_DEPTH` | 24″ | Base and tall cabinet depth |
| `WALL_DEPTH` | 12″ | Wall cabinet depth |
| `WALL_MOUNT_AFF` | 54″ | Height above finished floor of wall cabinet **bottoms** (18″ backsplash) |
| `REVEAL` | 0.125″ | Gap between adjacent door/drawer fronts |

### 2.1 Application state

One serializable state object, the single source of truth:

```js
{
  wall:     { width: 144, height: 96 },          // inches
  style:    { door: 'shaker', finish: 'white', hardware: 'bar' },
  counter:  { enabled: true, material: 'quartz' },
  options:  { install: true, installRate: 0.18, taxRate: 0.0825 },
  units:    'in',                                 // 'in' | 'cm'
  items:    [ { uid, typeId, width, height } ],   // ordered left → right
  selected: null                                  // uid | null
}
```

`items` is an **ordered sequence**, not a set of absolute coordinates — position is
derived by the layout engine (§4). Every item carries only its own type and dimensions.

---

## 3. Catalog

Define the catalog as data in its own module so it can be extended without touching
render or pricing logic.

### 3.1 Cabinet types

Each type: `{ id, name, row, widths[], defaultWidth, heights[]?, defaultHeight?, doors,
drawers, fronts, basePrice, perInch, perHeightInch?, heightRef? }`.

`row` is `'base' | 'wall' | 'tall'`. `fronts` selects the front-elevation treatment:
`'doors' | 'drawers' | 'topDrawer' | 'sink' | 'pantry' | 'oven' | 'open' | 'appliance'`.

**Base row** (sit on floor, 34.5″ box):
- Base 1 Door / 1 Drawer — widths 9, 12, 15, 18, 21
- Base 2 Door / 2 Drawer — widths 24, 27, 30, 33, 36
- 3-Drawer Base — widths 15–36
- 4-Drawer Base — widths 15–36
- Sink Base — widths 30, 33, 36, 42 (false drawer front above two doors)
- Lazy Susan Corner Base — fixed 36″
- Filler Strip — widths 1, 2, 3

**Wall row** (bottom at 54″ AFF, 12″ deep):
- Wall 1 Door — widths 9–21, heights 30, 36, 42
- Wall 2 Door — widths 24–36, heights 30, 36, 42
- Bridge / Over-Range — widths 30, 36, heights 12, 18
- Open Shelf Unit — widths 24–36 (no fronts; draw shelves)
- Diagonal Wall Corner — fixed 24″
- Wall Filler — widths 1, 2, 3

**Tall row** (floor to ceiling, consume both base and wall run):
- Pantry — widths 18–36, heights 84, 90, 96
- Oven Cabinet — widths 30, 33, height 90 (drawer, oven cutout, door above)

**Appliance placeholders** (priced at zero, drawn as dashed outlines with a schematic
appliance, never as cabinetry):
- Range Gap — base row, widths 30, 36
- Dishwasher Gap — base row, width 24
- Refrigerator Gap — tall row, width 36, height 84

### 3.2 Door styles

`{ id, name, factor, panel }` — Shaker (1.00, recessed), Flat Slab (0.88, none),
Raised Panel (1.22, raised), Glass Front (1.45, glass), Beadboard (1.12, bead).

### 3.3 Finishes

`{ id, name, factor, door, edge, detail, grain }` — the three colours drive the SVG
renderer directly. Painted White (1.00), Greige (1.00), Sage (1.04), Navy (1.06),
Charcoal (1.06), Natural Oak (1.18, grain), Walnut (1.42, grain), Cherry (1.30, grain).

### 3.4 Hardware

`{ id, name, price }` per pull — Integrated / none ($0), Round Knob ($6), Bar Pull ($8.50),
Cup Pull ($11), Edge Pull ($14).

### 3.5 Countertops

`{ id, name, pricePerLf, color }` — Laminate ($35), Butcher Block ($65), Granite ($95),
Quartz ($120), Marble ($160).

---

## 4. Layout engine

Given `items` in order, compute each item's `x` offset by walking the list once with two
independent cursors, `baseX` and `wallX`:

- `row === 'base'` → `x = baseX`; then `baseX += width`
- `row === 'wall'` → `x = wallX`; then `wallX += width`
- `row === 'tall'` → `x = max(baseX, wallX)`; then **both** cursors `= x + width`

Total run = `max(baseX, wallX)`. This yields correct-looking elevations — wall cabinets
float independently of the base run, and a pantry or fridge correctly blocks both.

Vertical placement: base fronts span 4.5″→34.5″; wall cabinets span 54″→(54 + height);
tall cabinets span 4.5″→height. Convert to SVG coordinates with `y = wallHeight - h`.

**Countertop segments**: merge runs of *adjacent* base-row items that are not appliance
gaps and not fillers into contiguous segments; draw one slab per segment from 34.5″ to
36″. A range gap therefore visibly breaks the counter, which is correct.

---

## 5. Pricing engine

Pure functions over state — no DOM access, independently testable.

```
raw   = basePrice + perInch × width + (perHeightInch ?? 0) × (height − (heightRef ?? height))
unit  = raw × doorStyle.factor × finish.factor
pulls = (doors + drawers) × hardware.price
line  = unit + pulls
```

Roll up to a summary:

- **Cabinets** — Σ `unit`
- **Hardware** — Σ `pulls`, with total pull count shown
- **Countertop** — (Σ countertop segment inches ÷ 12) × `pricePerLf`, only when enabled
- **Installation** — `installRate` × (cabinets + countertop), only when enabled
- **Subtotal**, **Tax** (`taxRate` × subtotal), **Total**

Also surface: cabinet count, total linear feet of base run, and per-item line price in
the item list. Currency formatted with `Intl.NumberFormat` (USD).

---

## 6. The elevation renderer

The centrepiece. Render an **inline SVG** whose `viewBox` is expressed directly in
inches — e.g. `viewBox="-12 -10 {wallW+24} {wallH+30}"` with
`preserveAspectRatio="xMidYMid meet"` — so the whole drawing scales to its container for
free and all stroke widths and font sizes are authored in real-world inches.

Draw, back to front:

1. Wall plane, floor line, hatched floor strip, dashed ceiling line.
2. Toe kicks — recessed 3″, darker fill — under every base and tall unit.
3. Cabinet boxes and their **fronts**, laid out per the type's `fronts` treatment:
   - `doors` — split width evenly across `doors`, inset by `REVEAL`
   - `drawers` — stack `drawers` evenly over the box height
   - `topDrawer` — one 6″ drawer at top, doors filling the remainder
   - `sink` — 6″ false front at top, two doors below
   - `pantry` — if height > 60″, split into a lower and an upper pair of doors
   - `oven` — bottom drawer, dark oven cutout with handle and window, door above
   - `open` — box outline plus two or three shelf lines, no fronts
   - `appliance` — dashed outline plus a schematic (range: cooktop line, four burner
     circles, oven door with handle; dishwasher: control strip and handle; fridge:
     split door line and handles)
4. Door-style detail per front: recessed rail-and-stile rectangle (Shaker), bevelled
   inner panel (Raised), mullioned translucent pane (Glass), vertical bead lines
   (Beadboard), nothing (Slab). Wood finishes get a few low-opacity grain strokes.
5. Hardware on every door and drawer, matching the chosen type (bar, knob, cup, edge).
6. Countertop slabs in the countertop material's colour.
7. Dimension line beneath the base run with the total width labelled in current units.
8. Selection highlight — an accent outline on the selected item, plus a subtle dim on
   everything else.

Factor the per-unit drawing into a reusable function so the **catalog palette can render
a miniature of each cabinet type** using the identical code path at small scale. The
palette icons must therefore always reflect the currently chosen door style and finish.

---

## 7. Interface

Three-pane desktop layout; stacks vertically under 900px.

**Header** — product name, wall-size presets (8ft / 10ft / 12ft / 14ft run), unit toggle,
theme toggle, Reset, Export JSON, Print Quote.

**Left — Catalog.** Cabinet types grouped by row (Base / Wall / Tall / Appliances), each
a clickable card with live miniature, name, and default width. Clicking appends to the
run; the new item becomes selected.

**Centre — Preview.** The SVG elevation, wall width and ceiling height inputs, and a
**warnings strip** (§8). Clicking a cabinet in the drawing selects it.

**Right — Configure.** Door style, finish, hardware, and countertop pickers (finish
swatches show actual colour). Then the **item list**: one row per item in run order with
name, width select, height select (only when the type offers more than one), reorder
up/down, duplicate, delete, and line price. The selected row is highlighted and scrolls
into view. Below it, the **price summary** table from §5.

**Interactions**
- Click to select in either the drawing or the list; the two stay in sync.
- `Delete` / `Backspace` removes the selected item; `←` / `→` reorder it.
- Every mutation re-derives layout, pricing, and drawing from state — no partial DOM patching.

---

## 8. Validation and warnings

Non-blocking, always visible when triggered:

- Base run exceeds wall width by _n_ (and the same for the wall run)
- A wall cabinet's top exceeds the ceiling height
- A tall cabinet exceeds the ceiling height
- No sink base in the layout
- A range gap exists with no bridge cabinet above it
- Fillers total more than 6″ (suggests a sizing problem)

---

## 9. Persistence and export

- Autosave state to `localStorage` under a versioned key (`kcb.state.v1`); restore on
  load, falling back to a **sensible starter kitchen** so the app is never empty on first
  visit.
- Reset restores that starter layout, after a confirm.
- Export JSON downloads the state object as a `.json` file.
- Print Quote uses a `@media print` stylesheet: the elevation drawing plus an itemised
  quote table on white, no chrome, no sidebars.

---

## 10. Presentation

- Light and dark themes via CSS custom properties: a full palette on bare `:root`, dark
  overrides under both `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`,
  so the toggle wins in both directions. Never define a colour only inside a media block.
- The SVG's wall, floor, and dimension colours come from the same tokens; the drawing
  must be legible in both themes. Cabinet finish colours stay literal in both.
- Respect `prefers-reduced-motion`.

---

## 11. Accessibility

- All controls are real, labelled form elements reachable by keyboard.
- Catalog cards are `<button>`s.
- The SVG has `role="img"` and an `<title>` summarising the layout; it is decorative
  relative to the item list, which is the accessible source of truth.
- Warnings live in an `aria-live="polite"` region.
- Visible focus rings throughout; contrast meets WCAG AA in both themes.

---

## 12. File structure

```
index.html
assets/styles.css
js/catalog.js     — types, styles, finishes, hardware, countertops, constants
js/state.js       — state shape, defaults, localStorage, mutations
js/layout.js      — the two-cursor layout engine, countertop segmentation
js/pricing.js     — pure pricing functions and the summary rollup
js/preview.js     — SVG scene + reusable per-unit and palette-icon renderers
js/format.js      — money / length / percentage display formatting
js/app.js         — DOM wiring, event handling, render loop
README.md         — what it is, how to run it locally
```

_(assumption)_ The original design imports a shared `support.js`; if that module is
recovered, fold its helpers in rather than duplicating them.

---

## 13. Acceptance criteria

1. Adding a cabinet updates the drawing, the item list, and the total in one pass.
2. Changing door style or finish restyles both the elevation **and** every palette icon.
3. A pantry placed mid-run pushes both the base and the wall rows past it.
4. A range gap breaks the countertop into two slabs.
5. Overflowing the wall width raises a warning but never throws or clips the drawing.
6. Reloading the page restores the exact prior layout.
7. Print Quote produces a clean one-page quote with the drawing and itemised pricing.
8. The app runs from `python3 -m http.server` with zero network requests after load.
9. No console errors, no external dependencies, no build step.
