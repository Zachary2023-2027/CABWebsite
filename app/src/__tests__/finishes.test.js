import { describe, expect, it } from 'vitest';
import {
  FINISHES, FINISH_LIST, clearFinishes, finish, finishFor, finishFromName, finishKey,
  contrast, inkOn, isDark, isTwoTone, luminance, roleOf, twoTone,
} from '../finishes.js';
import { PROJECT, buildUnit, FAMILIES } from '../catalog.js';
import { allParts, starterProject } from '../project.js';

describe('the finish list itself', () => {
  it('every finish is a real colour with a real surface', () => {
    for (const f of FINISH_LIST) {
      expect(f.hex, f.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(f.roughness, f.id).toBeGreaterThan(0);
      expect(f.roughness, f.id).toBeLessThanOrEqual(1);
      expect(f.metalness, f.id).toBeGreaterThanOrEqual(0);
      expect(f.name.length, f.id).toBeGreaterThan(0);
    }
  });

  it('an unknown id falls back rather than throwing', () => {
    expect(finish('nonsense').id).toBe('white');
    expect(finish(undefined).id).toBe('white');
  });
});

/* You type your board species as free text, so the name is read for something
   recognisable. Typing "Charcoal melamine" should give a charcoal kitchen
   without setting the colour separately as well. */
describe('guessing a finish from a board name', () => {
  const cases = [
    ['White melamine', 'white'],
    ['Charcoal melamine', 'charcoal'],
    ['Navy 2pac', 'navy'],
    ['Birch ply', 'birch'],
    ['Hoop pine ply', 'pine'],
    ['American walnut veneer', 'walnut'],
    ['European oak', 'oak'],
    ['HMR MDF', 'mdf'],
    ['Structural ply', 'birch'],
    ['Matt black laminate', 'black'],
  ];

  for (const [name, expected] of cases) {
    it(`${name} reads as ${expected}`, () => {
      expect(finishFromName(name)).toBe(expected);
    });
  }

  it('something unrecognisable does not crash or come back empty', () => {
    for (const odd of ['', null, undefined, 'Zorblax 9000', 42]) {
      expect(FINISHES[finishFromName(odd)]).toBeTruthy();
    }
  });

  /* Walnut before oak, charcoal before white. A name containing two hints has
     to resolve the same way every time, or a board changes colour depending
     on nothing. */
  it('is deterministic when a name could match twice', () => {
    for (let i = 0; i < 5; i++) {
      expect(finishFromName('White oak')).toBe(finishFromName('White oak'));
    }
    expect(finishFromName('White oak')).toBe('oak');
  });
});

describe('a role resolves to a finish', () => {
  it('a finish you set beats the guess', () => {
    const P = { carcassBoard: 'White melamine', carcassFinish: 'navy' };
    expect(finishFor('carcass', P).id).toBe('navy');
  });

  it('with nothing set it follows the board name', () => {
    expect(finishFor('front', { frontBoard: 'Charcoal melamine' }).id).toBe('charcoal');
  });

  /* A kickboard with no board of its own is cut from carcass board, so it
     should be carcass coloured rather than defaulting to white beside a navy
     kitchen. */
  it('a role with no board of its own follows what it is cut from', () => {
    const P = { carcassBoard: 'Navy 2pac', kickBoard: '' };
    expect(finishFor('kick', P).id).toBe('navy');
    expect(finishFor('panel', { frontBoard: 'Walnut veneer' }).id).toBe('walnut');
  });

  it('an empty config still resolves to something drawable', () => {
    for (const role of ['carcass', 'front', 'back', 'box', 'kick', 'panel']) {
      expect(finishFor(role, {}).hex, role).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('two tone', () => {
  it('is exactly the fronts differing from the carcass', () => {
    expect(isTwoTone({ carcassBoard: 'White melamine', frontBoard: 'White melamine' })).toBe(false);
    expect(isTwoTone({ carcassBoard: 'White melamine', frontBoard: 'Navy 2pac' })).toBe(true);
  });

  it('the helper changes the fronts and nothing else', () => {
    const patch = twoTone('navy');
    expect(patch).toEqual({ [finishKey('front')]: 'navy' });
    expect(isTwoTone({ ...PROJECT, ...patch })).toBe(true);
  });

  it('can set both sides at once', () => {
    const patch = twoTone('navy', 'oak');
    expect(isTwoTone({ ...PROJECT, ...patch })).toBe(true);
    expect(finishFor('carcass', { ...PROJECT, ...patch }).id).toBe('oak');
  });

  it('clearing puts every role back to the board names', () => {
    const P = { ...PROJECT, ...twoTone('navy', 'oak'), ...clearFinishes() };
    expect(isTwoTone(P)).toBe(false);
    expect(finishFor('carcass', P).id).toBe(finishFromName(PROJECT.carcassBoard));
  });
});

describe('a label on a swatch can be read', () => {
  it('dark finishes take light ink and light ones take dark', () => {
    expect(inkOn(FINISHES.navy.hex)).toBe('#FFFFFF');
    expect(inkOn(FINISHES.black.hex)).toBe('#FFFFFF');
    expect(inkOn(FINISHES.white.hex)).toBe('#232323');
    expect(inkOn(FINISHES.birch.hex)).toBe('#232323');
  });

  /* A threshold on luminance looks right until a mid tone lands just the
     wrong side of it. Sage fell under a 0.45 cut off, so it took white ink,
     and white on sage is 2.9 to 1: not readable. Measuring both and picking
     the winner is the only honest way to choose. */
  it('every finish gets ink that actually contrasts with it', () => {
    for (const f of FINISH_LIST) {
      // 4.5 to 1 is the readable-text threshold.
      expect(contrast(f.hex, inkOn(f.hex)), `${f.name} on ${inkOn(f.hex)}`)
        .toBeGreaterThan(4.5);
    }
  });

  it('picks whichever ink is better, not whichever side of a line it is on', () => {
    for (const f of FINISH_LIST) {
      const chosen = inkOn(f.hex);
      const other = chosen === '#FFFFFF' ? '#232323' : '#FFFFFF';
      expect(contrast(f.hex, chosen), f.name)
        .toBeGreaterThanOrEqual(contrast(f.hex, other));
    }
  });

  it('luminance survives junk', () => {
    for (const junk of ['', 'red', null, '#GGG']) {
      expect(Number.isFinite(luminance(junk))).toBe(true);
    }
  });

  it('isDark agrees with the ink it picks', () => {
    for (const f of FINISH_LIST) {
      expect(isDark(f.hex)).toBe(inkOn(f.hex) === '#FFFFFF');
    }
  });
});

describe('every part carries a finish', () => {
  it('every part of every preset has one', () => {
    for (const f of FAMILIES.filter((x) => !x.cavity)) {
      for (const p of buildUnit('T1', f.id, {}, PROJECT).parts) {
        expect(p.finish, `${p.code}`).toBeTruthy();
        expect(FINISHES[p.finish], `${p.code} has finish ${p.finish}`).toBeTruthy();
      }
    }
  });

  it('including the parts that belong to a run, not a cabinet', () => {
    for (const p of allParts(starterProject())) {
      expect(FINISHES[p.finish], `${p.code}`).toBeTruthy();
    }
  });

  it('a front and a carcass part disagree in a two tone kitchen', () => {
    const project = starterProject();
    project.cfg = { ...project.cfg, ...twoTone('navy') };
    const parts = allParts(project);

    const front = parts.find((p) => p.group === 'front');
    const carcass = parts.find((p) => p.group === 'carcass');
    expect(front.finish).toBe('navy');
    expect(carcass.finish).not.toBe('navy');
  });

  it('changing a finish changes nothing about the geometry', () => {
    const plain = starterProject();
    const toned = starterProject();
    toned.cfg = { ...toned.cfg, ...twoTone('navy', 'walnut') };

    const sizes = (p) => allParts(p).map((x) => `${x.code} ${x.L}x${x.W}x${x.T}`);
    expect(sizes(toned)).toEqual(sizes(plain));
  });
});

describe('roles are read off the group a part was built in', () => {
  it('maps every group the builder produces', () => {
    const groups = new Set(allParts(starterProject()).map((p) => p.group));
    for (const group of groups) {
      const role = roleOf({ group });
      expect(typeof role, group).toBe('string');
      expect(role.length, group).toBeGreaterThan(0);
    }
  });
});
