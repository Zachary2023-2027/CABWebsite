# Kitchen Cabinet Builder

An interactive kitchen cabinet configurator. Lay out a wall of cabinets, choose door
style, finish and hardware, and get a live to-scale elevation drawing with a running
price estimate you can print as a quote.

No build step, no framework, no dependencies — plain HTML, CSS, and ES modules.

## Running it

ES modules need to be served over HTTP (opening `index.html` from the filesystem will
not work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Deploying is a file copy: the whole directory is static and makes zero network requests
after load, so GitHub Pages or any static host serves it unchanged.

## What it does

- **Catalog** — 18 cabinet types across base, wall, and tall rows, plus range,
  dishwasher, and refrigerator placeholders. Palette icons are drawn with the same
  renderer as the elevation, so they always reflect the current door style and finish.
- **Layout** — cabinets are an ordered run, not fixed coordinates. Positions come from a
  single walk with independent base and wall cursors; a pantry or fridge advances both,
  so it correctly blocks the run above and below.
- **Elevation** — inline SVG whose `viewBox` is authored in inches, so it scales to any
  container and every stroke width is a real measurement. Draws toe kicks, door and
  drawer fronts, per-style panel detail, hardware, countertops, appliances, and a
  dimension line.
- **Pricing** — per-unit prices scale with width, height, door style, and finish;
  hardware is priced per pull. Countertop, installation, and tax are optional lines.
- **Warnings** — run overruns, cabinets past the ceiling, a missing sink base, an
  uncovered range, excess filler.
- **Persistence** — autosaves to `localStorage`; Export writes the layout as JSON; Print
  quote renders the drawing plus an itemised table on white.

Keyboard: `Delete` removes the selected cabinet, `←` / `→` move it along the run.

## Layout of the code

| File | Responsibility |
| --- | --- |
| `js/catalog.js` | Dimensional constants, cabinet types, styles, finishes, hardware, countertops |
| `js/state.js` | State shape, defaults, `localStorage`, mutations |
| `js/layout.js` | Two-cursor layout engine, countertop segmentation, design warnings |
| `js/pricing.js` | Pure pricing functions and the quote rollup |
| `js/preview.js` | SVG renderer — elevation scene and palette icons |
| `js/format.js` | Money, length, and percentage formatting (inch ↔ cm is display-only) |
| `js/app.js` | DOM wiring and the render loop |

`layout.js` and `pricing.js` are pure and DOM-free — they can be imported and tested
under Node directly.

Measurements are stored in inches throughout; the unit toggle only changes display.

See [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md) for the specification this was built
from, including a note on its provenance.
