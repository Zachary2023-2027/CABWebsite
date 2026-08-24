import { describe, expect, it } from 'vitest';
import { linePrice, pullCount, summarize, unitPrice } from '../pricing.js';
import { layout } from '../layout.js';
import { TYPE_BY_ID, doorStyle, finish, hardware } from '../catalog.js';

const shaker = doorStyle('shaker');
const white = finish('white');
const bar = hardware('bar');

describe('unitPrice', () => {
  it('is base plus a rate per inch of width', () => {
    const t = TYPE_BY_ID['base-2d'];
    expect(unitPrice(t, { width: 30 }, shaker, white)).toBeCloseTo(120 + 8.5 * 30, 6);
  });

  it('charges nothing extra at the reference height', () => {
    const t = TYPE_BY_ID['wall-2d'];
    expect(unitPrice(t, { width: 30, height: 30 }, shaker, white))
      .toBeCloseTo(92 + 6.6 * 30, 6);
  });

  it('charges per inch away from the reference height', () => {
    const t = TYPE_BY_ID['wall-2d'];
    const at30 = unitPrice(t, { width: 30, height: 30 }, shaker, white);
    const at42 = unitPrice(t, { width: 30, height: 42 }, shaker, white);
    expect(at42 - at30).toBeCloseTo(2.8 * 12, 6);
  });

  it('multiplies door style and finish together', () => {
    const t = TYPE_BY_ID['base-2d'];
    const plain = unitPrice(t, { width: 30 }, shaker, white);
    const fancy = unitPrice(t, { width: 30 }, doorStyle('glass'), finish('walnut'));
    expect(fancy).toBeCloseTo(plain * 1.45 * 1.42, 6);
  });

  it('falls back to the default width when the item has none', () => {
    const t = TYPE_BY_ID['base-2d'];
    expect(unitPrice(t, {}, shaker, white)).toBeCloseTo(unitPrice(t, { width: 30 }, shaker, white), 6);
  });

  it('never returns a negative price', () => {
    const t = { basePrice: 10, perInch: 0, perHeightInch: 100, heightRef: 90, row: 'tall', defaultHeight: 90 };
    expect(unitPrice(t, { width: 10, height: 1 }, shaker, white)).toBe(0);
  });

  it('prices appliance placeholders at zero', () => {
    const t = TYPE_BY_ID['gap-range'];
    expect(unitPrice(t, { width: 30 }, shaker, white)).toBe(0);
  });
});

describe('pullCount', () => {
  it('is one per door and one per drawer', () => {
    expect(pullCount(TYPE_BY_ID['base-2d'])).toBe(4);
    expect(pullCount(TYPE_BY_ID['base-3dr'])).toBe(3);
    expect(pullCount(TYPE_BY_ID['gap-range'])).toBe(0);
  });
});

describe('linePrice', () => {
  it('adds hardware on top of the cabinet', () => {
    const t = TYPE_BY_ID['base-2d'];
    const l = linePrice(t, { width: 30 }, shaker, white, bar);
    expect(l.pulls).toBeCloseTo(4 * 8.5, 6);
    expect(l.total).toBeCloseTo(l.unit + l.pulls, 6);
  });

  it('charges no hardware for integrated pulls', () => {
    const l = linePrice(TYPE_BY_ID['base-2d'], { width: 30 }, shaker, white, hardware('none'));
    expect(l.pulls).toBe(0);
  });
});

describe('summarize', () => {
  const build = (items, over = {}) => {
    const state = {
      wall: { width: 144, height: 96 },
      style: { door: 'shaker', finish: 'white', hardware: 'bar' },
      counter: { enabled: true, material: 'quartz' },
      options: { install: true, installRate: 0.18, taxRate: 0.0825 },
      units: 'in',
      items,
      selected: null,
      ...over,
    };
    return summarize(state, layout(items, state.wall));
  };

  const sink = { uid: 'a', typeId: 'base-sink', width: 36 };
  const box = { uid: 'b', typeId: 'base-2d', width: 30 };

  it('excludes appliance gaps from the cabinet count', () => {
    const sum = build([sink, box, { uid: 'c', typeId: 'gap-range', width: 30 }]);
    expect(sum.lines).toHaveLength(3);
    expect(sum.count).toBe(2);
  });

  it('prices the countertop by the linear foot of bearing run', () => {
    const sum = build([sink, box]);
    expect(sum.counterInches).toBe(66);
    expect(sum.countertop).toBeCloseTo((66 / 12) * 120, 6);
  });

  it('drops the countertop when it is switched off', () => {
    const sum = build([sink, box], { counter: { enabled: false, material: 'quartz' } });
    expect(sum.countertop).toBe(0);
    expect(sum.counterInches).toBe(66);
  });

  it('bills installation on cabinets and counter but not hardware', () => {
    const sum = build([sink, box]);
    expect(sum.install).toBeCloseTo((sum.cabinets + sum.countertop) * 0.18, 6);
  });

  it('taxes the subtotal and totals to subtotal plus tax', () => {
    const sum = build([sink, box]);
    expect(sum.subtotal).toBeCloseTo(sum.cabinets + sum.hardware + sum.countertop + sum.install, 6);
    expect(sum.tax).toBeCloseTo(sum.subtotal * 0.0825, 6);
    expect(sum.total).toBeCloseTo(sum.subtotal + sum.tax, 6);
  });

  it('comes back all zeros on an empty wall', () => {
    const sum = build([]);
    expect(sum.total).toBe(0);
    expect(sum.count).toBe(0);
    expect(sum.lines).toEqual([]);
  });
});
