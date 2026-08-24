# Paste this into the Blender connected Claude session

Everything below is self contained. It does not reference any other file.

---

You are building assets for a web based kitchen cabinet design viewer. The
viewer runs in three.js in a browser, with no server and no network request
after load, so every asset is inlined into the bundle as base64. That single
fact sets the budget for everything you are about to build, and the budget is
not negotiable.

This is a pilot. Two assets. Build them exactly to this specification, deliver
them in the form described, and stop. Do not build anything else, and do not
build a cabinet: the viewer generates all cabinetry procedurally from typed
millimetre dimensions and a Blender mesh would break that.

Ask me before you start if anything here is ambiguous. It is cheaper to answer
a question now than to rebuild an asset later.

## The rules, which apply to both assets

**Units.** Work in millimetres. Scene unit system Metric, unit scale 0.001,
length unit Millimeters. Every number below is millimetres. The export must
land so that one glTF unit equals one millimetre. Confirm this against a known
dimension after exporting.

**Axes.** The viewer is Y up: x runs along the wall, y runs up from the floor,
z runs out into the room. Blender is Z up and the glTF exporter converts. Apply
all transforms before exporting so nothing carries a residual rotation or a
non unit scale.

**Origins.** The origin is functional, not decorative. The viewer positions
objects by it and rotates some of them about it. Anything that hinges must
have its origin on its rotation axis and must be a separately named object.

**Naming.** Object names are read programmatically and must be exact,
kebab-case, and named for what the part is rather than what it looks like.
Anything the viewer will rotate takes a `-pivot` suffix. Material names are
`mat-` plus the family, and the families that already exist are: steel,
brushed, chrome, darkSteel, enamel, black, glassDark, ceramic, rubber, copper,
pvc, brass, timber, stone, plaster, tile, fabric. Do not invent a new family
without saying so explicitly in your notes, because the viewer has to be
taught it.

**Topology.** Triangles and quads, no n-gons, triangulate on export. No
interior geometry: if it cannot be seen, delete it.

**Bevels are the most important rule here.** Every hard edge gets one. An
unbevelled 90 degree edge catches no highlight and is the single loudest
signal that something is computer generated. Two segments at 0.3 mm on small
items. Follow with a weighted normal modifier so the bevel shades cleanly.
Shade smooth with an autosmooth angle around 30 degrees.

**UVs.** Unwrapped, non overlapping, inside 0 to 1, and scaled consistently in
world space across the asset so a tiling detail map sits at the same physical
size everywhere on it.

**Materials.** Principled BSDF only, flat values, no node networks, no
textures attached to the mesh. Set base colour, roughness and metalness to
physically sensible values, because those numbers get read out of the file and
used directly. Four materials maximum per asset, since each one is a draw
call and this has to run on a phone.

**Export.** glTF 2.0 Binary (.glb). +Y Up on. Apply Modifiers on. UVs on,
Normals on, Tangents off, Vertex Colors off. Materials: Export. Draco
compression on, with position quantisation 14, normal 10, texture coordinate
12, generic 12. Animation off entirely, the viewer animates things itself. No
cameras, no lights, no empties beyond the named root.

## Deliverable format, for each asset

Four things. **The script is the real deliverable**, more than the mesh,
because it means a variant can be regenerated without another session and the
exact dimensions and pivots can be read out of the source instead of guessed
from the geometry.

1. `<asset-name>.py`, a standalone Blender Python script that builds the asset
   from named numeric constants declared at the top of the file, and exports
   the .glb. Every dimension in this brief should appear as one of those
   constants.
2. `<asset-name>.glb`, Draco compressed, inside the size budget.
3. A JSON manifest entry in exactly this shape:

```json
{
  "id": "tap-mixer-gooseneck",
  "kind": "tapware",
  "name": "Gooseneck mixer",
  "file": "tap-mixer-gooseneck.glb",
  "bytes": 0,
  "triangles": 0,
  "bounds": { "x": 0, "y": 0, "z": 0 },
  "origin": "base-plate-centre-bottom",
  "mount": "benchtop",
  "materials": ["chrome", "brushed"],
  "moving": [
    { "object": "tap-lever-pivot", "type": "rotate",
      "axis": [1, 0, 0], "at": [0, 300, 0], "range": [0, 35] }
  ]
}
```

4. Delivery notes: final triangle count, final file size in bytes, the
   bounding box in millimetres, every named object and what it is for, every
   material used, and anything you had to compromise to stay inside budget.
   If something could not be done within the budget, say so rather than going
   over it.

---

## Asset 1: `tap-mixer-gooseneck`

A single lever gooseneck kitchen mixer, deck mounted through the benchtop,
chrome. The common Australian kitchen tap. Not a pull out spray, not a wall
mounted set, not a three piece tap set.

This asset exists because the viewer currently draws a tap as three cylinders,
and a tap is nothing but curve and reflection, so it renders as a grey stick
standing on the bench. It is also the first thing a client's eye finds,
because it is the shiniest object in the room.

**Dimensions**, millimetres:

| Feature | Value |
| --- | --- |
| Overall height, bench surface to top of arc | 320 |
| Spout outlet height above bench | 250 |
| Spout reach, body centre to outlet centre | 210 |
| Body diameter | 45 |
| Base plate diameter | 55 |
| Base plate height | 8, with a soft crown, not a flat disc |
| Spout tube diameter | 28, tapering to 24 at the outlet |
| Gooseneck arc radius | 95 |
| Lever length | 90 |
| Lever pivot height above bench | 300 |

**Objects:**

- `tap-base-plate`, the escutcheon sitting on the bench
- `tap-body`, the vertical column
- `tap-spout`, the gooseneck arc and outlet as one continuous swept tube
- `tap-aerator`, the outlet fitting at the tip, a slightly wider ring
- `tap-lever-pivot`, the handle, origin on its rotation axis, which is
  horizontal and passes through the body at 300 mm above the bench

**Materials:** `mat-chrome` everywhere except `tap-aerator`, which is
`mat-brushed` so the tip reads as a separate part rather than as more of the
same shine.

**Origin:** centre of the base plate at its lowest point, which is bench
surface level. Placing this asset at bench height with no offset must sit it
correctly on the bench.

**Budget:** 6,000 triangles, 60 KB binary after Draco. Spend the triangles on
the gooseneck arc and on the fillet where the spout leaves the body, because
that transition is what makes a tap look cast rather than assembled from pipe.
24 sides on the tubes, since this is seen from 400 mm away.

**The thing that will make or break it:** the continuity of the spout sweep.
If the arc has a visible facet, or a shading break where the radius changes,
the reflection will crawl across it as the camera orbits and it will look
worse than the three cylinders it replaced. Get the sweep clean and the
shading continuous before you add any other detail.

---

## Asset 2: `surface-detail-set`

Not a mesh. Four small tileable greyscale maps that every material in the
kitchen will share and tint at runtime.

The reasoning matters, so that you build them correctly. The app already holds
colour separately from surface: it has a finish system with a hex colour per
role, so a texture must never carry colour. What flat materials are missing is
not colour, it is **variation in how the highlight breaks up across a
surface**. That is roughness. One greyscale channel does it, and one map can
then serve every colour in the app instead of needing one map per colour.
This is what makes it fit in the budget.

**Every map must be:**

- Greyscale, single channel, 8 bit PNG.
- Seamlessly tileable. Verify by tiling four by four and looking both for the
  seam and for any feature distinctive enough to be noticed repeating.
- **Centred on mid grey, value 128.** These are multiplied against a base
  roughness at runtime, so 128 must mean no change. A map whose average is
  brighter or darker than mid grey will shift every surface using it.
- **Low contrast.** The temptation is to make these readable on their own.
  Resist it. Real melamine varies by a couple of percent, not by fifty.

| Map | Size | What it is | Physical tile size |
| --- | --- | --- | --- |
| `detail-board.png` | 512 | The pressed micro texture of melamine faced board. Very fine, slightly directional, like a shallow orange peel. | 200 mm |
| `detail-grain.png` | 512 | Open straight timber grain, readable as oak. It gets tinted per species at runtime, so it must not be specific to one species in its own value range. | 400 mm along the grain |
| `detail-plaster.png` | 256 | Painted plasterboard tooth. Barely there. Its whole job is to stop a wall reading as a flat card. | 300 mm |
| `detail-brushed.png` | 256 | Directional brush streaks for stainless steel. Strongly anisotropic, running in one axis. | 60 mm |

**Budget:** 200 KB combined, measured as base64. If a map cannot hit that,
halve its resolution before you reduce its quality, because these tile at a
small physical size and detail is cheaper to lose than tileability is.

**Also deliver, as numbers rather than as an image**, a parameter set for
stone benchtop veining, so the viewer can generate it in a shader. Veining is
a large scale feature and a tiling image would repeat visibly across a three
metre bench, which is why this one cannot be a texture. For each of three
stones, a white engineered stone with fine grey veins, a warm speckled stone,
and a dark stone with one bold vein, give:

- base colour and vein colour, as hex
- vein density, in veins per metre
- vein width in millimetres, and how much it varies
- vein angle in degrees off the long axis, and its variation
- speckle density, speckle size in millimetres, and speckle contrast
- the surface roughness of the polished face

---

## Before you build

Tell me what you need confirmed. In particular: whether 320 mm is a sensible
overall height for this tap or whether it should match a specific real
product, and whether chrome is the right default finish or whether matte black
or brushed brass would be more useful first.

Then build asset 1, deliver it, and wait. Do not start asset 2 until asset 1
has been checked in the viewer, because if the scale, axis or origin
convention is wrong it is wrong for everything and it is better to find that
out once.
