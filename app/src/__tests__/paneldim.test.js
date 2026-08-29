import { describe, expect, it } from 'vitest';
import { axisValues, labelled, runText, runs, settingOut, textSize } from '../paneldim.js';
import { drillUnit } from '../drilling.js';
import { PROJECT, buildUnit } from '../catalog.js';

const POCKETS = { ...PROJECT, jointMethod: 'pocket-screw', shelfFix: 'pocket' };
const PINS = { ...PROJECT, jointMethod: 'confirmat-7x50', shelfFix: 'pins' };

describe('text sized off the panel', () => {
  /* The whole point: two panels of the same shape come out the same size on
     screen, because both drawings are scaled to fit the same box. Twice the
     panel, twice the text, and the picture does not change. */
  it('scales with the panel, so the same shape reads the same', () => {
    expect(textSize(600, 1200)).toBeCloseTo(textSize(300, 600) * 2, 6);
    expect(textSize(560, 2100) / 2100).toBeCloseTo(textSize(280, 1050) / 1050, 6);
  });

  /* A 100mm top rail is the panel this was rebuilt for. A number a thirtieth
     of its long side would be 19mm tall in a 100mm panel, which is a fifth of
     the board, so the short side caps it. */
  it('a long thin panel is capped by its short side, not its long one', () => {
    expect(textSize(568, 100)).toBe(100 / 8);
    expect(textSize(568, 100)).toBeLessThan(568 / 30);
  });

  it('a panel of ordinary proportions is sized off its long side', () => {
    expect(textSize(560, 2100)).toBe(2100 / 30);
  });

  it('has a floor, so a tiny panel still says something', () => {
    expect(textSize(20, 20)).toBe(8);
    expect(textSize(2400, 60)).toBe(8);
  });
});

describe('which positions get a number', () => {
  it('the two ends always', () => {
    const keep = labelled([0, 5, 10, 500], 100);
    expect(keep[0]).toBe(0);
    expect(keep[keep.length - 1]).toBe(500);
  });

  it('nothing is written closer together than it can be read', () => {
    const keep = labelled([0, 32, 64, 96, 128, 400], 100);
    for (let i = 1; i < keep.length; i++) {
      expect(keep[i] - keep[i - 1]).toBeGreaterThanOrEqual(100);
    }
  });

  it('a middle number is dropped rather than crowding the end one', () => {
    expect(labelled([0, 380, 400], 100)).toEqual([0, 400]);
  });

  it('one position is one number', () => {
    expect(labelled([42], 100)).toEqual([42]);
    expect(labelled([], 100)).toEqual([]);
  });
});

describe('a run of holes is one fact, not eighteen numbers', () => {
  it('an even ladder comes back as a pitch and a count', () => {
    const found = runs([96, 128, 160, 192, 224]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ from: 96, to: 224, step: 32, n: 5 });
    expect(runText(found[0])).toBe('5 at 32, 96 to 224');
  });

  it('anything that is not a run comes back on its own', () => {
    const found = runs([10, 200, 700]);
    expect(found.map((r) => r.n)).toEqual([1, 1, 1]);
    expect(runText(found[0])).toBe('10');
  });

  it('a pair is not a run, because two numbers are shorter than the sentence', () => {
    expect(runs([96, 128]).map((r) => r.n)).toEqual([1, 1]);
  });

  it('every position is accounted for, once', () => {
    const values = [50, 96, 128, 160, 192, 224, 900];
    const covered = runs(values).reduce((a, r) => a + r.n, 0);
    expect(covered).toBe(values.length);
  });
});

describe('the setting out table', () => {
  const side = drillUnit(buildUnit('A1', 'tall-pantry', { shelves: 3 }, PINS))
    .find((p) => p.code.endsWith('-SIDE-L'));

  it('is one row per line of holes, which is how a panel is drilled', () => {
    const lines = settingOut(side);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.positions.length).toBe(l.n);
      expect(l.at.length).toBeGreaterThan(0);
    }
  });

  it('carries every hole on the panel and no more', () => {
    const total = settingOut(side).reduce((a, l) => a + l.n, 0);
    const distinct = new Set(side.holes.map((h) => `${h.x}|${h.y}|${h.kind}|${h.dia}|${h.depth}`));
    expect(total).toBe(distinct.size);
  });

  it('reads in the order you would set them out, left to right', () => {
    const lines = settingOut(side);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].along).toBeGreaterThanOrEqual(lines[i - 1].along);
    }
  });

  it('names the screw against a pocket, so it can be ordered off the sheet', () => {
    const bottom = drillUnit(buildUnit('A1', 'base-2door', {}, POCKETS))
      .find((p) => p.code.endsWith('-BOT'));
    for (const l of settingOut(bottom)) expect(l.screw).toMatch(/#8/);
  });

  it('every panel in the kitchen produces a table with something in it', () => {
    for (const family of ['base-2door', 'base-3drawer', 'tall-pantry', 'tall-oven', 'base-bin']) {
      for (const cfg of [POCKETS, PINS]) {
        for (const panel of drillUnit(buildUnit('A1', family, { shelves: 1 }, cfg))) {
          expect(settingOut(panel).length, `${family} ${panel.code}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('hole positions off a panel', () => {
  it('are whole, in order and without repeats', () => {
    const holes = [{ x: 30.2, y: 10 }, { x: 30, y: 400 }, { x: 538, y: 10 }];
    expect(axisValues(holes, 'x')).toEqual([30, 538]);
    expect(axisValues(holes, 'y')).toEqual([10, 400]);
  });
});
