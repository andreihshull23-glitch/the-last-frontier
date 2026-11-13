// The Descent: one floor of rooms joined by corridors. Rooms seal when the
// drifter walks in and open again when everything inside is dead (see
// updateRooms in sim.js). Each floor has fights, a chest room, a shop, and a
// boss room with the lift down.
import { TILE, PX, MACRO, SOLID, BLOCKS_SHOT, ROCK, GROUND, LOOT_NAMES, DESCENT, GUNS, RELICS, ENEMIES } from '../content.js';
import { makeRng } from '../rng.js';
import { createLevel, skinRock, box, cyl, paint, reserve, addFlags, setTile, validateLevel, buildNav, floodFrom, tileCentre, WALL } from '../level.js';
import { TM } from './common.js';

const P = (m) => m * PX;
const TAU = Math.PI * 2;
const M = MACRO * TM; // one cell is 4 m

/** Colours and light for each floor. */
// The look is a frontier one first: timber, rust and lantern light. The machines and the ship show
// through it more the deeper you go, as dull copper trim on floor two and a dim glow on floor three.
export const FLOOR_LOOK = {
  works: {
    floor: GROUND.mine, wall: null, trim: '#7a5236', cover: '#8a6a4e', cover2: '#5c4632', pillar: '#6e4a30', lamp: [1, 0.74, 0.4], lampBox: '#f2c46a', timber: '#7a5236',
    ambient: { sky: '#8a7a6a', ground: '#5a4636', hemi: 0.7, sun: '#ffd9a8', sunI: 0.42, fog: '#1c1612', near: 26, far: 90 },
  },
  foundry: {
    // riveted iron plate gone to rust, shored with timber
    floor: GROUND.deck, stripe: GROUND.grate, wall: '#6a5446', wall2: '#3a2e26', trim: '#b8763a', cover: '#8a6a4e', cover2: '#4a382c', pillar: '#5a483c', lamp: [1, 0.7, 0.38], lampBox: '#f0b860', timber: '#6e4a30',
    rivets: '#8a7060', glowEvery: 0,
    ambient: { sky: '#9a8a78', ground: '#4a3c30', hemi: 0.74, sun: '#ffd9a8', sunI: 0.42, fog: '#191411', near: 26, far: 92 },
  },
  ship: {
    // the hull itself: dark ribbed metal, with the miners' timber and lanterns strung through it
    floor: GROUND.hull, stripe: GROUND.glow, wall: '#3c3e4c', wall2: '#22232e', trim: '#4f9aa6', cover: '#6a5a4a', cover2: '#3a3028', pillar: '#44465a', lamp: [1, 0.74, 0.42], lampBox: '#f0b860', timber: '#6e4a30',
    rivets: '#55586a', glowEvery: 3, glow: [0.45, 0.85, 0.95],
    ambient: { sky: '#8088a0', ground: '#3a3440', hemi: 0.72, sun: '#e8dcc8', sunI: 0.38, fog: '#121218', near: 26, far: 92 },
  },
};

export function generateDescent(spec) {
  const base = (spec.seed ?? 1) | 0;
  let last = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const L = build(spec, (base + attempt * 7919) | 0);
    if (!L) continue;
    const problems = validateLevel(L);
    if (!problems.length) { L.attempts = attempt + 1; return L; }
    last = problems;
  }
  throw new Error('Could not build a descent floor for seed ' + base + ': ' + (last ? last.join('; ') : 'layout never fit'));
}

function build(spec, seed) {
  const rng = makeRng(seed);
  const floorNo = Math.max(1, Math.min(DESCENT.floors.length, spec.floor || 1));
  const F = DESCENT.floors[floorNo - 1];
  const look = FLOOR_LOOK[F.theme];
  const [mw, mh] = F.size;
  const L = createLevel('descent', F.theme, mw, mh);
  L.seed = seed;
  L.rock.fill(1);
  const open = (x, y) => { if (x >= 1 && y >= 1 && x < mw - 1 && y < mh - 1) L.rock[y * mw + x] = 0; };

  // ---- rooms ---------------------------------------------------------------------
  const rooms = [];
  const fits = (x, y, w, h) => x >= 2 && y >= 2 && x + w <= mw - 2 && y + h <= mh - 2
    && rooms.every((r) => x + w + 1 <= r.x || r.x + r.w + 1 <= x || y + h + 1 <= r.y || r.y + r.h + 1 <= y);
  const add = (role, w, h, where) => {
    for (let i = 0; i < 120; i++) {
      const x = where ? where[0] : rng.int(2, mw - 2 - w), y = where ? where[1] : rng.int(2, mh - 2 - h);
      if (fits(x, y, w, h)) { rooms.push({ role, x, y, w, h }); return true; }
      if (where) return false;
    }
    return false;
  };
  if (!add('entrance', 3, 3, [Math.floor(mw / 2) - 1, mh - 5])) return null;
  if (!add('boss', 6, 5)) return null;
  if (!add('chest', 3, 3)) return null;
  if (!add('shop', 4, 3)) return null;
  const sizes = [[5, 4], [4, 4], [4, 5], [5, 5], [4, 4], [5, 4]];
  for (let k = 0; k < F.rooms - 4; k++) { const [w, h] = sizes[k % sizes.length]; add('combat', w, h); }
  if (rooms.filter((r) => r.role === 'combat').length < 2) return null;
  rooms.forEach((r, i) => { r.id = i; });
  const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const inRoom = (x, y) => rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) open(x, y);

  // ---- corridors: a spanning tree, so every room is on the way to somewhere ------------
  const edges = [];
  {
    const inTree = [0];
    while (inTree.length < rooms.length) {
      let best = null;
      for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
        if (inTree.includes(b)) continue;
        // the boss room hangs off the far end of the tree, never in the middle of it
        if (rooms[a].role === 'boss') continue;
        const d = dist(centre(rooms[a]), centre(rooms[b])) + (rooms[b].role === 'boss' ? 6 : 0);
        if (!best || d < best[2]) best = [a, b, d];
      }
      if (!best) return null;
      edges.push([best[0], best[1]]);
      inTree.push(best[1]);
    }
  }
  const corridor = new Set();
  for (const [ai, bi] of edges) {
    const a = centre(rooms[ai]).map(Math.floor), b = centre(rooms[bi]).map(Math.floor);
    let [x, y] = a;
    const step = (tx, ty) => { while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); open(x, y); if (!inRoom(x, y)) corridor.add(y * mw + x); } };
    if (rng.chance(0.5)) { step(b[0], y); step(b[0], b[1]); } else { step(x, b[1]); step(b[0], b[1]); }
  }

  // ---- walls ---------------------------------------------------------------------------
  for (const r of rooms) { r.tx = r.x * MACRO; r.ty = r.y * MACRO; r.tw = r.w * MACRO; r.th = r.h * MACRO; reserve(L, r.tx, r.ty, r.tx + r.tw - 1, r.ty + r.th - 1); }
  if (!look.wall) skinRock(L, rng, { tiers: false, roundChance: 0.3 });
  else {
    // built walls: flat panels with a lit strip, instead of rock
    for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
      if (!L.rock[my * mw + mx]) continue;
      for (let ty = my * MACRO; ty < (my + 1) * MACRO; ty++) for (let tx = mx * MACRO; tx < (mx + 1) * MACRO; tx++) setTile(L, tx, ty, WALL | ROCK, 44);
      const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = mx + dx, ny = my + dy;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh || L.rock[ny * mw + nx]) continue;
        const ex = cx + dx * (M / 2 - 0.12), ez = cz + dy * (M / 2 - 0.12);
        const along = dx === 0;
        box(L, ex, 0, ez, along ? M : 0.24, 4.4, along ? 0.24 : M, look.wall, { c2: look.wall2 });
        box(L, ex + dx * 0.14, 0, ez + dy * 0.14, along ? M : 0.1, 0.5, along ? 0.1 : M, look.wall2);
        box(L, ex + dx * 0.14, 3.1, ez + dy * 0.14, along ? M : 0.05, 0.07, along ? 0.05 : M, look.trim);
        // rivet bands and the odd patch plate
        for (const u of [-1.2, 1.2]) box(L, ex + dx * 0.14 + (along ? u : 0), 0.5, ez + dy * 0.14 + (along ? 0 : u), along ? 0.14 : 0.05, 2.6, along ? 0.05 : 0.14, look.rivets);
        if (rng.chance(0.3)) box(L, ex + dx * 0.16, 1.0, ez + dy * 0.16, along ? 1.1 : 0.06, 1.1, along ? 0.06 : 1.1, look.wall2, { c2: look.wall });
        // timber shoring against the plate, as in the works above
        if (rng.chance(0.35)) box(L, ex + dx * 0.3, 0, ez + dy * 0.3, 0.24, 4.3, 0.24, look.timber, { c2: look.cover2 });
      }
    }
  }
  for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
    const i = ty * L.w + tx;
    if (L.flags[i] & ROCK) continue;
    const seam = tx % MACRO === 0 || ty % MACRO === 0;
    const cell = Math.floor(tx / MACRO) + Math.floor(ty / MACRO);
    L.ground[i] = look.stripe === undefined || !seam ? look.floor : look.stripe === GROUND.glow ? (look.glowEvery && cell % look.glowEvery === 0 && (tx % MACRO === 0) ? GROUND.glow : GROUND.grate) : look.stripe;
  }

  // ---- what stands in a room -------------------------------------------------------------
  const lamp = (x, z, h = 3.6) => { L.lights.push({ x, y: h, z, c: look.lamp, r: 13, kind: 'lantern' }); box(L, x, h, z, 0.5, 0.14, 0.5, look.lampBox); };
  /** Low cover: stops bullets and bodies, but a jump clears it. */
  const cover = (x, z, sx, sz) => {
    box(L, x, 0, z, sx, 1.0, sz, look.cover, { c2: look.cover2, solid: true });
    box(L, x, 1.0, z, sx * 1.02, 0.07, sz * 1.02, look.cover2);
    box(L, x, 0.45, z, sx * 1.02, 0.08, sz * 1.02, look.cover2);
    for (let a = -sx / 2 + 0.125; a < sx / 2; a += 0.25) for (let b = -sz / 2 + 0.125; b < sz / 2; b += 0.25) addFlags(L, Math.floor((x + a) / TM), Math.floor((z + b) / TM), BLOCKS_SHOT, 10);
  };
  const pillar = (x, z) => {
    box(L, x, 0, z, 0.9, 4.4, 0.9, look.pillar, { c2: look.cover2, solid: 'wall' });
    box(L, x, 2.4, z, 1.02, 0.1, 1.02, look.cover2);
    box(L, x, 0, z, 1.1, 0.3, 1.1, look.cover2);
  };
  L.rooms = [];
  const rect = (r) => ({ X: r.tx * TM, Z: r.ty * TM, W: r.tw * TM, D: r.th * TM });
  const NAMES = { entrance: 'The lift', combat: null, chest: 'The strongroom', shop: 'The fence', boss: F.bossName ? 'The deep face' : F.theme === 'ship' ? 'The heart' : 'The line' };
  const COMBAT_NAMES = { works: ['The ore face', 'The timber yard', 'The powder store', 'The crusher', 'The sump', 'The cage room'], foundry: ['Assembly', 'The press floor', 'Core storage', 'The test range', 'Coolant bay', 'Dispatch'], ship: ['The ribs', 'The cold deck', 'The choir', 'The lens', 'The nursery', 'The wake'] }[F.theme];
  let combatNo = 0, liftAt = null;
  for (const r of rooms) {
    const f = rect(r), cx = f.X + f.W / 2, cz = f.Z + f.D / 2;
    const name = NAMES[r.role] || COMBAT_NAMES[combatNo++ % COMBAT_NAMES.length];
    L.zones.push({ name, x0: r.tx * TILE, y0: r.ty * TILE, x1: (r.tx + r.tw) * TILE, y1: (r.ty + r.th) * TILE, poi: r.role });
    lamp(cx, cz, 4.2);
    if (r.w >= 5) { lamp(cx - f.W / 4, cz); lamp(cx + f.W / 4, cz); }
    // doors: every corridor cell that touches this room gets sealed during a fight
    const sealRects = [];
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const edgeX = x === r.x - 1 || x === r.x + r.w, edgeY = y === r.y - 1 || y === r.y + r.h;
      if (edgeX === edgeY) continue; // inside, or a corner
      if (x < 0 || y < 0 || x >= mw || y >= mh || L.rock[y * mw + x]) continue;
      sealRects.push([x * MACRO, y * MACRO, (x + 1) * MACRO - 1, (y + 1) * MACRO - 1]);
    }
    const entry = { id: r.id, role: r.role, name, x0: r.tx * TILE, y0: r.ty * TILE, x1: (r.tx + r.tw) * TILE, y1: (r.ty + r.th) * TILE, seal: sealRects, waves: [] };
    L.rooms.push(entry);

    if (r.role === 'entrance') {
      paint(L, Math.floor((cx - 1.6) / TM), Math.floor((cz - 1.6) / TM), Math.floor((cx + 1.6) / TM), Math.floor((cz + 1.6) / TM), GROUND.plank);
      for (const [a, b] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) box(L, cx + a, 0, cz + b, 0.22, 4, 0.22, look.pillar);
      box(L, cx, 3.9, cz, 3.7, 0.18, 3.7, look.cover2);
      L.start = { x: P(cx), y: P(cz), a: -Math.PI / 2 };
    } else if (r.role === 'combat' || r.role === 'boss') {
      // cover laid out in a few patterns, always leaving lanes through the middle
      const style = r.role === 'boss' ? 3 : rng.int(0, 2);
      const qx = f.W / 4, qz = f.D / 4;
      if (style === 0) { for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cover(cx + a * qx, cz + b * qz, 2.0, 1.0); pillar(cx, cz); }
      else if (style === 1) { cover(cx - qx, cz, 1.0, 2.5); cover(cx + qx, cz, 1.0, 2.5); pillar(cx, cz - qz); pillar(cx, cz + qz); }
      else if (style === 2) { cover(cx, cz - qz, 2.5, 1.0); cover(cx, cz + qz, 2.5, 1.0); cover(cx - qx * 1.2, cz, 1.0, 1.5); cover(cx + qx * 1.2, cz, 1.0, 1.5); }
      else { for (const [a, b] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) pillar(cx + a * qx, cz + b * qz); cover(cx, cz - qz * 1.3, 3, 1.0); cover(cx, cz + qz * 1.3, 3, 1.0); }
      if (r.role === 'boss') liftAt = [P(cx), P(f.Z + 2.4)];
    } else if (r.role === 'chest') {
      box(L, cx, 0, cz, 2.2, 0.16, 2.2, look.trim);
      L.lights.push({ x: cx, y: 1.4, z: cz, c: [1, 0.85, 0.4], r: 9, kind: 'glow' });
      r.chest = [P(cx), P(cz)];
    } else if (r.role === 'shop') {
      box(L, cx, 0, f.Z + 1.4, f.W - 3, 0.9, 0.8, look.cover, { c2: look.cover2, solid: true });
      box(L, cx, 0.9, f.Z + 1.4, f.W - 2.8, 0.06, 0.9, look.cover2);
      r.wares = [-1, 0, 1].map((k) => [P(cx + k * 2.6), P(cz + 1.2)]);
      for (const [wx, wy] of r.wares) cyl(L, wx / PX, 0, wy / PX, 0.5, 0.25, look.cover2, { top: 0.42 });
    }
  }
  if (!L.start || !liftAt) return null;

  // corridor lights
  let n = 0;
  for (const i of corridor) {
    const cx = (i % mw + 0.5) * M, cz = (Math.floor(i / mw) + 0.5) * M;
    const mx = i % mw, my = Math.floor(i / mw);
    const alongX = !L.rock[my * mw + mx - 1] || !L.rock[my * mw + mx + 1];
    if (n % 2 === 0) lamp(cx, cz, 3.7);
    else if (look.timber) {
      // a timber set: two legs and a cap
      const [ax, az, bx, bz] = alongX ? [cx, cz - 1.7, cx, cz + 1.7] : [cx - 1.7, cz, cx + 1.7, cz];
      box(L, ax, 0, az, 0.26, 3.5, 0.26, look.timber, { c2: look.cover2 }); box(L, bx, 0, bz, 0.26, 3.5, 0.26, look.timber, { c2: look.cover2 });
      box(L, cx, 3.4, cz, alongX ? 0.3 : 3.7, 0.26, alongX ? 3.7 : 0.3, look.timber, { c2: look.cover2 });
    }
    if (look.glow && n % 5 === 2) L.lights.push({ x: cx, y: 0.6, z: cz, c: look.glow, r: 7, kind: 'glow' });
    n++;
  }

  // ---- who is waiting -----------------------------------------------------------------------
  const nav = buildNav(L);
  const reach = floodFrom(L, nav, L.start.x, L.start.y);
  const spot = (r, margin = 3) => {
    for (let i = 0; i < 80; i++) {
      const tx = rng.int(r.tx + margin, r.tx + r.tw - 1 - margin), ty = rng.int(r.ty + margin, r.ty + r.th - 1 - margin);
      const idx = ty * L.w + tx;
      if (!nav[idx] || reach[idx] < 0) continue;
      return [tileCentre(tx), tileCentre(ty)];
    }
    return null;
  };
  const kinds = Object.entries(F.mix);
  const pick = () => { let t = kinds.reduce((a, k) => a + k[1], 0) * rng.next(); for (const [k, w] of kinds) { t -= w; if (t <= 0) return k; } return kinds[0][0]; };
  const threat = F.threat * (spec.threat || 1);
  const order = rooms.filter((r) => r.role === 'combat').sort((a, b) => dist(centre(a), centre(rooms[0])) - dist(centre(b), centre(rooms[0])));
  order.forEach((r, k) => {
    const entry = L.rooms[r.id];
    const size = Math.min(7, Math.round((3 + k * 0.7 + (r.w * r.h > 18 ? 1 : 0)) * threat));
    const waves = rng.chance(0.55) || k >= 2 ? 2 : 1;
    for (let w = 0; w < waves; w++) {
      const wave = [];
      let heavy = 0;
      for (let i = 0; i < Math.max(2, w === 0 ? size : Math.ceil(size * 0.7)); i++) {
        let kind = pick();
        // at most one heavy unit and two turrets in a wave
        if (ENEMIES[kind].ai === 'charger' || ENEMIES[kind].rooted) { if (heavy >= (ENEMIES[kind].rooted ? 2 : 1)) kind = kinds[0][0]; else heavy++; }
        const at = spot(r);
        if (at) wave.push({ kind, x: at[0], y: at[1] });
      }
      if (wave.length) entry.waves.push(wave);
    }
  });
  {
    const r = rooms.find((q) => q.role === 'boss'), entry = L.rooms[r.id];
    const f = rect(r);
    const wave = [{ kind: F.boss, x: P(f.X + f.W / 2), y: P(f.Z + f.D / 2 - 1), target: true }];
    for (let i = 0; i < 2; i++) { const at = spot(r); if (at) wave.push({ kind: kinds[0][0], x: at[0], y: at[1] }); }
    entry.waves.push(wave);
  }

  // ---- what there is to find -------------------------------------------------------------------
  const pool = (spec.pool || []).filter((g) => GUNS[g]);
  const gunFor = (maxTier) => { const c = pool.filter((g) => (GUNS[g].tier || 1) <= maxTier); return c.length ? c[rng.int(0, c.length - 1)] : null; };
  const relicFor = (maxTier) => { const c = Object.keys(RELICS).filter((k) => RELICS[k].tier <= maxTier); return c[rng.int(0, c.length - 1)]; };
  for (const r of rooms) {
    if (r.chest) {
      const [x, y] = r.chest;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      addFlags(L, tx, ty, SOLID, 6);
      L.keep[ty * L.w + tx] = 1;
      L.items.push({ kind: 'cache', x: tileCentre(tx), y: tileCentre(ty), tier: 2, a: 0, loot: [{ name: LOOT_NAMES[rng.int(0, LOOT_NAMES.length - 1)], value: 20 + floorNo * 12 }], cartridges: 24, shells: 8, bandage: 1, dynamite: 1 });
    }
    if (r.wares) {
      const gun = gunFor(floorNo + 1), relic = relicFor(Math.min(3, floorNo + 1));
      const wares = [gun ? { gun, price: 30 + (GUNS[gun].tier || 1) * 18 } : { relic: relicFor(2), price: 50 }, { relic, price: 28 + RELICS[relic].tier * 18 }, { heal: 45, price: 22 }];
      wares.forEach((w, k) => L.items.push({ kind: 'ware', x: r.wares[k][0], y: r.wares[k][1], ...w }));
    }
  }
  L.items.push({ kind: 'exit', variant: 'lift', x: liftAt[0], y: liftAt[1], needsClear: true });

  L.name = F.name;
  L.clock = { start: 'none' };
  L.ambient = look.ambient;
  L.floor = floorNo;
  return L;
}
