import { describe, expect, it } from 'vitest';
import { cutOrder, partLabel, sameNext, settingRuns } from '../workshop.js';
import { allParts, starterProject } from '../project.js';

const parts = allParts(starterProject());

/* Cutting is set up bound, not cut bound. Moving the fence takes far longer
   than the cut, so the order you are handed parts in decides the job. */
describe('the order you cut in', () => {
  const ordered = cutOrder(parts);

  it('keeps every part, and only those parts', () => {
    expect(ordered).toHaveLength(parts.length);
    expect(new Set(ordered.map((p) => p.key)).size).toBe(parts.length);
  });

  it('never mixes two materials up', () => {
    const seen = new Set();
    let last = null;
    for (const p of ordered) {
      if (p.material !== last) {
        expect(seen.has(p.material), `${p.material} comes back later`).toBe(false);
        seen.add(p.material);
        last = p.material;
      }
    }
  });

  it('puts parts of the same width together', () => {
    const runs = settingRuns(ordered);
    const byHand = new Set(ordered.map((p) => `${p.material}|${p.T}|${p.W}`));
    // One run per distinct setting: nothing is split and revisited.
    expect(runs.length).toBe(byHand.size);
  });

  it('cuts the big pieces first inside a setting, while the sheet is whole', () => {
    for (const run of settingRuns(cutOrder(parts))) {
      const lengths = run.parts.map((p) => p.L);
      expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    }
  });

  it('is fewer settings than doing it in cabinet order', () => {
    const asDrawn = settingRuns(parts).length;
    const asCut = settingRuns(cutOrder(parts)).length;
    expect(asCut).toBeLessThan(asDrawn);
  });
});

describe('how many more at this setting', () => {
  const ordered = cutOrder(parts);

  it('counts forwards only, because what is behind you is done', () => {
    const at = ordered.findIndex((p, i) => sameNext(ordered, i).count > 0);
    expect(at).toBeGreaterThanOrEqual(0);

    const run = sameNext(ordered, at);
    for (const p of run.parts) {
      expect(p.W).toBeCloseTo(ordered[at].W, 4);
      expect(p.material).toBe(ordered[at].material);
    }
  });

  it('the last part of a run has nothing after it', () => {
    const runs = settingRuns(ordered);
    let index = 0;
    for (const run of runs) {
      index += run.parts.length;
      expect(sameNext(ordered, index - 1).count).toBe(0);
    }
  });

  it('the first of a run of n has n minus one after it', () => {
    const runs = settingRuns(ordered);
    let index = 0;
    for (const run of runs) {
      expect(sameNext(ordered, index).count).toBe(run.parts.length - 1);
      index += run.parts.length;
    }
  });

  it('an index off the end is nothing, not a crash', () => {
    expect(sameNext(ordered, 9999)).toEqual({ count: 0, parts: [] });
    expect(sameNext([], 0).count).toBe(0);
  });

  /* A tenth of a millimetre is a different fence setting, and pretending
     otherwise cuts a part wrong. */
  it('does not treat a different width as the same setting', () => {
    const list = [
      { W: 500, T: 16, L: 800, material: 'x' },
      { W: 500.5, T: 16, L: 700, material: 'x' },
    ];
    expect(sameNext(list, 0).count).toBe(0);
  });

  it('does treat float noise as the same setting', () => {
    const list = [
      { W: 500, T: 16, L: 800, material: 'x' },
      { W: 500.00000001, T: 16, L: 700, material: 'x' },
    ];
    expect(sameNext(list, 0).count).toBe(1);
  });
});

describe('a label says what the panel is', () => {
  it('carries everything you need before it is in a cabinet', () => {
    for (const p of parts) {
      const l = partLabel(p);
      expect(l.code).toBe(p.code);
      expect(l.size).toMatch(/^[\d.]+ x [\d.]+$/);
      expect(l.material.length).toBeGreaterThan(0);
      expect(l.edging.length).toBeGreaterThan(0);
      expect(Number.isFinite(l.thickness)).toBe(true);
    }
  });

  it('says None rather than nothing when there is no edging', () => {
    expect(partLabel({ L: 1, W: 1, T: 1, code: 'x', name: 'x', material: 'm' }).edging)
      .toBe('None');
  });
});
