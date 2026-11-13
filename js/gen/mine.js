// Underground levels: rooms joined by tunnels, dark, with one way in by the
// ore lift and a ladder up an air shaft at the far end. The upper works belong
// to claim jumpers; the deep rooms belong to whatever came up the shaft.
import { TILE, PX, MACRO, SOLID, ROCK, WATER, GROUND, LOOT_NAMES } from '../content.js';
import { makeRng } from '../rng.js';
import { createLevel, skinRock, place, box, cyl, paint, reserve, centreM, tileCentre, addFlags, setTile, validateLevel, inb, buildNav, floodFrom, WALL } from '../level.js';
import { scatter, clearAround, PEBBLES, TM } from './common.js';
import { barrel, crate, campfire, railTrack } from './props.js';

const P = (m) => m * PX;
const TAU = Math.PI * 2;
const M = MACRO * TM; // 4 m

export function generateMine(spec) {
  const base = (spec.seed ?? 1) | 0;
  let last = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const L = build(spec, (base + attempt * 7919) | 0);
    if (!L) continue;
    const problems = validateLevel(L);
    if (!problems.length) { L.attempts = attempt + 1; return L; }
    last = problems;
  }
  throw new Error('Could not build a mine for seed ' + base + ': ' + (last ? last.join('; ') : 'layout never fit'));
}

function lantern(L, x, z, c = [1, 0.72, 0.36]) {
  box(L, x, 0, z, 0.1, 1.9, 0.1, '#4a3a2e');
  box(L, x, 1.9, z, 0.26, 0.34, 0.26, '#f2c46a', { c2: '#e0a040' });
  L.lights.push({ x, y: 2.05, z, c, r: 10, kind: 'lantern' });
  addFlags(L, Math.floor(x / TM), Math.floor(z / TM), SOLID, 19);
}

function build(spec, seed) {
  const rng = makeRng(seed);
  const [mw, mh] = spec.size || [24, 22];
  const L = createLevel('mine', 'mine', mw, mh);
  L.seed = seed;
  L.dark = true;
  L.rock.fill(1);
  const open = (x, y) => { if (x >= 2 && y >= 2 && x < mw - 2 && y < mh - 2) L.rock[y * mw + x] = 0; };

  // ---- rooms -------------------------------------------------------------------
  const rooms = [];
  const fits = (x, y, w, h) => x >= 2 && y >= 2 && x + w <= mw - 2 && y + h <= mh - 2
    && rooms.every((r) => x + w + 1 <= r.x || r.x + r.w + 1 <= x || y + h + 1 <= r.y || r.y + r.h + 1 <= y);
  const ex = rng.int(4, mw - 7);
  rooms.push({ role: 'entrance', x: ex, y: mh - 4, w: 3, h: 2 });
  const sizes = [[4, 3], [3, 3], [4, 3], [3, 2], [3, 3], [2, 3], [3, 2], [4, 4]];
  for (const [w, h] of sizes) {
    for (let i = 0; i < 60; i++) {
      const x = rng.int(2, mw - 2 - w), y = rng.int(2, mh - 5 - h);
      if (fits(x, y, w, h)) { rooms.push({ role: null, x, y, w, h }); break; }
    }
  }
  if (rooms.length < 6) return null;
  const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) open(x, y);

  // ---- tunnels: spanning tree plus a loop or two --------------------------------
  const edges = [];
  {
    const inTree = [0];
    while (inTree.length < rooms.length) {
      let best = null;
      for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
        if (inTree.includes(b)) continue;
        const d = dist(centre(rooms[a]), centre(rooms[b]));
        if (!best || d < best[2]) best = [a, b, d];
      }
      edges.push([best[0], best[1]]);
      inTree.push(best[1]);
    }
    for (let k = 0, tries = 0; k < 2 && tries < 40; tries++) {
      const a = rng.int(1, rooms.length - 1), b = rng.int(1, rooms.length - 1);
      if (a === b || edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) continue;
      if (dist(centre(rooms[a]), centre(rooms[b])) > 11) continue;
      edges.push([a, b]); k++;
    }
  }
  const tunnels = [];
  for (const [ai, bi] of edges) {
    const a = centre(rooms[ai]).map(Math.floor), b = centre(rooms[bi]).map(Math.floor);
    const cells = [];
    let [x, y] = a;
    const xFirst = rng.chance(0.5);
    const walk = (tx, ty) => { while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); open(x, y); cells.push([x, y]); } };
    if (xFirst) { walk(b[0], y); walk(b[0], b[1]); } else { walk(x, b[1]); walk(b[0], b[1]); }
    tunnels.push(cells);
  }
  // dead-end drifts
  const drifts = [];
  for (let k = 0, tries = 0; k < 6 && tries < 200; tries++) {
    const cells = tunnels[rng.int(0, tunnels.length - 1)];
    if (!cells.length) continue;
    const [cx, cy] = cells[rng.int(0, cells.length - 1)];
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rng.int(0, 3)];
    const len = rng.int(2, 3);
    let ok = true;
    for (let s = 1; s <= len + 1 && ok; s++) {
      const x = cx + dx * s, y = cy + dy * s;
      if (x < 2 || y < 2 || x >= mw - 2 || y >= mh - 2 || !L.rock[y * mw + x]) ok = false;
      for (const [sx, sy] of [[dy, dx], [-dy, -dx]]) if (ok && s > 1 && !L.rock[(y + sy) * mw + x + sx]) ok = false;
    }
    if (!ok) continue;
    for (let s = 1; s <= len; s++) open(cx + dx * s, cy + dy * s);
    drifts.push([cx + dx * len, cy + dy * len]);
    k++;
  }

  // roles by depth from the entrance
  const depth = new Int32Array(mw * mh).fill(-1);
  {
    const q = [[Math.floor(centre(rooms[0])[0]), Math.floor(centre(rooms[0])[1])]];
    depth[q[0][1] * mw + q[0][0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh || L.rock[ny * mw + nx] || depth[ny * mw + nx] >= 0) continue;
        depth[ny * mw + nx] = depth[y * mw + x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  const roomDepth = (r) => depth[Math.floor(centre(r)[1]) * mw + Math.floor(centre(r)[0])];
  const byDepth = rooms.slice(1).sort((a, b) => roomDepth(a) - roomDepth(b));
  if (byDepth.some((r) => roomDepth(r) < 0)) return null;
  byDepth[byDepth.length - 1].role = 'vault';
  byDepth[byDepth.length - 2].role = 'shaft';
  const upper = ['camp', 'store', 'ore'], lower = ['nest', 'flooded', 'nest', 'ore'];
  byDepth.slice(0, -2).forEach((r, k, arr) => { r.role = k < Math.ceil(arr.length / 2) ? upper[k % upper.length] : lower[(k - Math.ceil(arr.length / 2)) % lower.length]; });
  const maxDepth = roomDepth(byDepth[byDepth.length - 1]);

  for (const r of rooms) { r.tx = r.x * MACRO; r.ty = r.y * MACRO; r.tw = r.w * MACRO; r.th = r.h * MACRO; reserve(L, r.tx, r.ty, r.tx + r.tw - 1, r.ty + r.th - 1); }
  skinRock(L, rng, { tiers: false, roundChance: 0.6 });

  for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
    const i = ty * L.w + tx;
    if (!(L.flags[i] & ROCK)) L.ground[i] = GROUND.mine;
  }

  // ---- fit out the rooms ------------------------------------------------------------
  const posts = [], caches = [];
  const F = (r) => ({ X: r.tx * TM, Z: r.ty * TM, W: r.tw * TM, D: r.th * TM });
  let vault = null, shaft = null, start = null, liftAt = null, ladderAt = null;
  const nestSpots = [];
  for (const r of rooms) {
    const f = F(r), cx = f.X + f.W / 2, cz = f.Z + f.D / 2;
    const zoneName = { entrance: 'The adit', camp: "Jumpers' camp", store: 'Powder store', ore: 'Ore face', nest: 'The nest', flooded: 'Flooded gallery', vault: 'The lower gate', shaft: 'Air shaft' }[r.role];
    L.zones.push({ name: zoneName, x0: r.tx * TILE, y0: r.ty * TILE, x1: (r.tx + r.tw) * TILE, y1: (r.ty + r.th) * TILE, poi: r.role });
    if (r.role === 'entrance') {
      paint(L, Math.floor((cx - 1.5) / TM), Math.floor((cz - 1.5) / TM), Math.floor((cx + 1.5) / TM), Math.floor((cz + 1.5) / TM), GROUND.plank);
      for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { box(L, cx + a, 0, cz + b, 0.24, 3.4, 0.24, '#7a5236', { c2: '#4a3220' }); addFlags(L, Math.floor((cx + a) / TM), Math.floor((cz + b) / TM), WALL, 34); }
      box(L, cx, 3.3, cz, 3.4, 0.2, 3.4, '#6e4a30', { c2: '#4a3220' });
      box(L, cx, 3.5, cz, 0.3, 2.5, 0.3, '#3a3a42');
      lantern(L, cx - 3.4, cz - 1.6); lantern(L, cx + 3.6, cz + 1.2);
      crate(L, cx + 3.2, cz - 2.2, 0.3, 0.9); barrel(L, cx - 3.6, cz + 2.4);
      liftAt = [P(cx), P(cz)];
      start = { x: P(cx), y: P(cz - 2.6), a: -Math.PI / 2 };
    } else if (r.role === 'camp') {
      paint(L, r.tx + 4, r.ty + 4, r.tx + r.tw - 5, r.ty + r.th - 5, GROUND.camp);
      campfire(L, cx, cz, true);
      place(L, 'nat/bed_floor', cx - 2.6, cz - 1.6, { r: 0.6, s: 1.2, solid: false }); place(L, 'nat/bed_floor', cx + 2.4, cz - 2.2, { r: -0.5, s: 1.2, solid: false });
      place(L, 'nat/bed_floor', cx - 1.8, cz + 2.6, { r: 2.2, s: 1.2, solid: false });
      crate(L, cx + 4.2, cz + 1.6, 0.4, 1.0); crate(L, cx + 4.4, cz + 2.7, 1.0, 0.7); barrel(L, cx - 4.6, cz + 0.6);
      for (const [u, v] of [[-2, 1.2], [2.2, 1], [0.4, -2.4], [3.6, -0.6], [-3.8, -2.2]]) posts.push({ x: P(cx + u), y: P(cz + v), faction: 'outlaw', depth: roomDepth(r) });
      caches.push({ x: P(cx - 4.6), y: P(cz - 2.6), tier: 1 });
    } else if (r.role === 'store') {
      for (let k = 0; k < 5; k++) barrel(L, f.X + 1.6 + (k % 3) * 0.95, f.Z + 1.6 + Math.floor(k / 3) * 0.95, { c: '#8e3428' });
      crate(L, f.X + f.W - 1.8, f.Z + 1.8, 0.2, 1.1); crate(L, f.X + f.W - 1.9, f.Z + 3.0, 0.6, 0.8);
      lantern(L, cx, f.Z + 1.2);
      for (const [u, v] of [[0, 1.5], [-2.4, 0.4], [2.6, 1.8]]) posts.push({ x: P(cx + u), y: P(cz + v), faction: 'outlaw', depth: roomDepth(r), prefer: 'dynamiter' });
      caches.push({ x: P(f.X + f.W - 1.6), y: P(f.Z + f.D - 1.6), tier: 1, dynamite: 2 });
    } else if (r.role === 'ore') {
      for (const [u, v, s] of [[-3.2, -2.4, 1.2], [3.4, -2.6, 1.0], [-3.6, 2.2, 0.9], [2.6, 2.6, 1.3]]) {
        if (Math.abs(u) < f.W / 2 - 1.6 && Math.abs(v) < f.D / 2 - 1.6) place(L, rng.chance(0.5) ? 'nat/rock_largeA' : 'nat/rock_largeD', cx + u, cz + v, { s, r: rng.next() * 6 });
      }
      // an ore cart
      box(L, cx + 0.2, 0.35, cz + 0.4, 1.2, 0.7, 1.9, '#5a5a62', { c2: '#3a3a42', solid: true, r: 0.3 });
      box(L, cx + 0.2, 1.0, cz + 0.4, 1.0, 0.25, 1.6, '#8a6a4e', { r: 0.3 });
      lantern(L, f.X + 1.3, cz);
      for (const [u, v] of [[-1.6, 1.4], [1.8, -1.2], [0, 2.6]]) posts.push({ x: P(cx + u), y: P(cz + v), faction: roomDepth(r) < maxDepth * 0.55 ? 'outlaw' : 'hollow', depth: roomDepth(r) });
      caches.push({ x: P(cx - 0.4), y: P(cz - 2.2), tier: 0 });
    } else if (r.role === 'nest') {
      for (let k = 0; k < 10; k++) place(L, rng.chance(0.5) ? 'nat/mushroom_redGroup' : 'nat/mushroom_tanTall', f.X + 1.5 + rng.next() * (f.W - 3), f.Z + 1.5 + rng.next() * (f.D - 3), { solid: false, s: 1.2 + rng.next() * 1.6, t: 'hollow_glow', r: rng.next() * 6 });
      L.lights.push({ x: cx, y: 0.8, z: cz, c: [0.55, 0.42, 1], r: 9, kind: 'glow' });
      for (let k = 0; k < 5; k++) { const a = rng.next() * TAU, d = 1 + rng.next() * Math.min(f.W, f.D) * 0.3; posts.push({ x: P(cx + Math.cos(a) * d), y: P(cz + Math.sin(a) * d), faction: 'hollow', depth: roomDepth(r) }); }
      caches.push({ x: P(cx + 0.6), y: P(cz - 0.4), tier: 1 });
    } else if (r.role === 'flooded') {
      const wx0 = r.tx + 6, wy0 = r.ty + 6, wx1 = r.tx + r.tw - 7, wy1 = r.ty + r.th - 7;
      const bridge = Math.floor((wx0 + wx1) / 2);
      for (let ty = wy0; ty <= wy1; ty++) for (let tx = wx0; tx <= wx1; tx++) {
        if (Math.abs(tx - bridge) <= 1) { L.ground[ty * L.w + tx] = GROUND.plank; continue; }
        setTile(L, tx, ty, SOLID | WATER, 0, GROUND.water);
      }
      lantern(L, f.X + 1.4, f.Z + 1.4);
      posts.push({ x: P(cx), y: P(f.Z + 1.6), faction: 'hollow', depth: roomDepth(r) }); posts.push({ x: P(cx), y: P(f.Z + f.D - 1.6), faction: 'hollow', depth: roomDepth(r) });
      caches.push({ x: P(f.X + f.W - 1.6), y: P(f.Z + 1.6), tier: 1 });
    } else if (r.role === 'vault') {
      paint(L, r.tx + 4, r.ty + 4, r.tx + r.tw - 5, r.ty + r.th - 5, GROUND.paving);
      for (const [u, v] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) if (Math.abs(u) < f.W / 2 - 1.5 && Math.abs(v) < f.D / 2 - 1.5) place(L, 'arena/column', cx + u, cz + v, { t: 'hollow' });
      // the lower gate: bars set in the far wall, and the key on a block before it
      place(L, 'cave/gate-metal-bars', cx, f.Z + 0.75, { solid: false, s: 0.9 });
      place(L, 'cave/gate-metal-bars#gate', cx - 0.05, f.Z + 0.75, { solid: false, s: 0.9 });
      place(L, 'arena/block', cx, cz - 0.6, { s: 0.55, t: 'hollow' });
      L.lights.push({ x: cx, y: 1.6, z: cz - 0.6, c: [0.6, 0.48, 1], r: 11, kind: 'glow' });
      vault = { objective: [P(cx), P(cz + 0.55)], boss: [P(cx), P(cz + 2.6)], name: zoneName };
      for (const [u, v] of [[-2.2, 1.6], [2.4, 1.2], [0, 3.2], [-2.6, -1.6], [2.6, -1.8]]) posts.push({ x: P(cx + u), y: P(cz + v), faction: 'hollow', depth: roomDepth(r) });
      caches.push({ x: P(cx + f.W / 2 - 1.5), y: P(cz + f.D / 2 - 1.5), tier: 2 });
    } else if (r.role === 'shaft') {
      place(L, 'cave/ladder', cx, f.Z + 0.25, { s: 1.5, solid: false });
      place(L, 'cave/ladder', cx, f.Z + 0.25, { y: 4.2, s: 1.5, solid: false });
      L.lights.push({ x: cx, y: 3.4, z: f.Z + 1.6, c: [0.75, 0.86, 1], r: 13, kind: 'shaft' });
      crate(L, cx + 2.2, f.Z + 1.5, 0.3, 0.8);
      ladderAt = [P(cx), P(f.Z + 1.25)];
      shaft = r;
      caches.push({ x: P(cx - 2.4), y: P(f.Z + 1.6), tier: 0 });
    }
  }
  if (!vault || !ladderAt || !start) return null;
  L.start = start;
  for (const [dx, dy] of drifts) caches.push({ x: P((dx + 0.5) * M + rng.range(-0.6, 0.6)), y: P((dy + 0.5) * M + rng.range(-0.6, 0.6)), tier: rng.chance(0.4) ? 1 : 0 });

  // timber sets and lanterns along the tunnels; rails on the first run
  const inRoom = (x, y) => rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  tunnels.forEach((cells, ti) => {
    cells.forEach(([x, y], k) => {
      if (inRoom(x, y)) return;
      const prev = cells[k - 1] || cells[k + 1] || [x, y + 1];
      const alongX = prev[0] !== x;
      const cx = (x + 0.5) * M, cz = (y + 0.5) * M;
      if (k % 2 === 0) {
        // a timber set: two legs and a cap
        const [ax, az, bx, bz] = alongX ? [cx, cz - 1.75, cx, cz + 1.75] : [cx - 1.75, cz, cx + 1.75, cz];
        box(L, ax, 0, az, 0.26, 3.3, 0.26, '#7a5236', { c2: '#4a3220' }); box(L, bx, 0, bz, 0.26, 3.3, 0.26, '#7a5236', { c2: '#4a3220' });
        box(L, cx, 3.2, cz, alongX ? 0.3 : 3.9, 0.28, alongX ? 3.9 : 0.3, '#6e4a30', { c2: '#4a3220' });
        addFlags(L, Math.floor(ax / TM), Math.floor(az / TM), WALL, 33); addFlags(L, Math.floor(bx / TM), Math.floor(bz / TM), WALL, 33);
      }
      if (k % 4 === 1) {
        const [lx, lz] = alongX ? [cx + 1, cz - 1.7] : [cx - 1.7, cz + 1];
        box(L, lx, 1.9, lz, 0.26, 0.34, 0.26, '#f2c46a', { c2: '#e0a040' });
        L.lights.push({ x: lx, y: 2.05, z: lz, c: [1, 0.7, 0.34], r: 8, kind: 'lantern' });
      }
    });
  });
  if (tunnels[0] && tunnels[0].length > 2) {
    const cells = tunnels[0];
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1], b = cells[k];
      if (inRoom(a[0], a[1]) && inRoom(b[0], b[1])) continue;
      railTrack(L, (a[0] + 0.5) * M, (a[1] + 0.5) * M, (b[0] + 0.5) * M, (b[1] + 0.5) * M);
    }
  }

  // ---- the job -------------------------------------------------------------------------
  const o = spec.objective || {};
  if (o.kind === 'item') L.items.push({ kind: 'objective', item: o.item, x: vault.objective[0], y: vault.objective[1], role: 'primary', zone: vault.name });
  L.items.push({ kind: 'exit', variant: 'lift', x: liftAt[0], y: liftAt[1] });
  L.items.push({ kind: 'exit', variant: 'ladder', x: ladderAt[0], y: ladderAt[1] });

  // ---- who is down here ----------------------------------------------------------------
  const nav = buildNav(L);
  const reach = floodFrom(L, nav, L.start.x, L.start.y);
  const freeSpot = (minStart, wantDeep) => {
    for (let i = 0; i < 400; i++) {
      const tx = rng.int(16, L.w - 17), ty = rng.int(16, L.h - 17);
      if (!clearAround(L, tx, ty, 2, true) || reach[ty * L.w + tx] < 0) continue;
      const d = depth[Math.floor(ty / MACRO) * mw + Math.floor(tx / MACRO)];
      if (wantDeep !== null && (wantDeep ? d < maxDepth * 0.45 : d > maxDepth * 0.6)) continue;
      const x = tileCentre(tx), y = tileCentre(ty);
      if (Math.hypot(x - L.start.x, y - L.start.y) < minStart) continue;
      return [x, y];
    }
    return null;
  };
  const threat = spec.threat ?? 1;
  const used = new Set();
  for (const [kind, n] of Object.entries(spec.mix || {})) {
    const hollow = kind === 'husk' || kind === 'walker';
    const count = Math.max(1, Math.round(n * threat));
    for (let k = 0; k < count; k++) {
      let at = null;
      if (kind === 'brute') at = vault.boss;
      else {
        const cands = posts.filter((q) => !used.has(q) && (hollow ? q.faction === 'hollow' : q.faction === 'outlaw') && Math.hypot(q.x - L.start.x, q.y - L.start.y) > P(16));
        const pref = cands.filter((q) => q.prefer === kind);
        const pool = pref.length ? pref : cands;
        if (pool.length && rng.chance(0.85)) { const q = pool[rng.int(0, pool.length - 1)]; used.add(q); at = [q.x, q.y]; }
        else at = freeSpot(P(18), hollow);
      }
      if (!at) continue;
      L.spawns.push({ kind, x: at[0], y: at[1], dormant: hollow });
    }
  }

  // ---- what there is to find --------------------------------------------------------------
  const worth = 1.3 + (spec.tier ?? 0) * 0.25;
  for (const c of caches) {
    const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
    if (!inb(L, tx, ty) || L.flags[ty * L.w + tx] & SOLID) continue;
    addFlags(L, tx, ty, SOLID, 6);
    L.keep[ty * L.w + tx] = 1;
    const n = c.tier === 2 ? 3 : c.tier === 1 ? 2 : 1;
    const loot = [];
    for (let k = 0; k < n; k++) loot.push({ name: LOOT_NAMES[rng.int(0, LOOT_NAMES.length - 1)], value: Math.round((10 + rng.next() * 16 + c.tier * 14) * worth) });
    L.items.push({
      kind: 'cache', x: tileCentre(tx), y: tileCentre(ty), tier: c.tier, a: rng.next() * TAU, loot,
      cartridges: rng.chance(0.75) ? rng.int(10, 18) : 0, shells: rng.chance(0.4) ? rng.int(4, 8) : 0,
      bandage: rng.chance(0.3) ? 1 : 0, dynamite: c.dynamite || (rng.chance(0.2) ? 1 : 0),
    });
  }

  scatter(L, rng, Math.round((mw * mh) / 4), PEBBLES, { onKeep: true });
  L.name = spec.name || 'The Calloway Mine';
  L.clock = { start: 'none' };
  return L;
}
