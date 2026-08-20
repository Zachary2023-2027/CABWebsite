import { describe, expect, it } from 'vitest';
import {
  RISKY_URL, SAFE_URL, decodeProject, encodeProject, expand, fromBase64url,
  readShared, shareUrl, squeeze, toBase64url,
} from '../share.js';
import { starterProject } from '../project.js';
import { hydrate } from '../storage.js';
import { PROJECT } from '../catalog.js';

const load = (encoded) => hydrate({
  schema: 3, id: 'x', savedAt: 1, cut: [], prices: {}, quoted: '',
  ...decodeProject(encoded),
});

describe('base64url survives being a URL', () => {
  it('round trips plain text', () => {
    for (const text of ['', 'hello', '{"a":1}', 'a'.repeat(5000)]) {
      expect(fromBase64url(toBase64url(text))).toBe(text);
    }
  });

  /* btoa only takes Latin-1, so a project named with an accent throws on the
     way in and comes back as mojibake on the way out. */
  it('round trips text that is not Latin-1', () => {
    for (const text of ['Küche', 'Ostrożnie', '厨房', 'kitchen 🔨', 'naïve café']) {
      expect(fromBase64url(toBase64url(text))).toBe(text);
    }
  });

  it('produces nothing a URL would mangle', () => {
    const encoded = toBase64url('a'.repeat(300) + 'ÿþ');
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });
});

describe('a kitchen survives the trip', () => {
  const project = starterProject();
  const encoded = encodeProject(project);
  const back = load(encoded);

  it('comes back with the same walls and the same cabinets', () => {
    expect(back.project.walls).toHaveLength(project.walls.length);
    for (const [i, wall] of back.project.walls.entries()) {
      expect(wall.name).toBe(project.walls[i].name);
      expect(wall.length).toBe(project.walls[i].length);
      expect(wall.units).toHaveLength(project.walls[i].units.length);
    }
  });

  it('comes back with the same name and room', () => {
    expect(back.project.name).toBe(project.name);
    expect(back.project.room).toBe(project.room);
  });

  /* Nothing in a shared project refers to a cabinet by id: the cut ticks do
     not travel, and the receiver gets a copy anyway. Carrying twenty odd ids
     spends a few hundred characters of link on nothing. */
  it('does not carry cabinet ids that nothing points at', () => {
    const small = squeeze(project);
    expect(small.w[0].u.every((u) => u.d === undefined)).toBe(true);
  });

  it('but the copy still has an id for every cabinet, all different', () => {
    const uids = back.project.walls.flatMap((w) => w.units.map((u) => u.uid));
    expect(uids.every(Boolean)).toBe(true);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('a locked cabinet keeps its id, because the lock points at it', () => {
    const p2 = starterProject();
    p2.locked = [p2.walls[0].units[0].uid];
    const round = load(encodeProject(p2));

    expect(round.project.locked).toEqual([p2.walls[0].units[0].uid]);
    expect(round.project.walls[0].units[0].uid).toBe(p2.walls[0].units[0].uid);
  });

  it('carries the obstacles on the wall', () => {
    const from = project.walls[0].obstacles;
    expect(back.project.walls[0].obstacles).toHaveLength(from.length);
    expect(back.project.walls[0].obstacles[0].label).toBe(from[0].label);
  });

  it('carries a cabinet that departs from the project defaults', () => {
    const p2 = starterProject();
    p2.walls[0].units[0].settings = { width: 613, cfg: { carcassThk: 18 } };
    const round = load(encodeProject(p2));
    expect(round.project.walls[0].units[0].settings.width).toBe(613);
    expect(round.project.walls[0].units[0].settings.cfg.carcassThk).toBe(18);
  });

  /* Config is stored as differences from the defaults, so a project that
     changed nothing carries nothing. That is the common case and it is most
     of the payload. */
  it('carries only the config that differs from the defaults', () => {
    const plain = squeeze(starterProject());
    expect(Object.keys(plain.c)).toHaveLength(0);

    const changed = starterProject();
    changed.cfg = { ...changed.cfg, carcassThk: 18, frontBoard: 'Navy 2pac' };
    expect(Object.keys(squeeze(changed).c)).toHaveLength(2);
  });

  it('a changed setting still arrives, and the rest still default', () => {
    const p2 = starterProject();
    p2.cfg = { ...p2.cfg, carcassThk: 18 };
    const round = load(encodeProject(p2));
    expect(round.project.cfg.carcassThk).toBe(18);
    expect(round.project.cfg.frontThk).toBe(PROJECT.frontThk);
  });
});

describe('the link, and whether it will survive being sent', () => {
  it('reports its real length rather than hoping', () => {
    const link = shareUrl(starterProject(), 'https://example.com/app/');
    expect(link.url).toContain('#k=');
    expect(link.length).toBe(link.url.length);
  });

  it('the whole example kitchen fits in a link that pastes anywhere', () => {
    const link = shareUrl(starterProject(), 'https://example.com/app/');
    expect(link.length).toBeLessThan(SAFE_URL);
    expect(link.fits).toBe(true);
    expect(link.risky).toBe(false);
  });

  it('says so when a kitchen gets too big to send', () => {
    const big = starterProject();
    // Enough cabinets that the link stops being pasteable.
    const wall = big.walls[0];
    wall.units = Array.from({ length: 400 }, (_, i) => ({
      uid: `u${i}`, familyId: 'base-2door', settings: { width: 600 + i },
    }));
    const link = shareUrl(big, 'https://example.com/app/');
    expect(link.length).toBeGreaterThan(SAFE_URL);
    expect(link.fits).toBe(false);
  });

  it('replaces an existing fragment rather than stacking another one on', () => {
    const link = shareUrl(starterProject(), 'https://example.com/app/#k=old');
    expect(link.url.match(/#/g)).toHaveLength(1);
  });
});

/* A link is something a stranger pastes, so it is untrusted input. */
describe('a link that is not a kitchen', () => {
  it('comes back as nothing rather than throwing', () => {
    for (const junk of ['', 'not-base64!!', toBase64url('{"a":1}'), toBase64url('nonsense'),
      toBase64url('{"w":"not an array"}')]) {
      expect(decodeProject(junk)).toBeNull();
    }
  });

  it('a truncated link comes back as nothing', () => {
    const full = encodeProject(starterProject());
    expect(decodeProject(full.slice(0, Math.floor(full.length / 2)))).toBeNull();
  });

  it('reading a URL with no kitchen in it finds none', () => {
    expect(readShared('https://example.com/app/')).toBeNull();
    expect(readShared('#other=1')).toBeNull();
  });

  it('reading one with a kitchen in it finds it', () => {
    const link = shareUrl(starterProject(), 'https://example.com/app/');
    expect(readShared(link.url).project.walls.length).toBeGreaterThan(0);
  });

  it('expand refuses anything that is not the shape it expects', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { w: 'no' }]) {
      expect(expand(junk)).toBeNull();
    }
  });

  it('the risky threshold is above the safe one', () => {
    expect(RISKY_URL).toBeGreaterThan(SAFE_URL);
  });
});
