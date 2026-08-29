# Kitchen Cabinet Builder

Design a kitchen, then build it. Lay out a run of frameless cabinets, watch it draw
itself to scale and stand up in 3D, and walk away with a cut list, sheet layouts, a
drilling schedule, a hardware list and what the whole thing costs.

Live at <https://zachary2023-2027.github.io/CABWebsite/>.

## What is in here

| Path | What it is |
| --- | --- |
| `index.html` | The front page. Says what the site does and links into the app. Static: `assets/home.css`, `js/home.js`, and the typefaces already in `design/fonts`. |
| `app/` | The planner, and the only application on the site. Vite, React, three.js. Documented in [`docs/CONTEXT.md`](docs/CONTEXT.md). |
| `design/` | Design tokens and the component reference pages. |
| `docs/` | The context document and the original build prompt. |

There used to be a second, simpler estimator at the site root. It has been removed: its
drawing style now lives in the planner's elevation, and the planner is the only way in.

## Running it

The front page is static, so any file server will do:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

The planner is a Vite app:

```sh
cd app
npm install
npm run dev     # development server
npm test        # the full suite
npm run build   # production build into app/dist
```

Deploying is a build plus a file copy, done by `.github/workflows/deploy.yml` on push.
Nothing on the site makes a network request after load.

## The front page

Same warm neutral ramp, oiled hardwood and eucalyptus accent as `design/tokens.css`, so
it looks like the same workshop as the app. Its motion is CSS scroll-driven animation
behind `@supports`, with an `IntersectionObserver` fallback in `js/home.js` for browsers
that do not have it. Content is visible in the markup and the page reads with JavaScript
off.

## The planner

Eleven screens over one project: Planner, Cabinet, Checks, Reference, Cut list, Nesting,
Drilling, Hardware, Workshop, Costing, Order list, Print and Settings. Everything reads
one part list, so the drawing, the nest, the holes and the price cannot disagree.

The elevation is dimensioned: every cabinet, every gap and the whole wall, in chains
that add up. Clearances are measured across the whole room rather than one wall at a
time, so a door that will not open past the cabinet on the next wall is found before
anything is cut. Carcasses are pocket screwed by default, and the drilling schedule
draws every pocket and lists every position.

All dimensions are millimetres and all money is AUD. Projects autosave to the browser
and export as a `.kcb.json` file. There is no server and no account.

See [`docs/CONTEXT.md`](docs/CONTEXT.md) for a full description of the model, the
screens and the invariants, and [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md) for the
specification the original estimator was built from, including a note on its provenance.
