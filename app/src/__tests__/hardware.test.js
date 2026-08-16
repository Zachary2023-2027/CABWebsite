import { describe, expect, it } from 'vitest';
import {
  NOMINAL_LENGTHS, RUNNERS, drawerBox, isLegalLength, longestFitting,
  migrateRunnerClearance, nearestLength, runnerProfile,
  boringInRange, cupCentre, hingeCentres, hingeCountFor, hingeProfile,
} from '../hardware.js';
import { FAMILIES, PROJECT, buildUnit } from '../catalog.js';

const tandem = RUNNERS['tandem-563h'];

/* The figures the specification states, written in as literals and worked out
   by hand, so a change to the code cannot quietly move them. */
describe('drawer box width, TANDEM 563H', () => {
  it('a 600mm cabinet with 16mm sides and a 16mm box', () => {
    const box = drawerBox({
      cabinetWidth: 600, carcassThk: 16, boxSideThk: 16,
      nominalLength: 500, profile: tandem,
    });

    expect(box.openingWidth).toBe(568);
    expect(box.insideWidth).toBe(526);
    expect(box.outsideWidth).toBe(558);
    expect(box.clearanceEachSide).toBe(5);
  });

  it('the deduction is to the inside, not the outside', () => {
    const box = drawerBox({
      cabinetWidth: 600, carcassThk: 16, boxSideThk: 16,
      nominalLength: 500, profile: tandem,
    });
    // The wrong reading gives 526 outside and 21mm each side. It is the
    // difference between an undermount runner reaching the box and not.
    expect(box.outsideWidth).not.toBe(526);
    expect(box.clearanceEachSide).toBeLessThan(10);
  });

  it('a thicker box side widens the box, not the drawer inside', () => {
    const thin = drawerBox({ cabinetWidth: 600, carcassThk: 16, boxSideThk: 12.7, nominalLength: 500, profile: tandem });
    const thick = drawerBox({ cabinetWidth: 600, carcassThk: 16, boxSideThk: 16, nominalLength: 500, profile: tandem });

    expect(thin.insideWidth).toBe(thick.insideWidth);
    expect(thick.outsideWidth - thin.outsideWidth).toBeCloseTo(2 * (16 - 12.7), 6);
  });

  it('563F deducts more, for a thicker drawer side', () => {
    const f = drawerBox({
      cabinetWidth: 600, carcassThk: 16, boxSideThk: 18,
      nominalLength: 500, profile: RUNNERS['tandem-563f'],
    });
    expect(f.insideWidth).toBe(568 - 49);
  });

  it('the box is as deep as the runner is long', () => {
    for (const L of NOMINAL_LENGTHS) {
      const box = drawerBox({
        cabinetWidth: 600, carcassThk: 16, boxSideThk: 16, nominalLength: L, profile: tandem,
      });
      expect(box.boxSideLength).toBe(L);
      expect(box.boxDepth).toBe(L);
    }
  });

  it('the front and back span the inside of the box', () => {
    const box = drawerBox({
      cabinetWidth: 800, carcassThk: 18, boxSideThk: 16, nominalLength: 500, profile: tandem,
    });
    expect(box.boxFrontBackLength).toBe(box.insideWidth);
    expect(box.insideWidth + 2 * 16).toBe(box.outsideWidth);
  });
});

/* The deduction is the one figure that cannot be checked from inside a
   browser, so it is typed. These assert that a measured number wins over the
   published one, and that an unset one falls back rather than deducting
   nothing. */
describe('the deduction is a value you can set', () => {
  it('a measured figure wins over the published one', () => {
    const box = drawerBox({
      cabinetWidth: 600, carcassThk: 16, boxSideThk: 16,
      nominalLength: 500, profile: tandem, deduction: 40,
    });
    expect(box.insideDeduction).toBe(40);
    expect(box.insideWidth).toBe(528);
    expect(box.outsideWidth).toBe(560);
    expect(box.clearanceEachSide).toBe(4);
  });

  it('an unset figure falls back to the profile, never to zero', () => {
    for (const unset of [null, undefined, '']) {
      const box = drawerBox({
        cabinetWidth: 600, carcassThk: 16, boxSideThk: 16,
        nominalLength: 500, profile: tandem, deduction: unset,
      });
      expect(box.insideDeduction, String(unset)).toBe(42);
      expect(box.outsideWidth, String(unset)).toBe(558);
    }
  });

  it('nonsense falls back rather than building a box the size of the cabinet', () => {
    for (const bad of ['wide', NaN, -5, {}]) {
      const box = drawerBox({
        cabinetWidth: 600, carcassThk: 16, boxSideThk: 16,
        nominalLength: 500, profile: tandem, deduction: bad,
      });
      expect(box.insideDeduction, String(bad)).toBe(42);
    }
  });

  it('zero is a legal value, because some runners deduct nothing', () => {
    const box = drawerBox({
      cabinetWidth: 600, carcassThk: 16, boxSideThk: 16,
      nominalLength: 500, profile: tandem, deduction: 0,
    });
    expect(box.insideDeduction).toBe(0);
    expect(box.insideWidth).toBe(568);
  });

  it('the built cabinet uses the typed figure, not the published one', () => {
    const u = buildUnit('T1', 'base-3drawer', { width: 600 },
      { ...PROJECT, runnerDeduction: 40 });
    const front = u.parts.find((p) => p.code.endsWith('DRWR1-FRONT'));
    expect(front.L).toBe(528);
  });

  it('the depth allowance is a value you can set', () => {
    // A 500 runner needs 525 of depth at the default allowance.
    expect(longestFitting(530, tandem, 25)).toBe(500);
    // Allow 60 and the same cabinet only takes a 450.
    expect(longestFitting(530, tandem, 60)).toBe(450);
  });
});

describe('nominal lengths', () => {
  it('only lengths that are actually sold are legal', () => {
    expect(isLegalLength(500, tandem)).toBe(true);
    expect(isLegalLength(520, tandem)).toBe(false);
    expect(isLegalLength(480, tandem)).toBe(false);
  });

  it('an odd typed length snaps to the nearest one sold', () => {
    expect(nearestLength(520, tandem)).toBe(500);
    expect(nearestLength(530, tandem)).toBe(550);
    expect(nearestLength(10, tandem)).toBe(270);
    expect(nearestLength(9999, tandem)).toBe(650);
  });

  it('the longest that fits leaves room behind it', () => {
    expect(longestFitting(540, tandem)).toBe(500);
    expect(longestFitting(400, tandem)).toBe(350);
    expect(longestFitting(100, tandem)).toBe(270);   // nothing fits, offer the shortest
  });
});

describe('migration from a bare clearance', () => {
  it('21mm each side is the TANDEM 563H deduction', () => {
    const m = migrateRunnerClearance(21);
    expect(m.profileId).toBe('tandem-563h');
    expect(m.custom).toBeNull();
  });

  it('24.5mm each side is 563F', () => {
    expect(migrateRunnerClearance(24.5).profileId).toBe('tandem-563f');
  });

  it('anything else becomes a named custom profile, flagged for confirming', () => {
    const m = migrateRunnerClearance(12.5);
    expect(m.profileId).toBe('custom-runner');
    expect(m.custom.insideDeduction).toBe(25);
    expect(m.custom.unconfirmed).toBe(true);
    expect(m.custom.name).toBe('Custom runner');
  });

  it('never silently reinterprets a missing value', () => {
    const m = migrateRunnerClearance(undefined);
    expect(m.changed).toBe(false);
  });
});

describe('the built cabinet uses the profile', () => {
  it('a 600 drawer bank matches the hand worked figures', () => {
    const u = buildUnit('T1', 'base-3drawer', { width: 600 }, PROJECT);
    const parts = u.parts.filter((p) => p.code.includes('DRWR1-'));

    const left = parts.find((p) => p.code.endsWith('SIDE-L'));
    const right = parts.find((p) => p.code.endsWith('SIDE-R'));
    const front = parts.find((p) => p.code.endsWith('FRONT'));

    const outside = (right.pos[0] + right.size[0]) - left.pos[0];
    const inside = right.pos[0] - (left.pos[0] + left.size[0]);

    expect(outside).toBe(558);
    expect(inside).toBe(526);
    expect(front.L).toBe(526);
    expect(left.L).toBe(500);
  });

  it('the box is centred in the opening', () => {
    for (const width of [400, 600, 900]) {
      const u = buildUnit('T1', 'base-3drawer', { width }, PROJECT);
      const parts = u.parts.filter((p) => p.code.includes('DRWR1-'));
      const left = parts.find((p) => p.code.endsWith('SIDE-L'));
      const right = parts.find((p) => p.code.endsWith('SIDE-R'));

      const gapLeft = left.pos[0] - PROJECT.carcassThk;
      const gapRight = (u.width - PROJECT.carcassThk) - (right.pos[0] + right.size[0]);
      expect(gapLeft, `${width}mm cabinet`).toBeCloseTo(gapRight, 6);
    }
  });

  it('never chooses a runner longer than the cabinet is deep', () => {
    for (const f of FAMILIES.filter((x) => !x.cavity)) {
      for (const depth of [300, 400, 560, 700]) {
        const u = buildUnit('T1', f.id, { depth }, PROJECT);
        const side = u.parts.find((p) => /DRWR\d+-SIDE-L$/.test(p.code));
        if (!side) continue;
        expect(side.L, `${f.id} at ${depth}mm deep`).toBeLessThanOrEqual(depth - PROJECT.boxSetback);
        expect(NOMINAL_LENGTHS, `${f.id} at ${depth}mm deep`).toContain(side.L);
      }
    }
  });

  it('the box never touches the carcass side', () => {
    for (const f of FAMILIES.filter((x) => !x.cavity)) {
      for (const width of f.widths) {
        const u = buildUnit('T1', f.id, { width }, PROJECT);
        const left = u.parts.find((p) => /DRWR\d+-SIDE-L$/.test(p.code));
        if (!left) continue;
        expect(left.pos[0], `${f.id} at ${width}`).toBeGreaterThan(PROJECT.carcassThk);
      }
    }
  });
});

describe('runnerProfile', () => {
  it('falls back rather than throwing on an unknown id', () => {
    expect(runnerProfile('nonsense').id).toBe('tandem-563h');
  });

  it('returns a custom profile when it is the one named', () => {
    const custom = { id: 'custom-runner', insideDeduction: 25, lengths: NOMINAL_LENGTHS, boxDepthFor: (n) => n };
    expect(runnerProfile('custom-runner', custom)).toBe(custom);
  });
});

/* ---------------------------------------------------------------------------
   Hinges.

   The cup centre used to be a single number, 22.5, with nothing saying where
   it came from. It is two things added: half the 35mm cup, which the cutter
   decides, and the boring distance, which you decide and which sets the
   overlay. Splitting it has to leave the default answer exactly where it was,
   because every door already drilled in an existing project was drilled to it.
   --------------------------------------------------------------------------- */
describe('the hinge cup', () => {
  it('at the default boring distance the centre is where it has always been', () => {
    expect(cupCentre(hingeProfile('clip-top-blumotion-110'), 5)).toBe(22.5);
    expect(cupCentre(hingeProfile('clip-top-blumotion-110'))).toBe(22.5);
    expect(cupCentre(hingeProfile(), PROJECT.hingeBoringDistance)).toBe(22.5);
  });

  it('boring closer to the edge moves the centre in by the same amount', () => {
    const p = hingeProfile();
    for (const b of [3, 4, 5, 6, 7]) {
      expect(cupCentre(p, b)).toBe(17.5 + b);
      expect(boringInRange(b, p)).toBe(true);
    }
    expect(boringInRange(2, p)).toBe(false);
    expect(boringInRange(8, p)).toBe(false);
  });

  it('an empty boring distance falls back to the profile, it does not read as zero', () => {
    const p = hingeProfile();
    for (const empty of [null, undefined, '']) {
      expect(cupCentre(p, empty), String(empty)).toBe(22.5);
    }
  });

  it('the cup never runs off the edge of the door', () => {
    const p = hingeProfile();
    for (const b of [p.boringMin, p.boringMax]) {
      expect(cupCentre(p, b) - p.cupDia / 2).toBeGreaterThan(0);
    }
  });
});

describe('how many hinges a door gets', () => {
  it('follows the typed thresholds', () => {
    expect(hingeCountFor(400)).toBe(2);
    expect(hingeCountFor(900)).toBe(2);
    expect(hingeCountFor(901)).toBe(3);
    expect(hingeCountFor(1600)).toBe(3);
    expect(hingeCountFor(1601)).toBe(4);
    expect(hingeCountFor(2000)).toBe(4);
    expect(hingeCountFor(2100)).toBe(5);
  });

  it('a lower threshold puts more hinges on the same door', () => {
    expect(hingeCountFor(800, { two: 600, three: 1600, four: 2000 })).toBe(3);
  });

  it('never returns fewer than two', () => {
    for (const h of [0, 1, 100, 3000]) expect(hingeCountFor(h)).toBeGreaterThanOrEqual(2);
  });
});

describe('hinge centres', () => {
  it('the outer pair sit the stated distance from the ends', () => {
    const c = hingeCentres(2000, 4, 100);
    expect(c).toHaveLength(4);
    expect(c[0]).toBe(100);
    expect(c[3]).toBe(1900);
  });

  it('the middle ones are evenly spread', () => {
    const c = hingeCentres(2000, 4, 100);
    const gaps = c.slice(1).map((y, i) => y - c[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
  });

  it('every centre is on the door', () => {
    for (const h of [400, 720, 1200, 2100]) {
      for (const y of hingeCentres(h, hingeCountFor(h), 100)) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(h);
      }
    }
  });
});

describe('a cabinet buys the hinges it drills', () => {
  it('the hinge count in the fittings matches the cups on the door', () => {
    for (const f of FAMILIES.filter((x) => !x.cavity)) {
      const u = buildUnit('T1', f.id, {}, PROJECT);
      const doors = u.parts.filter((p) => p.code.includes('DOOR'));
      const bought = (u.fittings || []).filter((x) => x.type === 'hinge')
        .reduce((a, x) => a + x.qty, 0);
      const needed = doors.reduce((a, p) => a + hingeCountFor(p.L, {
        two: PROJECT.hinge2MaxHeight, three: PROJECT.hinge3MaxHeight, four: PROJECT.hinge4MaxHeight,
      }), 0);
      expect(bought, f.id).toBe(needed);
    }
  });
});

/* The runner setting is typed as the gap you can measure with a rule: from
   the inside of the carcass to the outside of the drawer box, each side. The
   geometry still works in what the runner takes off the opening, because that
   is what the catalogue publishes, so the two readings have to agree exactly
   or the box comes out the wrong width. */
describe('the gap each side and the deduction are the same fact', () => {
  const carcassThk = 16;
  const boxSideThk = 16;

  for (const gap of [0, 3, 5, 12.5]) {
    it(`a typed gap of ${gap}mm produces exactly that gap`, () => {
      const deduction = 2 * (gap + boxSideThk);
      const box = drawerBox({
        cabinetWidth: 600, carcassThk, boxSideThk, nominalLength: 500,
        profile: tandem, deduction,
      });
      expect(box.clearanceEachSide).toBeCloseTo(gap, 6);
      expect(box.outsideWidth).toBeCloseTo(box.openingWidth - 2 * gap, 6);
      expect(box.insideWidth).toBeCloseTo(box.outsideWidth - 2 * boxSideThk, 6);
    });
  }

  it('the published figure reads back as 5mm each side', () => {
    const box = drawerBox({
      cabinetWidth: 600, carcassThk, boxSideThk, nominalLength: 500, profile: tandem,
    });
    expect(box.clearanceEachSide).toBe(5);
  });
});
