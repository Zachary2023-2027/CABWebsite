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

import { FAMILY, PRICES, boardNames, buildUnit, sheetFor } from './catalog.js';
import { nestProject } from './nesting.js';
import { allParts, nestCfg } from './project.js';

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
  const saw = nestCfg({ cfg });
  const nowNest = nestProject(wallParts(wall, current, cfg), saw);
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
    const nest = nestProject(wallParts(wall, c.widths, cfg), saw);
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

/* ===========================================================================
   Project wide optimising.

   Widths are one lever and not the biggest one. What a sheet actually costs
   you is decided by how many different boards you are buying, whether the
   thickness you typed is a thickness anybody stocks, and whether you are
   putting a full sheet of MDF behind every cabinet when a rail would do.

   Each option below is a real change to the project, costed by nesting the
   whole thing again. Nothing is applied until you press Apply.
   =========================================================================== */

const BOARD_ROLES = [
  ['carcassBoard', 'carcass'],
  ['frontBoard', 'fronts'],
  ['backBoard', 'backs'],
  ['boxBoard', 'drawer box sides'],
  ['boxBaseBoard', 'drawer box bases'],
];

const THK_FOR = {
  carcassBoard: 'carcassThk',
  frontBoard: 'frontThk',
  backBoard: 'backThk',
  boxBoard: 'boxSideThk',
  boxBaseBoard: 'boxBaseThk',
};

/** Nest and cost a project as if cfg were patched. */
function score(project, patch, stripOverrides) {
  const next = {
    ...project,
    cfg: { ...project.cfg, ...patch },
    walls: stripOverrides
      ? project.walls.map((w) => ({
        ...w,
        units: w.units.map((u) => {
          const cfg = u.settings?.cfg;
          if (!cfg) return u;
          const kept = { ...cfg };
          for (const [k] of BOARD_ROLES) delete kept[k];
          return { ...u, settings: { ...u.settings, cfg: kept } };
        }),
      }))
      : project.walls,
  };
  const nest = nestProject(allParts(next), nestCfg(next));
  return { sheets: nest.sheets, cost: nest.cost, wastePct: nest.wastePct, groups: nest.groups };
}

/** Board area actually used, by species, so ranking is by what you buy. */
function boardUse(project) {
  const use = new Map();
  for (const p of allParts(project)) {
    const base = String(p.material).replace(/\s[\d.]+mm$/, '').trim();
    use.set(base, (use.get(base) || 0) + (p.L * p.W) / 1e6);
  }
  return [...use.entries()].sort((a, b) => b[1] - a[1]).map(([name, m2]) => ({ name, m2 }));
}

/** The thicknesses actually stocked for a board, from your sheet list. */
function stockedThicknesses(board) {
  const out = [];
  for (const k of Object.keys(PRICES.sheets)) {
    const m = k.match(/^(.*)\s([\d.]+)mm$/);
    if (m && m[1].trim() === board) out.push(parseFloat(m[2]));
  }
  return out.sort((a, b) => a - b);
}

const nearest = (list, v) =>
  list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);

/**
 * Every project wide option worth offering, each one costed for real.
 * @returns {{current, materials: [], build: [], use: []}}
 */
export function optimiseProject(project) {
  const cfg = project.cfg;
  const current = score(project, {}, false);
  const use = boardUse(project);
  const known = new Set(boardNames());

  const offer = (o) => {
    const s = score(project, o.patch, !!o.strip);
    return { ...o, ...s, saving: current.cost - s.cost, sheetsSaved: current.sheets - s.sheets };
  };

  /* --- materials: fewer boards, less offcut stranded in a species you only
     used twice. Consolidating is not automatically cheaper, because the board
     you consolidate onto might cost twice as much a sheet, so every plan is
     nested and costed and only the ones that win are offered. */
  const materials = [];
  const roles = BOARD_ROLES.map(([k]) => k);
  const roleValue = (k) => cfg[k] || (k === 'boxBaseBoard' ? cfg.boxBoard : '');
  const distinct = new Set(roles.map(roleValue).filter(Boolean));

  for (const b of use.slice(0, 3).map((u) => u.name)) {
    if (!known.has(b) && !use.some((u) => u.name === b)) continue;
    const patch = Object.fromEntries(roles.map((k) => [k, b]));
    if (roles.every((k) => roleValue(k) === b)) continue;
    materials.push(offer({
      id: `one-${b}`,
      title: `Everything in ${b}`,
      detail: `One board for the whole kitchen. Changes the ${
        BOARD_ROLES.filter(([k]) => roleValue(k) !== b).map(([, n]) => n).join(', ')}.`,
      patch, strip: true,
    }));
  }

  if (use.length >= 2 && distinct.size > 2) {
    const [a, b] = [use[0].name, use[1].name];
    materials.push(offer({
      id: 'two-carcass-front',
      title: `${a} for the boxes, ${b} for the fronts`,
      detail: 'Two boards. Carcass, backs and drawer boxes on one, doors and drawer fronts on the other.',
      patch: { carcassBoard: a, backBoard: a, boxBoard: a, boxBaseBoard: a, frontBoard: b },
      strip: true,
    }));
    materials.push(offer({
      id: 'two-visible-hidden',
      title: `${a} where it shows, ${b} where it does not`,
      detail: 'Two boards. Carcass and fronts on one, backs and drawer boxes on the other.',
      patch: { carcassBoard: a, frontBoard: a, backBoard: b, boxBoard: b, boxBaseBoard: b },
      strip: true,
    }));
  }

  /* --- build: the two changes that move the most board without touching a
     single cabinet size. */
  const build = [];

  if ((cfg.backType || 'full') !== 'rail') {
    build.push(offer({
      id: 'back-rail',
      title: 'Back rails instead of full backs',
      detail: 'A rail braces the carcass and takes a fraction of the board. You lose the dust seal, so it suits base cabinets more than wall cabinets.',
      patch: { backType: 'rail' },
    }));
  }

  /* A thickness nobody stocks is bought as the nearest sheet with the cost
     scaled, which is a guess. Snapping to a real sheet makes the price the
     price. */
  const snap = {};
  const snapped = [];
  for (const [k, name] of BOARD_ROLES) {
    const board = roleValue(k);
    const thkKey = THK_FOR[k];
    const have = stockedThicknesses(board);
    if (!have.length) continue;
    const want = cfg[thkKey];
    if (have.includes(want)) continue;
    const to = nearest(have, want);
    snap[thkKey] = to;
    snapped.push(`${name} ${want} to ${to}`);
  }
  if (snapped.length) {
    build.push(offer({
      id: 'snap-thk',
      title: 'Round thicknesses to sheets you stock',
      detail: `${snapped.join(', ')}. Anything not stocked is currently priced off the nearest sheet, which is an estimate on top of an estimate.`,
      patch: snap,
    }));
  }

  /* Cheaper wins. Fewer sheets for the same money also wins. Fewer sheets of
     a board that costs twice as much does not, however good the nest looks. */
  const better = (o) => o.saving > 1 || (Math.abs(o.saving) <= 1 && o.sheetsSaved > 0);
  return {
    current, use,
    materials: materials.filter(better).sort((a, b) => b.saving - a.saving),
    build: build.filter(better).sort((a, b) => b.saving - a.saving),
    /* Options that lose money are still worth seeing, because sometimes one
       board is what you want even if it costs a little more. */
    rejected: [...materials, ...build].filter((o) => !better(o))
      .sort((a, b) => b.saving - a.saving),
  };
}
