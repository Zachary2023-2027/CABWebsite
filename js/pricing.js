// Pricing. Pure functions over state + layout — no DOM, independently testable.

import { boxHeight, countertop, doorStyle, finish, hardware } from './catalog.js';

/** Cabinet price before hardware, with style and finish multipliers applied. */
export function unitPrice(type, item, ds, fin) {
  const w = Number(item.width) || type.defaultWidth;
  const h = boxHeight(type, item);
  const ref = type.heightRef ?? h;
  const raw =
    type.basePrice + type.perInch * w + (type.perHeightInch ?? 0) * (h - ref);
  return Math.max(0, raw) * ds.factor * fin.factor;
}

export const pullCount = (type) => (type.doors || 0) + (type.drawers || 0);

export function linePrice(type, item, ds, fin, hw) {
  const unit = unitPrice(type, item, ds, fin);
  const pulls = pullCount(type) * hw.price;
  return { unit, pulls, total: unit + pulls };
}

/**
 * Roll the whole layout up into the quote shown in the summary panel.
 * @returns {{lines: Array, cabinets, hardware, pulls, counterInches, countertop,
 *            install, subtotal, tax, total, count, baseFeet}}
 */
export function summarize(state, lay) {
  const ds = doorStyle(state.style.door);
  const fin = finish(state.style.finish);
  const hw = hardware(state.style.hardware);

  const lines = lay.placed.map((p) => {
    const price = linePrice(p.type, p.item, ds, fin, hw);
    return { ...p, ...price };
  });

  const cabinets = lines.reduce((s, l) => s + l.unit, 0);
  const hardwareCost = lines.reduce((s, l) => s + l.pulls, 0);
  const pulls = lines.reduce((s, l) => s + pullCount(l.type), 0);

  const counterInches = lay.counterSegments.reduce((s, c) => s + c.w, 0);
  const ct = countertop(state.counter.material);
  const counterCost = state.counter.enabled ? (counterInches / 12) * ct.pricePerLf : 0;

  const install = state.options.install
    ? (cabinets + counterCost) * state.options.installRate
    : 0;

  const subtotal = cabinets + hardwareCost + counterCost + install;
  const tax = subtotal * state.options.taxRate;

  return {
    lines,
    cabinets,
    hardware: hardwareCost,
    pulls,
    counterInches,
    countertop: counterCost,
    countertopName: ct.name,
    install,
    subtotal,
    tax,
    total: subtotal + tax,
    count: lines.filter((l) => !l.type.appliance).length,
    baseFeet: lay.baseRun / 12,
  };
}
