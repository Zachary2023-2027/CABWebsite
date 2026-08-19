import { describe, expect, it } from 'vitest';
import {
  CLEARANCE_DEFAULTS, byLevel, facingGap, runChecks, summarise, wallFace, walkways,
} from '../checks.js';
import {
  allParts, layoutFor, nestCfg, roomLayout, roomOffsets, starterProject,
  unitWarnings, wallWarnings,
} from '../project.js';
import { nestProject } from '../nesting.js';
import { PROJECT } from '../catalog.js';

const DEPS = {
  roomLayout, layoutFor, roomOffsets, allParts, nestProject, nestCfg,
  unitWarnings, wallWarnings,
};

const shaped = (room) => {
  const p = starterProject();
  p.room = room;
  return p;
};

describe('the figures are settings, not assertions', () => {
  it('every clearance has a default and every default is a real number', () => {
    for (const [k, v] of Object.entries(CLEARANCE_DEFAULTS)) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThan(0);
    }
  });

  it('every one of them is in PROJECT, so a project carries its own', () => {
    for (const k of Object.keys(CLEARANCE_DEFAULTS)) {
      expect(PROJECT[k], k).toBe(CLEARANCE_DEFAULTS[k]);
    }
  });

  /* The whole point of typing them: the drawing is measured against your
     number, not against one this app decided on your behalf. */
  it('changing a figure changes what is reported', () => {
    const p = starterProject();
    const strict = { ...p, cfg: { ...p.cfg, hoodAboveCooktop: 2000 } };
    const loose = { ...p, cfg: { ...p.cfg, hoodAboveCooktop: 1 } };

    const cooktopFindings = (project) =>
      runChecks(project, DEPS).filter((f) => f.rule === 'cooktop');

    expect(cooktopFindings(strict).length).toBeGreaterThan(cooktopFindings(loose).length);
  });
});

/* Two runs face each other when they are parallel and alongside each other.
   An index based test, where walls next to each other in the list are assumed
   to share a corner, gets a U exactly wrong: both return walls attach to the
   back wall, so it keeps the pair that shares a corner and throws away the
   pair that actually faces across the room. */
describe('walkways', () => {
  it('a straight kitchen has no walkway to measure', () => {
    expect(walkways(shaped('straight'), roomLayout(shaped('straight')))).toHaveLength(0);
  });

  it('an L has no two runs facing each other', () => {
    const p = shaped('l');
    expect(walkways(p, roomLayout(p))).toHaveLength(0);
  });

  it('a U measures the two return walls against each other', () => {
    const p = shaped('u');
    const paths = walkways(p, roomLayout(p));

    expect(paths).toHaveLength(1);
    expect(paths[0].between.sort()).toEqual(['Wall B', 'Wall C']);
    expect(paths[0].gap).toBeGreaterThan(0);
    expect(paths[0].overlap).toBeGreaterThan(0);
  });

  it('the gap is the room less what each run takes out of it', () => {
    const p = shaped('u');
    const [path] = walkways(p, roomLayout(p));
    const back = p.walls.find((w) => w.name === 'Wall A');

    // Both returns are baseDepth deep, standing at each end of the back wall.
    expect(path.gap).toBeCloseTo(back.length - 2 * p.cfg.baseDepth, 0);
  });

  it('a deeper run leaves less walkway', () => {
    const p = shaped('u');
    const before = walkways(p, roomLayout(p))[0].gap;
    p.cfg = { ...p.cfg, baseDepth: 700 };
    const after = walkways(p, roomLayout(p))[0].gap;
    expect(after).toBeLessThan(before);
  });
});

describe('facing', () => {
  const line = (ax, az, bx, bz) => ({ name: 'x', a: [ax, az], b: [bx, bz] });

  it('two parallel runs alongside each other face', () => {
    const f = facingGap(line(0, 0, 3000, 0), line(0, 1500, 3000, 1500));
    expect(f.gap).toBe(1500);
    expect(f.overlap).toBe(3000);
  });

  it('two runs at right angles do not', () => {
    expect(facingGap(line(0, 0, 3000, 0), line(0, 0, 0, 3000))).toBeNull();
  });

  it('two parallel runs at opposite ends of a room do not', () => {
    expect(facingGap(line(0, 0, 1000, 0), line(5000, 1500, 6000, 1500))).toBeNull();
  });

  it('runs that only partly overlap report the part that does', () => {
    const f = facingGap(line(0, 0, 3000, 0), line(2000, 1200, 5000, 1200));
    expect(f.gap).toBe(1200);
    expect(f.overlap).toBe(1000);
  });

  it('a run of no length does not crash the test', () => {
    expect(facingGap(line(0, 0, 0, 0), line(0, 1500, 3000, 1500))).toBeNull();
  });
});

describe('a wall face is where the cabinets actually are', () => {
  it('the back wall faces into the room by its depth', () => {
    const p = shaped('u');
    const [back] = roomLayout(p);
    const face = wallFace(back, 560);
    expect(face.a).toEqual([0, 560]);
    expect(face.b[0]).toBeCloseTo(back.wall.length, 6);
  });

  it('a turned wall is turned', () => {
    const p = shaped('u');
    const entries = roomLayout(p);
    const face = wallFace(entries[1], 560);
    // Wall B runs away from the back wall, so its face is a vertical line.
    expect(Math.abs(face.b[0] - face.a[0])).toBeLessThan(1);
    expect(Math.abs(face.b[1] - face.a[1])).toBeGreaterThan(100);
  });
});

describe('everything the app knew, gathered in one place', () => {
  const project = starterProject();
  const findings = runChecks(project, DEPS);

  it('finds something in a kitchen that has something wrong with it', () => {
    expect(findings.length).toBeGreaterThan(0);
  });

  it('every finding says how much it matters, what rule it is, and what it is about', () => {
    for (const f of findings) {
      expect(['error', 'warn', 'note'], f.text).toContain(f.level);
      expect(f.rule.length, f.text).toBeGreaterThan(0);
      expect(f.text.length).toBeGreaterThan(0);
    }
  });

  it('carries a cabinet warning through with the cabinet it belongs to', () => {
    const cab = findings.find((f) => f.rule === 'cabinet');
    expect(cab).toBeTruthy();
    expect(cab.where).toBeTruthy();
  });

  /* wallWarnings already says how much each one matters. Flattening them all
     to warnings would report a corner offset, which is information, as though
     it were something wrong. */
  it('a wall warning keeps the level the wall gave it', () => {
    const p = shaped('u');
    const offsets = roomOffsets(p);
    const raw = p.walls.flatMap((w) => wallWarnings(layoutFor(p, w, offsets), p));
    const carried = runChecks(p, DEPS).filter((f) => f.rule === 'wall');

    expect(carried).toHaveLength(raw.length);
    for (const w of raw) {
      const match = carried.find((f) => f.text === w.text);
      expect(match, w.text).toBeTruthy();
      expect(match.level, w.text).toBe(w.level);
    }
  });

  it('a wall that carries a corner offset reports it as a note, not a problem', () => {
    const p = shaped('l');
    /* Put a blind corner at the end of the first wall, which is what gives the
       next wall an offset to start clear of. */
    const wallA = p.walls[0];
    wallA.units = [{ uid: 'c1', familyId: 'base-blind-l', settings: { width: 1050 } }];

    const notes = runChecks(p, DEPS)
      .filter((f) => f.rule === 'wall' && /corner cabinet on the wall before/i.test(f.text));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.level).toBe('note');
  });

  it('reports a part that cannot be cut from any sheet you stock', () => {
    const p = starterProject();
    p.cfg = { ...p.cfg, baseDepth: 3000 };
    const over = runChecks(p, DEPS).filter((f) => f.rule === 'oversize');
    expect(over.length).toBeGreaterThan(0);
    expect(over[0].level).toBe('error');
  });

  it('summarises by the worst thing in it', () => {
    expect(summarise([{ level: 'note' }, { level: 'error' }]).level).toBe('error');
    expect(summarise([{ level: 'note' }, { level: 'warn' }]).level).toBe('warn');
    expect(summarise([{ level: 'note' }]).level).toBe('ok');
    expect(summarise([]).text).toBe('Nothing to fix');
  });

  it('groups without losing anything', () => {
    const g = byLevel(findings);
    expect(g.error.length + g.warn.length + g.note.length).toBe(findings.length);
  });

  it('an empty kitchen produces no errors about cabinets', () => {
    const p = starterProject();
    for (const w of p.walls) w.units = [];
    const f = runChecks(p, DEPS);
    expect(f.filter((x) => x.rule === 'cabinet')).toHaveLength(0);
  });
});
