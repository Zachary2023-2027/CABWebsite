import { describe, expect, it } from 'vitest';
import {
  NOMINAL_LENGTHS, RUNNERS, drawerBox, isLegalLength, longestFitting,
  migrateRunnerClearance, nearestLength, runnerProfile,
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
