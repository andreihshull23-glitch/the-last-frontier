// The level format and the helpers every generator uses to fill it.
//
// A level is static: it is rebuilt from (generator spec, seed) and never saved.
// Units: tiles are half a metre; `pieces` (what the renderer draws) are in
// metres; spawns, items and zones are in sim units (32 per metre).

import { TILE, PX, MACRO, SOLID, OPAQUE, BLOCKS_SHOT, ROCK, INDOOR, GROUND } from './content.js';
import { MODEL_FOOT, MODEL_BOX, FOOT_RES } from './data/models.js';

export const WALL = SOLID | OPAQUE | BLOCKS_SHOT;
export const MODULE = 6;             // building module, in tiles (3 m)
const TM = TILE / PX;                // metres per tile

export function createLevel(kind, theme, mw, mh) {
  const w = mw * MACRO, h = mh * MACRO;
  return {
    kind, theme, mw, mh, w, h,
    flags: new Uint8Array(w * h),
    ground: new Uint8Array(w * h),
    hgt: new Uint8Array(w * h),       // obstacle height, decimetres
    roofId: new Uint8Array(w * h),    // building interior -> roof index + 1
    rock: new Uint8Array(mw * mh),    // canyon cells: 0 open, 1 rock, 2 high rock
    keep: new Uint8Array(w * h),      // generator scratch: 1 = do not scatter here
    pieces: [], glass: [], roofs: [], doors: [], signs: [], lights: [],
    spawns: [], npcs: [], items: [], zones: [], patrols: [],
    start: { x: 0, y: 0, a: 0 },
    name: '', clock: null, dark: false,
  };
}

export const tileCentre = (t) => (t + 0.5) * TILE;      // sim units
export const metres = (t) => t * TM;                    // tile edge -> metres
export const centreM = (t) => (t + 0.5) * TM;           // tile centre -> metres
export const inb = (L, tx, ty) => tx >= 0 && ty >= 0 && tx < L.w && ty < L.h;

export function setTile(L, tx, ty, flags, hgt = 0, ground = -1) {
  if (!inb(L, tx, ty)) return;
  const i = ty * L.w + tx;
  L.flags[i] = flags;
  L.hgt[i] = hgt;
  if (ground >= 0) L.ground[i] = ground;
}
export function addFlags(L, tx, ty, flags, hgt = 0) {
  if (!inb(L, tx, ty)) return;
  const i = ty * L.w + tx;
  L.flags[i] |= flags;
  if (hgt > L.hgt[i]) L.hgt[i] = hgt;
}
export function paint(L, tx0, ty0, tx1, ty1, ground) {
  for (let ty = Math.max(0, ty0); ty <= Math.min(L.h - 1, ty1); ty++) {
    for (let tx = Math.max(0, tx0); tx <= Math.min(L.w - 1, tx1); tx++) L.ground[ty * L.w + tx] = ground;
  }
}
export function reserve(L, tx0, ty0, tx1, ty1) {
  for (let ty = Math.max(0, ty0); ty <= Math.min(L.h - 1, ty1); ty++) {
    for (let tx = Math.max(0, tx0); tx <= Math.min(L.w - 1, tx1); tx++) L.keep[ty * L.w + tx] = 1;
  }
}
export const solidTile = (L, tx, ty) => !inb(L, tx, ty) || (L.flags[ty * L.w + tx] & SOLID) !== 0;
export function freeRect(L, tx0, ty0, tx1, ty1) {
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!inb(L, tx, ty) || L.flags[ty * L.w + tx] & SOLID || L.keep[ty * L.w + tx]) return false;
  }
  return true;
}

// ---- model placement -------------------------------------------------------

/** Mark the tiles a model stands on. `mode`: 'auto' (from its shape), 'low' (bodies only), 'wall'. */
export function stamp(L, m, x, z, r = 0, s = 1, mode = 'auto') {
  const f = MODEL_FOOT[m];
  if (!f) return;
  const [fx0, fz0, fw, fh, cells] = f;
  const box = MODEL_BOX[m];
  const top = Math.min(255, Math.round((box ? box[4] : 1) * (Array.isArray(s) ? s[1] : s) * 10));
  const sx = Array.isArray(s) ? s[0] : s, sz = Array.isArray(s) ? s[2] : s;
  const c = Math.cos(r), sn = Math.sin(r);
  const sub = Math.max(1, Math.ceil((FOOT_RES * Math.max(sx, sz)) / 0.3));
  for (let j = 0; j < fh; j++) {
    for (let i = 0; i < fw; i++) {
      const d = cells.charCodeAt(j * fw + i) - 48;
      if (!(d & 1)) continue;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
        const lx = (fx0 + (i + (a + 0.5) / sub) * FOOT_RES) * sx, lz = (fz0 + (j + (b + 0.5) / sub) * FOOT_RES) * sz;
        const wx = x + lx * c + lz * sn, wz = z - lx * sn + lz * c;
        const tall = mode === 'wall' || (mode === 'auto' && d === 3);
        addFlags(L, Math.floor(wx / TM), Math.floor(wz / TM), tall ? WALL : SOLID, top);
      }
    }
  }
}

/** Add a model to the level (metres). Options: y, r, s, t (tint), shade, solid ('auto' | 'low' | 'wall' | false), centre, to (list). */
export function place(L, m, x, z, o = {}) {
  if (o.centre) {
    // some kit pieces are modelled against a tile edge; put their middle on (x, z)
    const b = MODEL_BOX[m], sc = o.s || 1, r = o.r || 0;
    const cx = ((b[0] + b[3]) / 2) * (Array.isArray(sc) ? sc[0] : sc), cz = ((b[2] + b[5]) / 2) * (Array.isArray(sc) ? sc[2] : sc);
    x -= cx * Math.cos(r) + cz * Math.sin(r);
    z -= -cx * Math.sin(r) + cz * Math.cos(r);
  }
  const p = { m, x, y: o.y || 0, z, r: o.r || 0, s: o.s || 1 };
  if (o.t) p.t = o.t;
  if (o.shade) p.shade = o.shade;
  (o.to || L.pieces).push(p);
  if (o.solid !== false) stamp(L, m, x, z, p.r, p.s, o.solid || 'auto');
  return p;
}

/** A coloured box (metres, centred on x/z, sitting on y). c: top colour, c2: bottom colour (hex strings). */
export function box(L, x, y, z, sx, sy, sz, c, o = {}) {
  const p = { m: '@box', x, y, z, sx, sy, sz, r: o.r || 0, c, c2: o.c2 || null };
  (o.to || L.pieces).push(p);
  if (o.solid) {
    const cs = Math.cos(p.r), sn = Math.sin(p.r);
    for (let a = -sx / 2 + 0.125; a < sx / 2; a += 0.25) for (let b = -sz / 2 + 0.125; b < sz / 2; b += 0.25) {
      addFlags(L, Math.floor((x + a * cs + b * sn) / TM), Math.floor((z - a * sn + b * cs) / TM), o.solid === 'wall' ? WALL : SOLID, Math.round((y + sy) * 10));
    }
  }
  return p;
}
export function cyl(L, x, y, z, radius, height, c, o = {}) {
  const p = { m: '@cyl', x, y, z, sx: radius, sy: height, sz: o.top ?? radius, r: 0, c, c2: o.c2 || null, seg: o.seg || 10 };
  (o.to || L.pieces).push(p);
  if (o.solid) {
    for (let a = -radius + 0.125; a < radius; a += 0.25) for (let b = -radius + 0.125; b < radius; b += 0.25) {
      if (a * a + b * b <= radius * radius) addFlags(L, Math.floor((x + a) / TM), Math.floor((z + b) / TM), o.solid === 'wall' ? WALL : SOLID, Math.round((y + height) * 10));
    }
  }
  return p;
}

// ---- canyon rock -----------------------------------------------------------

const CORNER = MODEL_FOOT['cave/template-corner'];
// first occupied column of each footprint row: everything from there to +x is rock
const CORNER_START = (() => {
  if (!CORNER) return null;
  const [, , w, h, cells] = CORNER;
  const out = [];
  for (let j = 0; j < h; j++) {
    let first = w;
    for (let i = 0; i < w; i++) if (cells[j * w + i] !== '0') { first = i; break; }
    out.push(first);
  }
  return out;
})();

export const isRock = (L, mx, my) => mx < 0 || my < 0 || mx >= L.mw || my >= L.mh || L.rock[my * L.mw + mx] > 0;

/** Turn the macro rock mask into tiles and wall pieces. `rng` varies the pieces. */
export function skinRock(L, rng, o = {}) {
  const { mw, mh } = L;
  const M = MACRO * TM; // 4 m
  // second tier: rock cells whose whole neighbourhood is rock
  if (o.tiers !== false) {
    for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
      if (!L.rock[my * mw + mx]) continue;
      let deep = true;
      for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (!isRock(L, mx + dx, my + dy)) { deep = false; break; }
      if (deep && rng.chance(0.8)) L.rock[my * mw + mx] = 2;
    }
  }
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    const tier = L.rock[my * mw + mx];
    if (!tier) continue;
    for (let ty = my * MACRO; ty < (my + 1) * MACRO; ty++) for (let tx = mx * MACRO; tx < (mx + 1) * MACRO; tx++) {
      setTile(L, tx, ty, WALL | ROCK, tier === 2 ? 80 : 40);
    }
    const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
    const sides = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];
    for (const [dx, dy, r] of sides) {
      const nx = mx + dx, ny = my + dy;
      const other = nx < 0 || ny < 0 || nx >= mw || ny >= mh ? tier : L.rock[ny * mw + nx];
      const ex = cx + dx * M / 2, ez = cz + dy * M / 2;
      const shade = 0.93 + rng.next() * 0.14;
      if (other === 0) {
        const roll = rng.next();
        if (roll < 0.16) place(L, 'cave/template-wall-detail-a', ex, ez, { r, solid: false, shade });
        else if (roll < 0.3) {
          const ox = Math.cos(r), oz = -Math.sin(r); // local +x in world
          place(L, 'cave/template-wall-half', ex - ox, ez - oz, { r, solid: false, shade });
          place(L, 'cave/template-wall-half', ex + ox, ez + oz, { r, solid: false, shade: shade * 0.96 });
        } else place(L, 'cave/template-wall', ex, ez, { r, solid: false, shade });
        if (tier === 2) place(L, 'cave/template-wall', ex, ez, { r, y: 4, solid: false, shade: shade * 1.04 });
      } else if (other === 1 && tier === 2) {
        place(L, 'cave/template-wall', ex, ez, { r, y: 4, solid: false, shade: shade * 1.04 });
      }
    }
  }
  // rounded inner corners
  if (o.round !== false && CORNER_START) {
    const quads = [[1, 1, 0], [1, -1, Math.PI / 2], [-1, -1, Math.PI], [-1, 1, -Math.PI / 2]];
    for (let my = 1; my < mh - 1; my++) for (let mx = 1; mx < mw - 1; mx++) {
      if (L.rock[my * mw + mx]) continue;
      const fits = quads.filter(([dx, dy]) => isRock(L, mx + dx, my) && isRock(L, mx, my + dy) && !isRock(L, mx - dx, my) && !isRock(L, mx, my - dy));
      if (fits.length !== 1 || !rng.chance(o.roundChance ?? 0.75)) continue;
      if (L.keep[(my * MACRO + 4) * L.w + mx * MACRO + 4]) continue;
      const [, , r] = fits[0];
      roundCorner(L, mx, my, r, rng);
    }
  }
}

const BLOCK_NEON = ['#ff3fa4', '#3fe0ff', '#a070ff', '#ffb43f', '#5dff9a'];
const BLOCK_SIGNS = ['cyber/sign-small-1', 'cyber/sign-small-2', 'cyber/sign-small-3', 'cyber/sign-4', 'cyber/sign-1', 'cyber/sign-2', 'cyber/sign-3'];
/**
 * City blocks: the same macro mask as skinRock, built instead of grown. Plated walls with a line of
 * neon along the top, signs and lit windows, and taller towers where the block is deep.
 */
export function skinBlocks(L, rng, o = {}) {
  const { mw, mh } = L;
  const M = MACRO * TM, LOW = 4.4, HIGH = 8.2;
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    if (!L.rock[my * mw + mx]) continue;
    let deep = true;
    for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (!isRock(L, mx + dx, my + dy)) { deep = false; break; }
    if (deep && rng.chance(0.8)) L.rock[my * mw + mx] = 2;
  }
  const glow = (...a) => { const p = box(L, ...a); p.glow = true; return p; };
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    const tier = L.rock[my * mw + mx];
    if (!tier) continue;
    for (let ty = my * MACRO; ty < (my + 1) * MACRO; ty++) for (let tx = mx * MACRO; tx < (mx + 1) * MACRO; tx++) setTile(L, tx, ty, WALL | ROCK, tier === 2 ? HIGH * 10 : LOW * 10);
    const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
    const neon = BLOCK_NEON[((mx >> 2) * 7 + (my >> 2) * 13) % BLOCK_NEON.length];
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = mx + dx, ny = my + dy;
      if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
      const other = L.rock[ny * mw + nx];
      const along = dx === 0;
      const ex = cx + dx * (M / 2 - 0.12), ez = cz + dy * (M / 2 - 0.12);
      if (other === 0) {
        const roll = rng.next();
        const kind = roll < 0.12 ? 'scifi/wallband-straight-broken' : roll < 0.4 ? 'scifi/wallastra-straight-flat' : 'scifi/wallband-straight';
        place(L, kind, cx + dx * M, cz + dy * M, { r: Math.atan2(-dy, dx), s: [1, 1.47, 1], t: o.tint || 'deckwall', solid: false, shade: 0.9 + rng.next() * 0.2 });
        box(L, ex, 0, ez, along ? M : 0.2, LOW, along ? 0.2 : M, '#0e0f18');
        if (rng.chance(0.7)) glow(ex + dx * 0.16, LOW - 0.16, ez + dy * 0.16, along ? M : 0.07, 0.07, along ? 0.07 : M, neon);
        const fx = cx + dx * (M / 2 + 0.26), fz = cz + dy * (M / 2 + 0.26), face = Math.atan2(dx, dy);
        const pick = rng.next();
        if (pick < 0.13) {
          const m = BLOCK_SIGNS[rng.int(0, BLOCK_SIGNS.length - 1)];
          const p = place(L, m, fx, fz, { y: 2.2 + rng.next() * 0.9, r: face, t: 'neonsign', solid: false }); p.glow = true;
          L.lights.push({ x: fx + dx * 0.6, y: 2.6, z: fz + dy * 0.6, c: [[1, 0.25, 0.64], [0.25, 0.88, 1], [0.63, 0.44, 1]][rng.int(0, 2)], r: 8, kind: 'neon' });
        } else if (pick < 0.2) place(L, 'cyber/ac-stacked', fx + dx * 0.3, fz + dy * 0.3, { y: 2.6, r: face, t: 'street', solid: false, s: 0.8 });
        else if (pick < 0.26) place(L, 'cyber/cable-small', fx, fz, { y: LOW, r: face, t: 'street', solid: false });
      }
      if (tier === 2 && other !== 2) {
        // the tower above the street wall
        box(L, ex, LOW, ez, along ? M : 0.2, HIGH - LOW, along ? 0.2 : M, '#12131d');
        for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) {
          if (!rng.chance(0.3)) continue;
          const off = (k - 1) * 1.2, wy = LOW + 0.7 + row * 1.6;
          glow(ex + dx * 0.12 + (along ? off : 0), wy, ez + dy * 0.12 + (along ? 0 : off), along ? 0.7 : 0.05, 0.9, along ? 0.05 : 0.7, rng.chance(0.7) ? '#ffcf7a' : rng.chance(0.5) ? '#7fe6ff' : '#ff7ac0');
        }
        if (rng.chance(0.5)) glow(ex + dx * 0.14, HIGH - 0.14, ez + dy * 0.14, along ? M : 0.07, 0.07, along ? 0.07 : M, neon);
      }
    }
  }
}

function roundCorner(L, mx, my, r, rng) {
  const M = MACRO * TM;
  const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
  const c = Math.cos(r), sn = Math.sin(r);
  // refuse if anything already stands where the rock will go
  const tiles = [];
  for (let ty = my * MACRO; ty < (my + 1) * MACRO; ty++) for (let tx = mx * MACRO; tx < (mx + 1) * MACRO; tx++) {
    const wx = centreM(tx) - cx, wz = centreM(ty) - cz;
    const lx = wx * c - wz * sn, lz = wx * sn + wz * c; // inverse of the piece rotation
    const row = Math.min(15, Math.max(0, Math.floor((lz + 2) / FOOT_RES))), col = Math.floor((lx + 2) / FOOT_RES);
    if (col >= CORNER_START[row] - 1) {
      if (L.keep[ty * L.w + tx]) return;
      tiles.push([tx, ty]);
    }
  }
  for (const [tx, ty] of tiles) setTile(L, tx, ty, WALL | ROCK, 40);
  place(L, 'cave/template-corner', cx, cz, { r, solid: false, shade: 0.95 + rng.next() * 0.1 });
}

// ---- buildings -------------------------------------------------------------

const SIDE = {
  n: { dx: 1, dy: 0, nx: 0, ny: -1, r: Math.PI / 2 },
  s: { dx: 1, dy: 0, nx: 0, ny: 1, r: -Math.PI / 2 },
  w: { dx: 0, dy: 1, nx: -1, ny: 0, r: Math.PI },
  e: { dx: 0, dy: 1, nx: 1, ny: 0, r: 0 },
};

/**
 * A rectangular building from the modular kit. Wall lines run through tile
 * centres, so the visible wall sits in the middle of its half-metre of collision.
 *   x, y     tile of the north-west wall corner
 *   mw, md   size in 3 m modules
 *   doors    [{ side: 'n'|'s'|'e'|'w', at: module index, leaf: bool, wide: bool }]
 *   windows  [{ side, at }] or a number 0..1 (chance per free module)
 *   style    tint name for the walls; roof: false to leave it open
 * Returns the tile rect, interior rect, door positions (sim units) and the roof record.
 */
export function building(L, rng, o) {
  const { x, y, mw, md } = o;
  const x1 = x + mw * MODULE, y1 = y + md * MODULE;
  const style = o.style || 'wood';
  const X0 = centreM(x), X1 = centreM(x1), Z0 = centreM(y), Z1 = centreM(y1);
  const H = 3.6;
  const floor = o.floor ?? GROUND.wood;
  const roof = o.roof === false ? null : { id: L.roofs.length + 1, x0: X0, z0: Z0, x1: X1, z1: Z1, pieces: [], glass: [] };
  if (roof) L.roofs.push(roof);

  // tiles: ring, interior
  for (let ty = y; ty <= y1; ty++) for (let tx = x; tx <= x1; tx++) {
    const edge = tx === x || tx === x1 || ty === y || ty === y1;
    if (!inb(L, tx, ty)) continue;
    const i = ty * L.w + tx;
    L.keep[i] = 1;
    if (edge) { L.flags[i] = WALL; L.hgt[i] = 36; L.ground[i] = floor; }
    else { L.flags[i] = INDOOR; L.hgt[i] = 0; L.ground[i] = floor; if (roof) L.roofId[i] = roof.id; }
  }

  const used = new Set();
  const doors = [];
  const sideLen = (s) => (s === 'n' || s === 's' ? mw : md);
  const modulePos = (s, at) => {
    const S = SIDE[s];
    const tx = s === 'e' ? x1 : x, ty = s === 's' ? y1 : y;
    // tile at the centre of this module
    const cx = tx + S.dx * (at * MODULE + MODULE / 2), cy = ty + S.dy * (at * MODULE + MODULE / 2);
    return { S, cx, cy, mx: centreM(cx), mz: centreM(cy) };
  };
  for (const d of o.doors || []) {
    const { S, cx, cy, mx, mz } = modulePos(d.side, d.at);
    used.add(d.side + d.at);
    // a wide opening spans two modules and is centred on the seam between them
    const mid = d.wide ? 3 : 0;
    const half = d.wide ? 4 : 1;
    for (let k = mid - half; k <= mid + half; k++) setTile(L, cx + S.dx * k, cy + S.dy * k, INDOOR, 0, floor);
    if (d.wide) {
      place(L, 'bk/wall-doorway-wide-square', mx + S.dx * 1.5, mz + S.dy * 1.5, { r: S.r, t: style, solid: false });
      used.add(d.side + (d.at + 1));
    } else place(L, 'bk/wall-doorway-square', mx, mz, { r: S.r, t: style, solid: false });
    if (d.leaf) {
      // hinge at one jamb; the leaf lies along the wall
      L.doors.push({ m: 'bk/door-rotate-square-' + (d.kind || 'a') + '#door', x: mx - S.dx * 0.675, z: mz - S.dy * 0.675, r: S.dx ? Math.PI / 2 : 0, swing: S.dx ? S.ny : -S.nx, cx: mx, cz: mz, t: o.doorTint || null });
    }
    const dcx = cx + S.dx * mid, dcy = cy + S.dy * mid;
    const out = { x: tileCentre(dcx) + S.nx * TILE * 3, y: tileCentre(dcy) + S.ny * TILE * 3, ix: tileCentre(dcx) - S.nx * TILE * 3, iy: tileCentre(dcy) - S.ny * TILE * 3, nx: S.nx, ny: S.ny, side: d.side };
    doors.push(out);
    // keep the doorstep clear
    reserve(L, Math.min(dcx + S.nx, dcx + S.nx * 5) - half - 1, Math.min(dcy + S.ny, dcy + S.ny * 5) - half - 1, Math.max(dcx + S.nx, dcx + S.nx * 5) + half + 1, Math.max(dcy + S.ny, dcy + S.ny * 5) + half + 1);
  }
  const windowList = Array.isArray(o.windows) ? o.windows : [];
  if (typeof o.windows === 'number') {
    for (const s of ['n', 's', 'e', 'w']) for (let at = 0; at < sideLen(s); at++) {
      if (!used.has(s + at) && rng.chance(o.windows)) windowList.push({ side: s, at });
    }
  }
  for (const wd of windowList) {
    if (used.has(wd.side + wd.at)) continue;
    used.add(wd.side + wd.at);
    const { S, cx, cy, mx, mz } = modulePos(wd.side, wd.at);
    place(L, 'bk/wall-window-square', mx, mz, { r: S.r, t: style, solid: false });
    if (o.glass !== false) L.glass.push({ m: 'bk/wall-window-square#glass', x: mx, y: 0, z: mz, r: S.r });
    if (o.boarded && rng.chance(o.boarded)) place(L, 'bk/barricade-window-b', mx + S.nx * 0.1, mz + S.ny * 0.1, { r: S.r + Math.PI, y: 1.1, solid: false });
    else for (let k = -1; k <= 1; k++) setTile(L, cx + S.dx * k, cy + S.dy * k, SOLID, 11, floor); // see and shoot through
    if (o.lit) L.lights.push({ x: mx + S.nx * 0.4, y: 1.9, z: mz + S.ny * 0.4, c: [1, 0.78, 0.5], r: 5, kind: 'window' });
  }
  for (const s of ['n', 's', 'e', 'w']) for (let at = 0; at < sideLen(s); at++) {
    if (used.has(s + at)) continue;
    const { S, mx, mz } = modulePos(s, at);
    place(L, 'bk/wall', mx, mz, { r: S.r, t: style, solid: false });
  }
  for (const [cx, cz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) place(L, 'bk/column-thin', cx, cz, { t: style, solid: false });

  if (roof) {
    const to = roof.pieces;
    for (let j = 0; j < md; j++) for (let i = 0; i < mw; i++) {
      const px = X0 + 1.5 + i * 3, pz = Z0 + 1.5 + j * 3;
      const w = i === 0, e = i === mw - 1, n = j === 0, s = j === md - 1;
      let m = 'bk/roof-flat-center', r = 0;
      if ((w || e) && (n || s)) { m = 'bk/roof-flat-corner'; r = e && s ? 0 : e && n ? Math.PI / 2 : w && n ? Math.PI : -Math.PI / 2; }
      else if (e) { m = 'bk/roof-flat-side'; r = 0; } else if (w) { m = 'bk/roof-flat-side'; r = Math.PI; }
      else if (s) { m = 'bk/roof-flat-side'; r = -Math.PI / 2; } else if (n) { m = 'bk/roof-flat-side'; r = Math.PI / 2; }
      place(L, m, px, pz, { y: H, r, t: o.roofStyle || 'roof', solid: false, to });
    }
    if (o.front) {
      // false front: a taller facade and a sign over the door side
      const S = SIDE[o.front];
      const len = sideLen(o.front);
      for (let at = 0; at < len; at++) {
        const { mx, mz } = modulePos(o.front, at);
        place(L, 'bk/wall-low', mx + S.nx * 0.02, mz + S.ny * 0.02, { y: H, r: S.r, t: style, solid: false, to });
        place(L, 'bk/wall-low', mx - S.nx * 0.02, mz - S.ny * 0.02, { y: H, r: S.r + Math.PI, t: style, solid: false, to });
      }
      if (o.sign) {
        const mid = modulePos(o.front, (len - 1) / 2);
        L.signs.push({ text: o.sign, x: mid.mx + S.nx * 0.14, y: H + 0.95, z: mid.mz + S.ny * 0.14, nx: S.nx, nz: S.ny, w: Math.min(len * 3 - 1.2, 2 + o.sign.length * 0.62), h: 1.25, roof: roof.id, glow: true, bg: '#0a0b14', fg: o.signColor || (style === 'company' ? '#dfe8ff' : '#ff3fa4') });
      }
    }
  }
  if (o.porch) {
    // covered boardwalk along one side
    const S = SIDE[o.porch];
    const len = sideLen(o.porch) * 3, depth = 2.25;
    const mid = modulePos(o.porch, (sideLen(o.porch) - 1) / 2);
    const px = mid.mx + S.nx * (depth / 2 + 0.1), pz = mid.mz + S.ny * (depth / 2 + 0.1);
    const along = S.dx ? [len + 0.6, depth] : [depth, len + 0.6];
    box(L, px, 2.95, pz, along[0], 0.14, along[1], '#2a2d40', { c2: '#1a1c2a', to: roof ? roof.porch = roof.porch || [] : L.pieces });
    for (let k = 0; k <= sideLen(o.porch); k++) {
      const t = -len / 2 + k * 3;
      box(L, mid.mx + S.dx * t + S.nx * (depth + 0.05), 0, mid.mz + S.dy * t + S.ny * (depth + 0.05), 0.18, 2.95, 0.18, '#3c4060', { c2: '#1a1c2a' });
    }
    const tx0 = Math.floor((mid.mx - (S.dx ? len / 2 : 0) + (S.nx < 0 ? -depth : S.nx > 0 ? 0.25 : 0)) / TM);
    const ty0 = Math.floor((mid.mz - (S.dy ? len / 2 : 0) + (S.ny < 0 ? -depth : S.ny > 0 ? 0.25 : 0)) / TM);
    paint(L, tx0, ty0, tx0 + Math.round((S.dx ? len : depth) / TM) - 1, ty0 + Math.round((S.dy ? len : depth) / TM) - 1, GROUND.plank);
  }
  if (o.name) L.zones.push({ name: o.name, x0: x * TILE, y0: y * TILE, x1: (x1 + 1) * TILE, y1: (y1 + 1) * TILE, indoor: true });
  return {
    x, y, x1, y1, doors, roof,
    in: { x0: x + 1, y0: y + 1, x1: x1 - 1, y1: y1 - 1 },
    cx: tileCentre((x + x1) / 2), cy: tileCentre((y + y1) / 2),
    X0, X1, Z0, Z1,
  };
}

// ---- reachability ------------------------------------------------------------

/** Tiles a body can stand on: free, with free neighbours on all eight sides. */
export function buildNav(L) {
  const { w, h, flags } = L;
  const nav = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (flags[(y + dy) * w + x + dx] & SOLID) { ok = false; break; }
    nav[y * w + x] = ok ? 1 : 0;
  }
  return nav;
}

/** Flood fill over nav tiles from a sim-unit position. Returns a distance field (-1 = unreachable). */
export function floodFrom(L, nav, px, py) {
  const { w, h } = L;
  const dist = new Int32Array(w * h).fill(-1);
  let start = Math.floor(py / TILE) * w + Math.floor(px / TILE);
  if (!nav[start]) start = nearestNav(L, nav, start);
  if (start < 0) return dist;
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  q[tail++] = start; dist[start] = 0;
  while (head < tail) {
    const cur = q[head++];
    const cx = cur % w, cy = (cur - cx) / w;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] >= 0 || !nav[ni]) continue;
      dist[ni] = dist[cur] + 1;
      q[tail++] = ni;
    }
  }
  return dist;
}

export function nearestNav(L, nav, idx, maxR = 6) {
  const { w, h } = L;
  if (idx < 0) return -1;
  if (nav[idx]) return idx;
  const x0 = idx % w, y0 = Math.floor(idx / w);
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (nav[y * w + x]) return y * w + x;
    }
  }
  return -1;
}

/** Everything a level promises: start, exits and objectives reachable; returns a list of problems. */
export function validateLevel(L) {
  const problems = [];
  const nav = buildNav(L);
  const dist = floodFrom(L, nav, L.start.x, L.start.y);
  const reach = (x, y) => {
    const i = nearestNav(L, nav, Math.floor(y / TILE) * L.w + Math.floor(x / TILE), 3);
    return i >= 0 && dist[i] >= 0;
  };
  if (!reach(L.start.x, L.start.y)) problems.push('start is walled in');
  for (const it of L.items) if (!reach(it.x, it.y)) problems.push(`${it.kind}${it.item ? ':' + it.item : ''} unreachable at ${Math.round(it.x / PX)},${Math.round(it.y / PX)}`);
  for (const sp of L.spawns) if (!reach(sp.x, sp.y)) problems.push(`${sp.kind} spawn unreachable at ${Math.round(sp.x / PX)},${Math.round(sp.y / PX)}`);
  for (const n of L.npcs) if (!n.fixed && !reach(n.x, n.y)) problems.push(`npc ${n.role} unreachable`);
  return problems;
}
