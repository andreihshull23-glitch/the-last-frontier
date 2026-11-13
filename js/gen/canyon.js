// Open-air canyon levels: places of interest in clearings, joined by winding
// passes through the rock. Deterministic in (spec, seed); retried until every
// promise in validateLevel() holds.
import { TILE, PX, MACRO, SOLID, ROCK, GROUND, ENEMIES, LOOT_NAMES } from '../content.js';
import { makeRng } from '../rng.js';
import { createLevel, building, skinRock, place, box, cyl, paint, reserve, metres, centreM, tileCentre, addFlags, setTile, validateLevel, inb, WALL, buildNav, floodFrom, nearestNav } from '../level.js';
import { scatter, trail, clearAround, DESERT_FLORA, DESERT_ROCKS, PEBBLES, HOLLOW_FLORA, TM } from './common.js';
import { horse, wagon, coach, barrel, crate, hitchRail, lampPost, trough, well, waterTower, campfire, railTrack, counter, shelfWall, table, flag } from './props.js';

const P = (m) => m * PX;
const TAU = Math.PI * 2;

const SIZE = {
  trailhead: [3, 3], coach_stop: [3, 3], bandit_camp: [5, 4], homestead: [5, 4], rail_station: [6, 4], site9: [7, 6],
  outpost: [4, 4], ruins: [4, 3], wreck: [3, 3], depot: [8, 7], heart: [6, 6], camp_dead: [3, 3],
};
const FACTION_OF = { bandit: 'outlaw', gunman: 'outlaw', dynamiter: 'outlaw', brute: 'outlaw', bounty: 'outlaw', guard: 'meridian', scout: 'any', walker: 'hollow', husk: 'hollow' };

export function generateCanyon(spec) {
  const base = (spec.seed ?? 1) | 0;
  let last = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const L = build(spec, (base + attempt * 7919) | 0);
    if (!L) continue;
    const problems = validateLevel(L);
    if (!problems.length) { L.attempts = attempt + 1; return L; }
    last = problems;
  }
  throw new Error('Could not build a canyon for seed ' + base + ': ' + (last ? last.join('; ') : 'layout never fit'));
}

export function build(spec, seed) {
  const rng = makeRng(seed);
  const [mw, mh] = spec.size || [24, 19];
  const theme = spec.theme || 'red';
  const L = createLevel('canyon', theme, mw, mh);
  L.seed = seed;
  L.rock.fill(1);
  const hollow = theme === 'hollow';

  // ---- where things go -------------------------------------------------------
  const want = ['trailhead', ...(spec.pois || []), 'coach_stop'];
  const pois = [];
  const fits = (x, y, w, h) => x >= 3 && y >= 3 && x + w <= mw - 3 && y + h <= mh - 3
    && pois.every((p) => x + w + 1 <= p.x || p.x + p.w + 1 <= x || y + h + 1 <= p.y || p.y + p.h + 1 <= y);
  const centre = (p) => [p.x + p.w / 2, p.y + p.h / 2];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const diag = Math.hypot(mw, mh);
  const put = (type, score) => {
    const [w, h] = SIZE[type];
    let best = null, bestS = -Infinity;
    for (let i = 0; i < 90; i++) {
      const x = rng.int(3, mw - 3 - w), y = rng.int(3, mh - 3 - h);
      if (!fits(x, y, w, h)) continue;
      const s = score([x + w / 2, y + h / 2]) + rng.next() * 1.5;
      if (s > bestS) { bestS = s; best = { type, x, y, w, h }; }
    }
    if (best) pois.push(best);
    return best;
  };
  // the trailhead hugs an edge
  {
    const [w, h] = SIZE.trailhead;
    const side = rng.int(0, 3);
    const x = side === 0 ? 3 : side === 1 ? mw - 3 - w : rng.int(3, mw - 3 - w);
    const y = side === 2 ? 3 : side === 3 ? mh - 3 - h : rng.int(3, mh - 3 - h);
    pois.push({ type: 'trailhead', x, y, w, h });
  }
  const start = centre(pois[0]);
  const objType = spec.objective?.at;
  const order = want.slice(1).sort((a, b) => (a === objType ? -1 : 0) - (b === objType ? -1 : 0));
  for (const type of order) {
    let ok;
    if (type === objType && !pois.some((p) => p.type === type)) ok = put(type, (c) => Math.min(dist(c, start), diag * 0.62));
    else if (type === 'coach_stop') {
      const obj = pois.find((p) => p.type === objType);
      ok = put(type, (c) => Math.min(dist(c, start), obj ? dist(c, centre(obj)) * 1.6 : 99));
    } else ok = put(type, (c) => Math.min(...pois.map((p) => dist(c, centre(p)))) * 0.8);
    if (!ok) return null;
  }
  const obj = pois.find((p) => p.type === objType);
  if (obj && dist(centre(obj), start) < diag * 0.36) return null;

  // ---- carve -----------------------------------------------------------------
  const open = (x, y) => { if (x >= 2 && y >= 2 && x < mw - 2 && y < mh - 2) L.rock[y * mw + x] = 0; };
  for (const p of pois) {
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) open(x, y);
    // walled places get a clear ring so there is always a way round to a gate
    const ring = p.type === 'depot' || p.type === 'site9';
    for (let y = p.y - 1; y <= p.y + p.h; y++) for (let x = p.x - 1; x <= p.x + p.w; x++) if (ring || rng.chance(0.4)) open(x, y);
  }
  // minimum spanning tree over the places, plus a couple of loops
  const edges = [];
  {
    const inTree = [0];
    while (inTree.length < pois.length) {
      let best = null;
      for (const a of inTree) for (let b = 0; b < pois.length; b++) {
        if (inTree.includes(b)) continue;
        const d = dist(centre(pois[a]), centre(pois[b]));
        if (!best || d < best[2]) best = [a, b, d];
      }
      edges.push([best[0], best[1]]);
      inTree.push(best[1]);
    }
    const extra = Math.min(2, Math.floor(pois.length / 3));
    for (let k = 0, tries = 0; k < extra && tries < 30; tries++) {
      const a = rng.int(0, pois.length - 1), b = rng.int(0, pois.length - 1);
      if (a === b || edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) continue;
      if (dist(centre(pois[a]), centre(pois[b])) > diag * 0.55) continue;
      edges.push([a, b]); k++;
    }
  }
  const paths = [];
  for (const [ai, bi] of edges) {
    const a = centre(pois[ai]).map(Math.floor), b = centre(pois[bi]).map(Math.floor);
    let [x, y] = a;
    const cells = [[x, y]];
    let side = rng.chance(0.5) ? 1 : -1;
    for (let guard = 0; guard < 300 && (x !== b[0] || y !== b[1]); guard++) {
      const dx = b[0] - x, dy = b[1] - y;
      const stepX = rng.next() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy));
      let px = x, py = y;
      if (rng.chance(0.14)) { if (stepX) py += rng.chance(0.5) ? 1 : -1; else px += rng.chance(0.5) ? 1 : -1; }
      else if (stepX) px += Math.sign(dx); else py += Math.sign(dy);
      px = Math.max(2, Math.min(mw - 3, px)); py = Math.max(2, Math.min(mh - 3, py));
      const horiz = px !== x;
      x = px; y = py;
      cells.push([x, y]);
      open(x, y);
      if (rng.chance(0.08)) side = -side;
      if (horiz) open(x, y + side); else open(x + side, y);
      if (rng.chance(0.3)) { if (horiz) open(x, y - side); else open(x - side, y); }
    }
    paths.push(cells);
  }
  // a few wide valleys and side pockets
  const blobs = Math.round((mw * mh) / 90);
  for (let k = 0; k < blobs; k++) {
    const cells = paths[rng.int(0, paths.length - 1)];
    const [cx, cy] = cells[rng.int(0, cells.length - 1)];
    const r = 1.2 + rng.next() * 1.6;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (Math.hypot(x - cx, y - cy) <= r + rng.next() * 0.6 - 0.3) open(x, y);
    }
  }
  const pockets = [];
  for (let k = 0, tries = 0; k < Math.round((mw * mh) / 70) && tries < 200; tries++) {
    const x = rng.int(3, mw - 4), y = rng.int(3, mh - 4);
    if (!L.rock[y * mw + x]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !L.rock[(y + dy) * mw + x + dx]);
    if (near.length !== 1) continue;
    open(x, y); pockets.push([x, y]); k++;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 2; y < mh - 2; y++) for (let x = 2; x < mw - 2; x++) {
      if (!L.rock[y * mw + x]) continue;
      const n = !L.rock[(y - 1) * mw + x], s = !L.rock[(y + 1) * mw + x], w = !L.rock[y * mw + x - 1], e = !L.rock[y * mw + x + 1];
      if (n + s + w + e >= 3 && rng.chance(0.85)) L.rock[y * mw + x] = 0;
      else if (((n && s) || (w && e)) && rng.chance(0.35)) L.rock[y * mw + x] = 0;
    }
  }

  // lone mesas in wide-open ground: cover, and something to walk around
  const onPath = new Set(paths.flat().map(([x, y]) => y * mw + x));
  const inPoi = (x, y) => pois.some((p) => x >= p.x - 1 && x <= p.x + p.w && y >= p.y - 1 && y <= p.y + p.h);
  for (let y = 3; y < mh - 3; y++) for (let x = 3; x < mw - 3; x++) {
    if (L.rock[y * mw + x] || onPath.has(y * mw + x) || inPoi(x, y)) continue;
    let clear = true;
    for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) if (L.rock[(y + dy) * mw + x + dx]) { clear = false; break; }
    if (clear && rng.chance(0.16)) L.rock[y * mw + x] = 1;
  }

  for (const p of pois) {
    p.tx = p.x * MACRO; p.ty = p.y * MACRO; p.tw = p.w * MACRO; p.th = p.h * MACRO;
    reserve(L, p.tx, p.ty, p.tx + p.tw - 1, p.ty + p.th - 1);
  }
  skinRock(L, rng);

  // ---- ground ------------------------------------------------------------------
  const baseGround = hollow ? GROUND.hollow : GROUND.sand;
  for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
    const i = ty * L.w + tx;
    if (L.flags[i] & ROCK) continue;
    L.ground[i] = baseGround;
    let nearRock = false;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { if (!inb(L, tx + dx, ty + dy) || L.flags[(ty + dy) * L.w + tx + dx] & ROCK) { nearRock = true; break; } }
    if (nearRock) L.ground[i] = GROUND.rockfloor;
  }
  // dry grass in patches
  for (let k = 0; k < (mw * mh) / 14; k++) {
    const cx = rng.int(16, L.w - 17), cy = rng.int(16, L.h - 17), r = rng.int(3, 8);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inb(L, x, y) || Math.hypot(x - cx, y - cy) > r + rng.next() * 2 - 1) continue;
      const i = y * L.w + x;
      if (L.ground[i] === baseGround && !(L.flags[i] & ROCK)) L.ground[i] = hollow ? GROUND.grass : GROUND.grass;
    }
  }
  for (const cells of paths) {
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1], b = cells[k];
      trail(L, rng, a[0] * MACRO + 4, a[1] * MACRO + 4, b[0] * MACRO + 4, b[1] * MACRO + 4, 3, hollow ? GROUND.trail : GROUND.trail);
    }
  }

  // ---- build the places -----------------------------------------------------------
  const ctx = { L, rng, spec, hollow, caches: [], posts: [] };
  for (const p of pois) {
    const info = BUILDERS[p.type](ctx, p) || {};
    Object.assign(p, info);
    L.zones.push({ name: p.name || p.type, x0: p.tx * TILE, y0: p.ty * TILE, x1: (p.tx + p.tw) * TILE, y1: (p.ty + p.th) * TILE, poi: p.type });
  }
  const th = pois[0];
  L.start = { x: th.startAt[0], y: th.startAt[1], a: Math.atan2(L.h * TILE / 2 - th.startAt[1], L.w * TILE / 2 - th.startAt[0]) };

  // ---- the job ---------------------------------------------------------------------
  const o = spec.objective || {};
  const nav = buildNav(L);
  const reach = floodFrom(L, nav, L.start.x, L.start.y);
  const freeSpot = (x0, y0, x1, y1, minStart = 0, clear = 2) => {
    for (let i = 0; i < 300; i++) {
      const tx = rng.int(x0, x1), ty = rng.int(y0, y1);
      if (!clearAround(L, tx, ty, clear, true) || reach[ty * L.w + tx] < 0) continue;
      const x = tileCentre(tx), y = tileCentre(ty);
      if (Math.hypot(x - L.start.x, y - L.start.y) < minStart) continue;
      return [x, y];
    }
    return null;
  };
  if (o.kind === 'item' && obj) {
    L.items.push({ kind: 'objective', item: o.item, x: obj.objective[0], y: obj.objective[1], role: 'primary', zone: obj.name });
  } else if (o.kind === 'collect') {
    const spots = pois.filter((p) => p.objective && p.type !== 'trailhead' && p.type !== 'coach_stop');
    for (let k = 0; k < o.count; k++) {
      const p = spots[k % spots.length];
      const at = k < spots.length ? p.objective : freeSpot(p.tx + 2, p.ty + 2, p.tx + p.tw - 3, p.ty + p.th - 3, 0, 1);
      if (!at) return null;
      L.items.push({ kind: 'objective', item: o.item, x: at[0], y: at[1], role: 'primary', zone: p.name });
    }
  } else if (o.kind === 'burn') {
    const stakes = [];
    for (let k = 0, tries = 0; k < o.count + 1 && tries < 400; tries++) {
      const at = freeSpot(20, 20, L.w - 21, L.h - 21, P(26), 3);
      if (!at || stakes.some((s) => Math.hypot(s[0] - at[0], s[1] - at[1]) < P(22))) continue;
      stakes.push(at); k++;
    }
    if (stakes.length < o.count) return null;
    for (const [x, y] of stakes) {
      L.items.push({ kind: 'objective', item: 'stake', x, y, role: 'primary' });
      reserve(L, Math.floor(x / TILE) - 2, Math.floor(y / TILE) - 2, Math.floor(x / TILE) + 2, Math.floor(y / TILE) + 2);
    }
  } else if (o.kind === 'kill' && obj) {
    L.spawns.push({ kind: o.enemy, x: obj.boss[0], y: obj.boss[1], target: true, name: o.enemy === 'bounty' ? spec.bounty?.name : null, notoriety: spec.bounty?.notoriety });
  }
  L.items.push({ kind: 'exit', variant: 'horse', x: th.exitAt[0], y: th.exitAt[1] });
  const cs = pois.find((p) => p.type === 'coach_stop');
  if (cs) L.items.push({ kind: 'exit', variant: 'coach', x: cs.exitAt[0], y: cs.exitAt[1] });

  // ---- who is out here ----------------------------------------------------------------
  const safe = P(27);
  const threat = spec.threat ?? 1;
  const mix = { ...(spec.mix || {}) };
  if (spec.enforcers) mix.guard = (mix.guard || 0) + 2;
  const postsOf = (faction) => ctx.posts.filter((q) => q.faction === faction || faction === 'any');
  const usedPosts = new Set();
  for (const [kind, n] of Object.entries(mix)) {
    const count = Math.max(kind === 'brute' ? 0 : 1, Math.round(n * threat));
    const faction = FACTION_OF[kind] || 'any';
    for (let k = 0; k < count; k++) {
      let at = null, facing = null, home = null;
      const cands = postsOf(faction === 'any' ? 'any' : faction).filter((q) => !usedPosts.has(q) && Math.hypot(q.x - L.start.x, q.y - L.start.y) > safe);
      if (cands.length && (faction !== 'hollow') && rng.chance(0.8)) {
        const q = cands[rng.int(0, cands.length - 1)];
        usedPosts.add(q); at = [q.x, q.y]; facing = q.a ?? null; home = q.poi;
      } else at = freeSpot(18, 18, L.w - 19, L.h - 19, safe + P(4), 2);
      if (!at) continue;
      const sp = { kind, x: at[0], y: at[1] };
      if (facing !== null) sp.facing = facing;
      // some of those without a post walk a beat between two places
      if (!home && faction !== 'hollow' && rng.chance(0.5)) {
        const to = freeSpot(18, 18, L.w - 19, L.h - 19, safe, 2);
        if (to && Math.hypot(to[0] - at[0], to[1] - at[1]) < P(40)) sp.route = [at, to];
      }
      L.spawns.push(sp);
    }
  }
  if (spec.bounty && o.enemy !== 'bounty') {
    const camp = pois.find((p) => p.type === 'bandit_camp') || pois[pois.length - 1];
    const at = freeSpot(camp.tx + 2, camp.ty + 2, camp.tx + camp.tw - 3, camp.ty + camp.th - 3, safe, 2) || freeSpot(18, 18, L.w - 19, L.h - 19, safe, 2);
    if (at) L.spawns.push({ kind: 'bounty', x: at[0], y: at[1], name: spec.bounty.name, notoriety: spec.bounty.notoriety });
  }

  // ---- what there is to find ----------------------------------------------------------
  for (const [px0, py0] of pockets) {
    const at = freeSpot(px0 * MACRO + 2, py0 * MACRO + 2, px0 * MACRO + 5, py0 * MACRO + 5, P(10), 1);
    if (at && rng.chance(0.75)) ctx.caches.push({ x: at[0], y: at[1], tier: rng.chance(0.3) ? 1 : 0 });
  }
  const wantCaches = Math.round((mw * mh) / 44);
  for (let tries = 0; ctx.caches.length < wantCaches && tries < 60; tries++) {
    const at = freeSpot(18, 18, L.w - 19, L.h - 19, P(12), 2);
    if (at && !ctx.caches.some((c) => Math.hypot(c.x - at[0], c.y - at[1]) < P(14))) ctx.caches.push({ x: at[0], y: at[1], tier: 0 });
  }
  const worth = 1 + (spec.tier ?? 0) * 0.25;
  for (const c of ctx.caches) {
    const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
    if (L.flags[ty * L.w + tx] & SOLID) continue;
    addFlags(L, tx, ty, SOLID, 6);
    L.keep[ty * L.w + tx] = 1;
    const n = c.tier === 2 ? 3 : c.tier === 1 ? 2 : 1;
    const loot = [];
    for (let k = 0; k < n; k++) loot.push({ name: LOOT_NAMES[rng.int(0, LOOT_NAMES.length - 1)], value: Math.round((8 + rng.next() * 14 + c.tier * 12) * worth) });
    L.items.push({
      kind: 'cache', x: tileCentre(tx), y: tileCentre(ty), tier: c.tier, a: rng.next() * TAU, loot,
      cartridges: rng.chance(0.7) ? rng.int(10, 18) : 0, shells: rng.chance(0.35) ? rng.int(4, 8) : 0,
      bandage: rng.chance(0.25) ? 1 : 0, dynamite: rng.chance(0.14) ? 1 : 0,
    });
  }

  // ---- dressing -----------------------------------------------------------------------
  const area = (mw * mh) / 100;
  if (hollow) {
    scatter(L, rng, Math.round(area * 26), HOLLOW_FLORA);
    scatter(L, rng, Math.round(area * 7), DESERT_ROCKS);
  } else {
    scatter(L, rng, Math.round(area * 40), DESERT_FLORA);
    scatter(L, rng, Math.round(area * 6), DESERT_ROCKS, { near: 'open' });
    scatter(L, rng, Math.round(area * 7), DESERT_ROCKS, { near: 'wall' });
  }
  scatter(L, rng, Math.round(area * 34), PEBBLES, { onKeep: true });
  // spires on top of the rock
  for (let k = 0; k < area * 3; k++) {
    const mx = rng.int(0, mw - 1), my = rng.int(0, mh - 1);
    if (L.rock[my * mw + mx] !== 1) continue;
    place(L, rng.chance(0.5) ? 'cave/template-detail' : 'nat/rock_tallB', (mx + 0.5) * 4 + rng.range(-1, 1), (my + 0.5) * 4 + rng.range(-1, 1), { y: 3.95, r: rng.next() * TAU, s: 0.8 + rng.next() * 0.7, solid: false });
  }

  L.name = spec.name || 'The Red Country';
  L.clock = spec.night ? { start: 'night' } : { start: 'day' };
  return L;
}

// ---- places ------------------------------------------------------------------------------
// Each builder gets the POI rect (tx, ty, tw, th in tiles) and returns what the level
// generator needs: a name, where the objective or boss goes, and so on. Guard posts and
// caches are pushed onto ctx.

function frameOf(p) {
  const X = metres(p.tx), Z = metres(p.ty);
  return { X, Z, W: p.tw * TM, D: p.th * TM, at: (u, v) => [X + u, Z + v], sim: (u, v) => [P(X + u), P(Z + v)] };
}
function post(ctx, p, F, u, v, faction, a = null) {
  ctx.posts.push({ x: P(F.X + u), y: P(F.Z + v), faction, a, poi: p.type });
}
function cacheAt(ctx, F, u, v, tier = 0) { ctx.caches.push({ x: P(F.X + u), y: P(F.Z + v), tier }); }
function tent(L, x, z, r, kind = 0) {
  if (kind === 0) place(L, 'forest/tent', x, z, { r, s: 1.0, t: 'canvas' });
  else if (kind === 1) place(L, 'nat/tent_detailedOpen', x, z, { r, s: 1.15 });
  else place(L, 'nat/tent_smallClosed', x, z, { r, s: 1.2 });
}
function fenceLine(L, x0, z0, x1, z1, o = {}) {
  // a tall wire fence: you can see and shoot through it, but not walk through it
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.5));
  const r = Math.atan2(x1 - x0, z1 - z0);
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    box(L, x, 0, z, 0.14, 2.3, 0.14, o.c || '#5a5a62', { c2: '#3a3a42' });
  }
  for (const y of [0.5, 1.2, 1.9]) box(L, (x0 + x1) / 2, y, (z0 + z1) / 2, 0.04, 0.05, len, o.c || '#6a6a72', { r });
  for (let d = 0; d <= len; d += 0.2) {
    const x = x0 + ((x1 - x0) * d) / len, z = z0 + ((z1 - z0) * d) / len;
    addFlags(L, Math.floor(x / TM), Math.floor(z / TM), SOLID, 23);
  }
}

const BUILDERS = {
  trailhead({ L, rng }, p) {
    const F = frameOf(p);
    const cx = F.W / 2, cz = F.D / 2;
    hitchRail(L, ...F.at(cx - 2.2, cz - 2.4), 0, 3);
    horse(L, ...F.at(cx - 2.2, cz - 1.3), Math.PI, '#7a4e30');
    place(L, 'nat/sign', ...F.at(cx + 2.6, cz - 2.6), { r: 0.4 });
    campfire(L, ...F.at(cx + 1.6, cz + 1.8), false);
    place(L, 'nat/bed_floor', ...F.at(cx + 3.4, cz + 2.2), { r: 0.8, s: 1.2, solid: false });
    place(L, 'nat/log', ...F.at(cx + 0.4, cz + 3.0), { r: 1.2, solid: false });
    return { name: 'Trailhead', startAt: F.sim(cx + 0.4, cz + 0.2), exitAt: F.sim(cx - 2.2, cz - 0.1) };
  },
  coach_stop({ L, rng }, p) {
    const F = frameOf(p);
    const cx = F.W / 2, cz = F.D / 2;
    coach(L, ...F.at(cx, cz - 1.2), Math.PI / 2);
    horse(L, ...F.at(cx + 3.4, cz - 1.75), Math.PI / 2, '#3b2a20', { saddle: false });
    horse(L, ...F.at(cx + 3.4, cz - 0.65), Math.PI / 2, '#8a5a36', { saddle: false });
    lampPost(L, ...F.at(cx - 3.2, cz + 1.4));
    place(L, 'nat/sign', ...F.at(cx - 2.6, cz + 2.8), { r: -0.3 });
    barrel(L, ...F.at(cx - 1.4, cz + 3.4)); crate(L, ...F.at(cx - 0.4, cz + 3.5), 0.3, 0.8);
    return { name: 'Coach stop', exitAt: F.sim(cx, cz + 1.5) };
  },
  bandit_camp(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    const cx = F.W / 2, cz = F.D / 2;
    paint(L, p.tx + 6, p.ty + 5, p.tx + p.tw - 7, p.ty + p.th - 6, GROUND.camp);
    campfire(L, ...F.at(cx, cz), true);
    for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4; place(L, 'nat/log', ...F.at(cx + Math.cos(a) * 2.2, cz + Math.sin(a) * 2.2), { r: -a, solid: false, s: 1.2 }); }
    tent(L, ...F.at(cx - 6, cz - 4.2), 0.5, 0); tent(L, ...F.at(cx + 6.2, cz - 3.8), -0.6, 0);
    tent(L, ...F.at(cx - 6.4, cz + 3.6), 2.2, 1); tent(L, ...F.at(cx + 5.2, cz + 4.4), 3.6, 2);
    wagon(L, ...F.at(cx + 1.5, cz - 5.6), 1.3, { load: true });
    barrel(L, ...F.at(cx - 2.6, cz - 5.0)); barrel(L, ...F.at(cx - 3.4, cz - 5.3), { c: '#7a5a3a' });
    crate(L, ...F.at(cx + 7.6, cz + 0.8), 0.3, 1.0); crate(L, ...F.at(cx + 7.4, cz + 1.9), 0.9, 0.7);
    crate(L, ...F.at(cx - 8.2, cz - 0.6), 0.2, 0.9);
    for (const [u, v, r] of [[cx - 3, cz + 6.8, 0], [cx, cz + 6.8, 0], [cx + 3, cz + 6.8, 0]]) if (rng.chance(0.7)) place(L, 'nat/fence_simple', ...F.at(u, v), { centre: true,  r });
    flag(L, ...F.at(cx + 0.9, cz - 2.2), 1.3, 'tent_red');
    for (const [u, v] of [[cx - 2.4, cz + 1.4], [cx + 2.6, cz + 1.2], [cx + 0.4, cz - 3.2], [cx - 5.2, cz - 1.2], [cx + 4.6, cz + 0.2], [cx - 1, cz + 5.2], [cx + 8, cz - 5], [cx - 8.4, cz + 5.6]]) post(ctx, p, F, u, v, 'outlaw');
    cacheAt(ctx, F, cx - 7.6, cz - 2.2, 1); cacheAt(ctx, F, cx + 7.4, cz - 1.6, 0);
    return { name: 'Bandit camp', objective: F.sim(cx - 4.6, cz - 2.6), boss: F.sim(cx + 1.4, cz + 2.4) };
  },
  homestead(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    const house = building(L, rng, { x: p.tx + 4, y: p.ty + 3, mw: 3, md: 2, style: 'wood', porch: 's', doors: [{ side: 's', at: 1 }, { side: 'e', at: 0 }], windows: 0.6, boarded: 0.35, name: 'Homestead' });
    const barn = building(L, rng, { x: p.tx + 27, y: p.ty + 5, mw: 2, md: 2, style: 'red', doors: [{ side: 's', at: 0, wide: true }], windows: 0 });
    // inside the house
    const hx = metres(house.in.x0), hz = metres(house.in.y0);
    place(L, 'nat/bed', hx + 1.0, hz + 1.3, { s: 1.1 });
    table(L, hx + 5.2, hz + 2.2);
    shelfWall(L, hx + 6.4, hz + 0.34, 0, 2.6);
    // barn
    const bx = metres(barn.in.x0), bz = metres(barn.in.y0);
    box(L, bx + 1.0, 0, bz + 1.0, 1.2, 0.8, 0.9, '#d9b443', { c2: '#b08a2e', solid: true });
    box(L, bx + 4.4, 0, bz + 0.9, 1.2, 0.8, 0.9, '#d9b443', { c2: '#b08a2e', solid: true, r: 0.5 });
    // the field
    const fx0 = p.tx + 5, fy0 = p.ty + 25, fx1 = p.tx + 23, fy1 = p.ty + 30;
    paint(L, fx0, fy0, fx1, fy1, GROUND.field);
    const crop = rng.chance(0.5) ? 'nat/crops_cornStageD' : 'nat/crops_wheatStageB';
    for (let ty = fy0 + 1; ty <= fy1; ty += 2) for (let tx = fx0 + 1; tx <= fx1; tx += 2) {
      if (rng.chance(0.82)) place(L, crop, centreM(tx), centreM(ty), { solid: false, r: rng.next() * 6, s: 0.8 + rng.next() * 0.4 });
    }
    for (let k = 0; k < 4; k++) place(L, 'nat/crop_pumpkin', ...F.at(13.2 + k * 0.9, 14.4 + (k % 2) * 0.5), { solid: false, s: 0.9 });
    for (let u = metres(fx0) - 0.3; u < metres(fx1 + 1); u += 3) place(L, 'nat/fence_simple', u + 1.5, metres(fy0) - 0.6, { centre: true, });
    well(L, ...F.at(16.8, 12.4));
    trough(L, ...F.at(18.9, 10.3), 1.57);
    barrel(L, ...F.at(1.2, 8.2));
    for (const [u, v] of [[6.6, 9.4], [9.5, 8.6], [14.4, 9.2], [17.2, 9.6], [5, 4.6], [16.6, 6.6]]) post(ctx, p, F, u, v, 'outlaw');
    cacheAt(ctx, F, hx - F.X + 7.6, hz - F.Z + 4.4, 1); cacheAt(ctx, F, bx - F.X + 2.8, bz - F.Z + 1.2, 0);
    return { name: 'Abandoned homestead', objective: [P(hx + 2.9), P(hz + 3.0)], boss: F.sim(9, 10.5) };
  },
  rail_station(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    const B = building(L, rng, { x: p.tx + 9, y: p.ty + 3, mw: 4, md: 2, style: 'ochre', front: 's', sign: 'DRY FORK', porch: 's', doors: [{ side: 's', at: 1, wide: true }, { side: 'w', at: 0 }], windows: 0.6, boarded: 0.3, name: 'Dry Fork station' });
    paint(L, p.tx + 4, p.ty + 20, p.tx + p.tw - 5, p.ty + 23, GROUND.plank);
    paint(L, p.tx, p.ty + 25, p.tx + p.tw - 1, p.ty + 30, GROUND.gravel);
    railTrack(L, F.X - 2, F.Z + 13.9, F.X + F.W + 2, F.Z + 13.9);
    // a stranded freight car
    const cu = 17.5, cv = 13.9;
    box(L, ...((q) => [q[0], 0.55, q[1]])(F.at(cu, cv)), 6.4, 0.3, 2.3, '#4a3a2e', { solid: 'wall' });
    box(L, ...((q) => [q[0], 0.85, q[1]])(F.at(cu, cv)), 6.2, 2.3, 2.2, '#7a3a2c', { c2: '#5a281e' });
    box(L, ...((q) => [q[0], 3.15, q[1]])(F.at(cu, cv)), 6.5, 0.16, 2.5, '#3b2a20');
    for (const du of [-2.2, 2.2]) for (const dv of [-0.95, 0.95]) L.pieces.push({ m: '@cyl', x: F.X + cu + du, y: 0.45, z: F.Z + cv + dv, sx: 0.45, sy: 0.14, sz: 0.45, r: Math.PI / 2, c: '#5a5a62', c2: '#2e2e36', seg: 10, axis: 'x' });
    waterTower(L, ...F.at(20.6, 3.6));
    const bx = metres(B.in.x0), bz = metres(B.in.y0);
    counter(L, bx + 3.0, bz + 2.2, 0, 3.2); shelfWall(L, bx + 8.5, bz + 0.34, 0, 3.4);
    box(L, bx + 9.6, 0, bz + 4.2, 1.6, 0.5, 0.5, '#7a5236', { c2: '#5c3e2a', solid: true });
    crate(L, ...F.at(6.2, 10.6), 0.2, 1.0); crate(L, ...F.at(7.3, 10.9), 0.6, 0.8); barrel(L, ...F.at(20.4, 10.8)); barrel(L, ...F.at(21.2, 10.5));
    crate(L, ...F.at(10.6, 15.4), 0.1, 1.1); crate(L, ...F.at(22.2, 12.2), 0.4, 0.9);
    lampPost(L, ...F.at(5.2, 9.4)); lampPost(L, ...F.at(19.4, 9.4));
    for (const [u, v, f] of [[8, 11], [14, 11.2], [20, 11], [11, 15.2], [22, 15.6], [3.4, 8], [bx - F.X + 5.6, bz - F.Z + 3.6], [bx - F.X + 9, bz - F.Z + 2.6]]) post(ctx, p, F, u, v, ctx.spec.mix?.guard ? 'meridian' : 'outlaw');
    cacheAt(ctx, F, bx - F.X + 0.9, bz - F.Z + 4.4, 1); cacheAt(ctx, F, 22.4, 10.4, 0);
    return { name: 'Dry Fork station', objective: [P(bx + 6.2), P(bz + 3.4)], boss: F.sim(13, 11.4) };
  },
  site9(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    paint(L, p.tx + 3, p.ty + 3, p.tx + p.tw - 4, p.ty + p.th - 4, GROUND.gravel);
    const x0 = 1.6, z0 = 1.6, x1 = F.W - 1.6, z1 = F.D - 1.6;
    const gate = F.W / 2;
    fenceLine(L, F.X + x0, F.Z + z0, F.X + x1 - 5, F.Z + z0);              // north, with a gap torn in the corner
    fenceLine(L, F.X + x1, F.Z + z0 + 3.5, F.X + x1, F.Z + z1);
    fenceLine(L, F.X + x0, F.Z + z0, F.X + x0, F.Z + z1);
    fenceLine(L, F.X + x0, F.Z + z1, F.X + gate - 2.2, F.Z + z1);
    fenceLine(L, F.X + gate + 2.2, F.Z + z1, F.X + x1, F.Z + z1);
    L.signs.push({ text: 'SITE 9', x: F.X + gate + 3.6, y: 1.5, z: F.Z + z1 + 0.12, nx: 0, nz: 1, w: 2.2, h: 0.8, bg: '#3a3a42', fg: '#d8c39a' });
    const lab = building(L, rng, { x: p.tx + 7, y: p.ty + 6, mw: 4, md: 3, style: 'company', sign: 'MERIDIAN', front: 's', doors: [{ side: 's', at: 1, wide: true }, { side: 'e', at: 2 }], windows: 0.5, lit: true, name: 'Site 9 laboratory' });
    const bar = building(L, rng, { x: p.tx + 37, y: p.ty + 8, mw: 2, md: 2, style: 'company', doors: [{ side: 's', at: 0 }], windows: 0.5, name: 'Barracks' });
    const lx = metres(lab.in.x0), lz = metres(lab.in.y0);
    counter(L, lx + 3.2, lz + 2.4, 0, 3.6, { c: '#5a5a62', top: '#3a3a42' });
    counter(L, lx + 8.6, lz + 5.6, 0, 3.0, { c: '#5a5a62', top: '#3a3a42' });
    shelfWall(L, lx + 5.5, lz + 0.34, 0, 6.5, { stock: ['#3f6e8c', '#8b6fb5', '#d8c39a', '#5a5a62'] });
    cyl(L, lx + 10.2, 0, lz + 1.6, 0.55, 1.5, '#8b6fb5', { c2: '#4a3a6a', solid: true, seg: 8 });   // a specimen tank
    L.lights.push({ x: lx + 10.2, y: 1.2, z: lz + 1.6, c: [0.6, 0.45, 1], r: 6, kind: 'glow' });
    const bx = metres(bar.in.x0), bz = metres(bar.in.y0);
    place(L, 'nat/bed', bx + 0.9, bz + 1.2, { s: 1.0 }); place(L, 'nat/bed', bx + 2.4, bz + 1.2, { s: 1.0 }); place(L, 'nat/bed', bx + 3.9, bz + 1.2, { s: 1.0 });
    // watch tower and yard clutter
    const tx = F.X + x1 - 3.2, tz = F.Z + z1 - 3.4;
    place(L, 'forest/building-structure', tx, tz, { s: 1.2, t: 'dark' });
    place(L, 'forest/building-platform', tx, tz, { y: 2.88, s: 1.2, t: 'dark', solid: false });
    place(L, 'forest/building-roof', tx, tz, { y: 4.0, s: 1.1, t: 'dark', solid: false });
    for (const [u, v, s] of [[9, 18.6, 1.1], [10.3, 18.9, 0.8], [17.5, 17.2, 1.0], [22, 14.6, 1.1], [22.3, 15.9, 0.8], [5, 20.2, 0.9]]) crate(L, ...F.at(u, v), rng.next(), s, { c: '#6a6a72' });
    lampPost(L, ...F.at(gate - 3.4, z1 - 1.4)); lampPost(L, ...F.at(gate + 3.4, z1 - 1.4)); lampPost(L, ...F.at(16.6, 13.4));
    for (const [u, v, a] of [[gate - 1.4, z1 - 1.2, 1.57], [gate + 1.4, z1 - 1.2, 1.57], [gate, z1 + 2.6, 1.57], [12, 17.4], [20, 19], [6, 16.6], [24, 6.4], [lx - F.X + 5.5, lz - F.Z + 4.6], [lx - F.X + 9.6, lz - F.Z + 3.6], [bx - F.X + 2.6, bz - F.Z + 3.6], [22.6, 20.4]]) post(ctx, p, F, u, v, 'meridian', a ?? null);
    cacheAt(ctx, F, lx - F.X + 0.9, lz - F.Z + 7.4, 2); cacheAt(ctx, F, bx - F.X + 4.6, bz - F.Z + 4.6, 1); cacheAt(ctx, F, 4.2, 4.2, 0);
    return { name: 'Site 9', objective: [P(lx + 8.6), P(lz + 4.4)], boss: F.sim(gate, z1 - 5) };
  },
  outpost(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    const B = building(L, rng, { x: p.tx + 5, y: p.ty + 4, mw: 2, md: 2, style: 'company', doors: [{ side: 's', at: 0 }], windows: 0.6, lit: true, name: 'Meridian outpost' });
    paint(L, p.tx + 3, p.ty + 17, p.tx + p.tw - 4, p.ty + p.th - 4, GROUND.gravel);
    // sandbag walls
    for (const [u, v, r, len] of [[5, 11.4, 0, 3.2], [11.6, 11.8, 0.3, 2.8], [12.8, 6.4, 1.57, 3]]) {
      const [bx, bz] = F.at(u, v);
      box(L, bx, 0, bz, len, 0.5, 0.7, '#b8a888', { r, c2: '#8a7a5e', solid: true });
      box(L, bx, 0.5, bz, len - 0.4, 0.4, 0.55, '#c4b494', { r, c2: '#9a8a6e' });
    }
    const [tx, tz] = F.at(12.6, 3.4);
    place(L, 'forest/building-structure', tx, tz, { s: 1.2, t: 'dark' });
    place(L, 'forest/building-platform', tx, tz, { y: 2.88, s: 1.2, t: 'dark', solid: false });
    flag(L, ...F.at(2.2, 10.4), 1.6);
    crate(L, ...F.at(9.6, 9.6), 0.2, 1.0, { c: '#6a6a72' }); crate(L, ...F.at(10.7, 9.3), 0.7, 0.7, { c: '#6a6a72' }); barrel(L, ...F.at(9.3, 7.0));
    lampPost(L, ...F.at(8.4, 12.8));
    for (const [u, v] of [[6, 12.6], [10, 13], [13.4, 9], [4, 13.4], [metres(B.in.x0) - F.X + 2.6, metres(B.in.y0) - F.Z + 2.4]]) post(ctx, p, F, u, v, 'meridian');
    cacheAt(ctx, F, metres(B.in.x0) - F.X + 4.6, metres(B.in.y0) - F.Z + 0.9, 1);
    return { name: 'Meridian outpost', objective: [P(metres(B.in.x0) + 1.2), P(metres(B.in.y0) + 3.6)], boss: F.sim(8, 12) };
  },
  ruins(ctx, p) {
    const { L, rng, hollow } = ctx;
    const F = frameOf(p);
    const t = hollow ? 'hollow' : 'stone';
    const cx = F.W / 2, cz = F.D / 2;
    paint(L, p.tx + 6, p.ty + 5, p.tx + p.tw - 7, p.ty + p.th - 6, hollow ? GROUND.hollow : GROUND.paving);
    for (const [u, v] of [[-4.2, -2.6], [4.2, -2.6], [-4.2, 2.6], [4.2, 2.6]]) place(L, rng.chance(0.55) ? 'arena/column' : 'arena/column-damaged', ...F.at(cx + u, cz + v), { t, r: rng.next() * 6 });
    place(L, 'arena/statue', ...F.at(cx, cz - 2.8), { t, s: 1.1 });
    for (const [u, v, r] of [[-2.2, -3.4, 0], [2.6, 3.4, 0], [-5.4, 0, 1.57]]) if (rng.chance(0.8)) place(L, 'arena/wall', ...F.at(cx + u, cz + v), { t, r });
    place(L, 'arena/bricks', ...F.at(cx + 2.4, cz - 1), { t, r: 1 }); place(L, 'arena/bricks', ...F.at(cx - 3, cz + 1.6), { t, r: 2.4 });
    place(L, 'arena/block', ...F.at(cx + 5.6, cz - 0.4), { t, s: 0.9, r: 0.3 });
    post(ctx, p, F, cx - 1, cz + 0.6, 'any'); post(ctx, p, F, cx + 3.4, cz + 1.4, 'any'); post(ctx, p, F, cx + 0.6, cz + 3.6, 'hollow');
    cacheAt(ctx, F, cx + 0.2, cz - 1.2, 1);
    return { name: hollow ? 'Drowned ruins' : 'Old ruins', objective: F.sim(cx - 1.4, cz - 0.6), boss: F.sim(cx, cz + 1.6) };
  },
  wreck(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    const cx = F.W / 2, cz = F.D / 2;
    wagon(L, ...F.at(cx - 0.6, cz - 0.8), 0.9, { cover: true });
    crate(L, ...F.at(cx + 2.4, cz + 0.4), 0.5, 0.9); crate(L, ...F.at(cx + 3.1, cz + 1.5), 1.1, 0.7); crate(L, ...F.at(cx - 3, cz + 2), 0.2, 0.8);
    barrel(L, ...F.at(cx + 1.2, cz + 2.6));
    L.pieces.push({ m: '@cyl', x: F.X + cx - 2.6, y: 0.1, z: F.Z + cz - 2.6, sx: 0.62, sy: 0.12, sz: 0.62, r: 0.4, c: '#a9794b', c2: '#5c3e2a', seg: 10, axis: 'x' });
    post(ctx, p, F, cx + 2.6, cz + 3.6, 'outlaw'); post(ctx, p, F, cx - 2.6, cz + 3.8, 'outlaw');
    cacheAt(ctx, F, cx - 3.6, cz - 0.4, 0);
    return { name: 'Wrecked wagon', objective: F.sim(cx + 0.2, cz + 3.4), boss: F.sim(cx, cz + 4) };
  },
  depot(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    // a walled yard: the kit's walls without a roof
    const yard = building(L, rng, { x: p.tx + 2, y: p.ty + 1, mw: 10, md: 9, style: 'company', roof: false, floor: GROUND.gravel, doors: [{ side: 's', at: 4, wide: true }, { side: 'e', at: 4, wide: true }, { side: 'w', at: 2 }], windows: 0, name: 'Dry Fork depot' });
    for (let ty = yard.in.y0; ty <= yard.in.y1; ty++) for (let tx = yard.in.x0; tx <= yard.in.x1; tx++) L.keep[ty * L.w + tx] = 1;
    const yx = metres(yard.in.x0), yz = metres(yard.in.y0);
    const W = metres(yard.in.x1 + 1) - yx, D = metres(yard.in.y1 + 1) - yz;
    const wh = building(L, rng, { x: yard.in.x0 + 4, y: yard.in.y0 + 2, mw: 4, md: 2, style: 'company', sign: 'MERIDIAN FREIGHT', front: 's', doors: [{ side: 's', at: 1, wide: true }], windows: 0.4, lit: true, name: 'Depot warehouse' });
    railTrack(L, yx + 1, yz + D - 4.2, yx + W - 1, yz + D - 4.2);
    // cover in the yard: this is where the Foreman fights
    const cover = [[6, 12, 1.1], [7.2, 12.3, 0.8], [13, 14.4, 1.2], [20.6, 11.6, 1.1], [21.6, 12.6, 0.8], [10, 18.6, 1.0], [17.6, 18.2, 1.1], [24, 17.4, 1.0], [4.2, 17.6, 1.0]];
    for (const [u, v, s] of cover) crate(L, yx + u, yz + v, rng.next(), s, { c: '#6a6a72' });
    wagon(L, yx + 22.6, yz + 5, 1.57, { load: true });
    barrel(L, yx + 2.2, yz + 9.4); barrel(L, yx + 3.0, yz + 9.7); barrel(L, yx + 26.4, yz + 9.6);
    lampPost(L, yx + 3.4, yz + 13.6); lampPost(L, yx + 25.6, yz + 13.6); lampPost(L, yx + 14.4, yz + 22);
    flag(L, yx + 14.6, yz + 9.6, 1.8);
    const wx = metres(wh.in.x0), wz = metres(wh.in.y0);
    crate(L, wx + 1.2, wz + 1.2, 0.2, 1.1, { c: '#6a6a72' }); crate(L, wx + 9.6, wz + 1.4, 0.5, 1.0, { c: '#6a6a72' }); shelfWall(L, wx + 5.6, wz + 0.34, 0, 5);
    for (const [u, v] of [[8, 15], [19, 15.4], [5.4, 21], [23, 21.4], [14, 12.4], [3, 6], [25.4, 6.4], [14.4, 24.6], [wx - yx + 5.5, wz - yz + 3.4]]) ctx.posts.push({ x: P(yx + u), y: P(yz + v), faction: 'meridian', a: null, poi: 'depot' });
    ctx.caches.push({ x: P(wx + 3.2), y: P(wz + 4.2), tier: 2 }); ctx.caches.push({ x: P(yx + 26), y: P(yz + 2.2), tier: 1 });
    return { name: 'Dry Fork depot', objective: [P(wx + 5.6), P(wz + 3.2)], boss: [P(yx + W / 2), P(yz + 16)] };
  },
  heart(ctx, p) {
    const { L, rng } = ctx;
    const F = frameOf(p);
    const cx = F.W / 2, cz = F.D / 2;
    for (let ty = p.ty; ty < p.ty + p.th; ty++) for (let tx = p.tx; tx < p.tx + p.tw; tx++) {
      if (Math.hypot(centreM(tx) - F.X - cx, centreM(ty) - F.Z - cz) < 9.5) L.ground[ty * L.w + tx] = GROUND.hollow;
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      place(L, 'nat/statue_obelisk', ...F.at(cx + Math.cos(a) * 8.2, cz + Math.sin(a) * 8.2), { s: 1.5 + (k % 2) * 0.5, t: 'hollow', r: a });
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.8;
      place(L, 'nat/statue_ring', ...F.at(cx + Math.cos(a) * 4.4, cz + Math.sin(a) * 4.4), { s: 1.3, t: 'hollow', r: -a + 1.57 });
    }
    place(L, 'arena/block', ...F.at(cx, cz), { s: 0.9, t: 'hollow' });
    L.lights.push({ x: F.X + cx, y: 1.8, z: F.Z + cz, c: [0.62, 0.5, 1], r: 13, kind: 'glow' });
    for (let k = 0; k < 6; k++) { const a = rng.next() * TAU, d = 3 + rng.next() * 5; post(ctx, p, F, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 'hollow'); }
    cacheAt(ctx, F, cx + 6.4, cz + 1.2, 2);
    return { name: 'The Heart', objective: F.sim(cx, cz + 1.25), boss: F.sim(cx, cz + 4) };
  },
  camp_dead(ctx, p) {
    const { L, rng, hollow } = ctx;
    const F = frameOf(p);
    const cx = F.W / 2, cz = F.D / 2;
    tent(L, ...F.at(cx - 2.6, cz - 1.6), 0.6, 2); tent(L, ...F.at(cx + 2.4, cz - 2), -0.4, 1);
    campfire(L, ...F.at(cx, cz + 0.8), false);
    crate(L, ...F.at(cx + 3, cz + 1.8), 0.4, 0.8); place(L, 'nat/bed_floor', ...F.at(cx - 2.2, cz + 2.4), { r: 2, s: 1.2, solid: false });
    L.lights.push({ x: F.X + cx + 3, y: 1.0, z: F.Z + cz + 1.8, c: hollow ? [0.6, 0.5, 1] : [1, 0.7, 0.4], r: 7, kind: 'lantern' });
    post(ctx, p, F, cx - 0.6, cz + 2.6, 'hollow');
    cacheAt(ctx, F, cx + 0.6, cz - 1.8, 1); cacheAt(ctx, F, cx - 3.6, cz + 0.6, 0);
    return { name: 'Lost camp', objective: F.sim(cx + 1.4, cz + 0.2), boss: F.sim(cx, cz + 3) };
  },
};
