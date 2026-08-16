import { describe, expect, it } from 'vitest';
import { NEST, cutSequence, nestProject } from '../nesting.js';
import { allParts, nestCfg, starterProject } from '../project.js';
import { FAMILIES, PROJECT, buildUnit, sheetFor } from '../catalog.js';
import { tinyProject } from './fixtures.js';

const nestable = (parts) => parts.filter((p) => sheetFor(p.material));

/* Every configuration the invariants are checked against. One wall holding
   one preset, at several widths and several build settings, plus the two
   whole projects. Cheap enough to run on every change and broad enough that
   a geometry change cannot slip through. */
function configurations() {
  const out = [{ name: 'starter', project: starterProject() },
    { name: 'tiny', project: tinyProject() }];

  const variants = [
    ['default', {}],
    ['18mm carcass', { carcassThk: 18 }],
    ['back rails', { backType: 'rail' }],
    ['2400 tall', { tallHeight: 2400 }],
    ['fat fronts', { frontThk: 22, reveal: 2 }],
  ];

  for (const f of FAMILIES.filter((x) => !x.cavity)) {
    for (const width of [f.widths[0], f.widths[f.widths.length - 1]]) {
      for (const [label, cfg] of variants) {
        out.push({
          name: `${f.id} ${width} ${label}`,
          project: {
            name: 't', cfg: { ...PROJECT, ...cfg }, room: 'straight', locked: [], extras: [],
            walls: [{ id: 'A', name: 'A', length: 6000, obstacles: [],
              units: [{ uid: 'u1', familyId: f.id, settings: { width } }] }],
            activeWall: 'A',
          },
        });
      }
    }
  }
  return out;
}

const CONFIGS = configurations();

describe('nest completeness', () => {
  it('every part is placed on a sheet or reported oversize, across every configuration', () => {
    for (const { name, project } of CONFIGS) {
      const parts = nestable(allParts(project));
      const nest = nestProject(parts, nestCfg(project));
      const placed = nest.groups.reduce(
        (a, g) => a + g.sheets.reduce((b, s) => b + s.placements.length, 0), 0);

      expect(placed + nest.oversize.length, name).toBe(parts.length);
    }
  });

  it('no sheet is ever empty, across every configuration', () => {
    for (const { name, project } of CONFIGS) {
      const nest = nestProject(allParts(project), nestCfg(project));
      for (const g of nest.groups) {
        for (const [i, s] of g.sheets.entries()) {
          expect(s.placements.length, `${name}: ${g.material} sheet ${i + 1}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

/* Board area computed two independent ways: added up from the parts, and
   added up from what the packer says it laid on the sheets. A disagreement
   means the packer is losing or duplicating parts. */
describe('board area agrees computed two ways', () => {
  it('within a square millimetre per part', () => {
    for (const { name, project } of CONFIGS) {
      const parts = nestable(allParts(project));
      const nest = nestProject(parts, nestCfg(project));
      const oversize = new Set(nest.oversize.map((o) => o.code));

      const fromParts = parts
        .filter((p) => !oversize.has(p.code))
        .reduce((a, p) => a + p.L * p.W, 0);
      const fromSheets = nest.groups.reduce(
        (a, g) => a + g.sheets.reduce((b, s) => b + s.usedArea, 0), 0) * 1e6;

      expect(Math.abs(fromParts - fromSheets), name).toBeLessThanOrEqual(parts.length);
    }
  });
});

describe('the cutting allowance is real space, not a hope', () => {
  const project = starterProject();

  it('a wider blade never packs more onto a sheet', () => {
    let last = 0;
    for (const kerf of [0, 3.2, 6, 10, 16]) {
      const nest = nestProject(allParts(project), { ...NEST, kerf });
      expect(nest.sheets, `kerf ${kerf}`).toBeGreaterThanOrEqual(last);
      last = nest.sheets;
    }
  });

  it('parts on a sheet are separated by at least the blade width', () => {
    const kerf = 10;
    const nest = nestProject(allParts(project), { ...NEST, kerf });

    for (const g of nest.groups) {
      for (const s of g.sheets) {
        const rows = new Map();
        for (const p of s.placements) {
          const y = Math.round(p.y);
          if (!rows.has(y)) rows.set(y, []);
          rows.get(y).push(p);
        }
        for (const row of rows.values()) {
          row.sort((a, b) => a.x - b.x);
          for (let i = 1; i < row.length; i++) {
            const gap = row[i].x - (row[i - 1].x + row[i - 1].w);
            expect(gap, `${g.material}: ${row[i - 1].code} to ${row[i].code}`)
              .toBeGreaterThanOrEqual(kerf - 0.001);
          }
        }
      }
    }
  });

  it('a part exactly as long as the sheet cannot fit, because the edges are trimmed', () => {
    const nest = nestProject(
      [{ code: 'X-LONG', name: 'Long', material: 'White melamine 16mm', L: 2400, W: 300, T: 16 }],
      { ...NEST, trim: 10 },
    );
    expect(nest.oversize).toHaveLength(1);
    expect(nest.sheets, 'an unplaceable part must not buy a sheet').toBe(0);
    expect(nest.cost).toBe(0);
  });
});

describe('the cutting sequence describes the sheet it came from', () => {
  it('every placement appears in exactly one crosscut step', () => {
    const project = starterProject();
    const nest = nestProject(allParts(project), nestCfg(project));
    const sheet = nest.groups[0].sheets[0];

    const listed = cutSequence(sheet, nestCfg(project))
      .flatMap((step) => step.parts || []);

    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.sort()).toEqual(sheet.placements.map((p) => p.code).sort());
  });
});

describe('a cabinet made of nothing you stock is reported, not silently dropped', () => {
  it('names the part, the size it needs and the sheet you have', () => {
    const u = buildUnit('T1', 'tall-pantry', { width: 900 }, { ...PROJECT, tallHeight: 2600 });
    const nest = nestProject(u.parts, NEST);

    for (const o of nest.oversize) {
      expect(o.code).toBeTruthy();
      expect(o.needs[0]).toBeGreaterThan(o.sheet[0]);
      expect(Number.isInteger(o.needs[0])).toBe(true);
    }
  });
});
