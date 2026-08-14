/* ===========================================================================
   Width optimiser.

   Exhaustive search is not on: one wall of nine cabinets is about a million
   width combinations, and re-deriving plus nesting a project takes a couple
   of milliseconds, so brute force is roughly forty minutes for one wall.

   So this is a constrained search, in three stages:
     1. Enumerate only the width combinations whose run still fits the wall.
        The fit constraint is what makes the problem small.
     2. Score those cheaply, without nesting, by how well the part widths line
        up with the sheet. Keep the best few hundred.
     3. Nest those properly and pick the winner on real sheet count.

   It optimises one wall at a time, keeps your cabinet types and count, and
   never touches a cabinet you have locked.
   =========================================================================== */

import { FAMILY, buildUnit, sheetFor } from './catalog.js';
import { nestProject } from './nesting.js';

export const OPT = {
  maxCandidates: 260,     // how many survive the cheap score and get nested
  maxEnumerate: 200000,   // hard stop on the enumeration itself
  tolerance: 40,          // how far under the wall length a run may finish
};

/** Parts for one wall only, so a wall can be scored on its own. */
function wallParts(wall, widths, cfg) {
  const out = [];
  let n = 0, f = 0;
  for (const [i, item] of wall.units.entries()) {
    const fam = FAMILY[item.familyId];
    if (!fam) continue;
    const isFiller = fam.kind === 'filler';
    if (isFiller) f += 1; else n += 1;
    const id = isFiller ? `${wall.id}F${f}` : `${wall.id}${n}`;
    const unit = buildUnit(id, item.familyId, { ...item.settings, width: widths[i] }, cfg);
    for (const p of unit.parts) out.push(p);
  }
  return out;
}

/** Run length of each row for a given set of widths. */
function runs(wall, widths) {
  let base = 0, wallRun = 0;
  for (const [i, item] of wall.units.entries()) {
    const fam = FAMILY[item.familyId];
    if (!fam) continue;
    const w = widths[i];
    if (fam.kind === 'tall') { const x = Math.max(base, wallRun); base = wallRun = x + w; }
    else if (fam.kind === 'wall') wallRun += w;
    else base += w;
  }
  return { base, wallRun };
}

/**
 * Cheap proxy for yield: how much of the sheet width each part wastes when
 * laid across it. Good enough to rank candidates before paying for a nest.
 */
function shelfScore(parts) {
  let waste = 0;
  for (const p of parts) {
    const sheet = sheetFor(p.material);
    if (!sheet) continue;
    const usable = sheet.size[0] - 20;
    const long = Math.max(p.L, p.W);
    if (long <= 0 || long > usable) { waste += 1; continue; }
    const perRow = Math.floor(usable / long);
    waste += perRow > 0 ? (usable - perRow * long) / usable : 1;
  }
  return waste;
}

/**
 * @param {object} wall
 * @param {object} cfg project config
 * @param {Set<string>} locked uids that must keep their current width
 * @returns {{best:Array, current:object, considered:number}}
 */
export function optimiseWall(wall, cfg, locked = new Set()) {
  const items = wall.units;
  const current = items.map((it) => Number(it.settings?.width ?? FAMILY[it.familyId]?.def?.width ?? 600));

  const choices = items.map((it, i) => {
    const fam = FAMILY[it.familyId];
    if (!fam) return [current[i]];
    if (locked.has(it.uid)) return [current[i]];
    // Fillers absorb the remainder, so let them take any of their sizes.
    return fam.widths.slice();
  });

  const target = wall.length;
  const combos = [];
  let considered = 0;
  let stopped = false;

  /* Depth first with pruning: abandon a branch as soon as the base run or the
     wall run has already passed the wall length. That is what keeps a million
     combinations down to something searchable. */
  const pick = new Array(items.length);
  (function walk(i) {
    if (stopped) return;
    if (considered > OPT.maxEnumerate) { stopped = true; return; }
    if (i === items.length) {
      considered += 1;
      const r = runs(wall, pick);
      const fits = r.base <= target + 0.5 && r.wallRun <= target + 0.5;
      const tight = target - Math.max(r.base, r.wallRun) <= OPT.tolerance;
      if (fits && tight) combos.push({ widths: pick.slice(), leftover: target - r.base });
      return;
    }
    // partial run check, so hopeless branches die early
    const partial = runs({ ...wall, units: items.slice(0, i) }, pick.slice(0, i));
    if (partial.base > target + 0.5 || partial.wallRun > target + 0.5) return;

    for (const w of choices[i]) {
      pick[i] = w;
      walk(i + 1);
      if (stopped) return;
    }
  })(0);

  /* The dialog always shows what you have now, so build it before the early
     return. Without this a wall with nothing to try handed the dialog a
     current with no sheet count in it. */
  const nowNest = nestProject(wallParts(wall, current, cfg));
  const now = {
    widths: current, sheets: nowNest.sheets, wastePct: nowNest.wastePct,
    cost: nowNest.cost, leftover: target - runs(wall, current).base,
  };

  if (!combos.length) {
    return { best: [], current: now, considered, stopped, fitting: 0 };
  }

  // Stage two: cheap score, keep the best handful.
  const ranked = combos
    .map((c) => ({ ...c, score: shelfScore(wallParts(wall, c.widths, cfg)) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, OPT.maxCandidates);

  // Stage three: real nest on the survivors.
  const scored = ranked.map((c) => {
    const nest = nestProject(wallParts(wall, c.widths, cfg));
    return {
      widths: c.widths, leftover: c.leftover,
      sheets: nest.sheets, wastePct: nest.wastePct, cost: nest.cost,
    };
  }).sort((a, b) => a.sheets - b.sheets || a.wastePct - b.wastePct || a.leftover - b.leftover);

  // Only offer options that actually beat what is there.
  const best = scored.filter((c) =>
    c.sheets < now.sheets || (c.sheets === now.sheets && c.wastePct < now.wastePct - 0.05))
    .slice(0, 5);

  return { best, current: now, considered, stopped, fitting: combos.length };
}
