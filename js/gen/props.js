// Compound props assembled from kit models and coloured boxes: horses,
// wagons, lamp posts, graves. All positions are metres; `r` rotates about Y.
import { box, cyl, place, addFlags, WALL } from '../level.js';
import { SOLID, TILE, PX } from '../content.js';

const TM = TILE / PX;
const WOOD = '#8a623c', WOOD_D = '#5c3e2a', WOOD_L = '#a9794b', IRON = '#4a4a52', IRON_D = '#2e2e36';

// local (a, b) -> world, for a prop at (x, z) rotated r
function rot(x, z, r, a, b) {
  const c = Math.cos(r), s = Math.sin(r);
  return [x + a * c + b * s, z - a * s + b * c];
}
function solidDisc(L, x, z, radius, tall = false, hgt = 10) {
  for (let a = -radius; a <= radius; a += 0.25) for (let b = -radius; b <= radius; b += 0.25) {
    if (a * a + b * b <= radius * radius) addFlags(L, Math.floor((x + a) / TM), Math.floor((z + b) / TM), tall ? WALL : SOLID, hgt);
  }
}
function solidBox(L, x, z, r, sx, sz, tall = false, hgt = 10) {
  for (let a = -sx / 2 + 0.12; a < sx / 2; a += 0.24) for (let b = -sz / 2 + 0.12; b < sz / 2; b += 0.24) {
    const [wx, wz] = rot(x, z, r, a, b);
    addFlags(L, Math.floor(wx / TM), Math.floor(wz / TM), tall ? WALL : SOLID, hgt);
  }
}

export function horse(L, x, z, r, coat = '#7a4e30', o = {}) {
  const dark = '#3b2a20';
  const b = (a, y, bb, sx, sy, sz, c, c2) => { const [wx, wz] = rot(x, z, r, a, bb); box(L, wx, y, wz, sx, sy, sz, c, { r, c2, to: o.to }); };
  b(0, 0.95, 0, 0.62, 0.62, 1.55, coat, shadeHex(coat, 0.78));          // barrel
  b(0, 1.35, 0.78, 0.36, 0.72, 0.42, coat, shadeHex(coat, 0.8));         // neck
  b(0, 1.82, 1.06, 0.3, 0.34, 0.66, coat, shadeHex(coat, 0.85));         // head
  b(0, 1.86, 1.36, 0.24, 0.2, 0.16, dark);                                // muzzle
  b(0.1, 2.16, 0.86, 0.07, 0.16, 0.07, coat); b(-0.1, 2.16, 0.86, 0.07, 0.16, 0.07, coat); // ears
  b(0, 1.5, 0.6, 0.1, 0.62, 0.34, dark);                                  // mane
  for (const [la, lb] of [[0.2, 0.58], [-0.2, 0.58], [0.2, -0.58], [-0.2, -0.58]]) b(la, 0, lb, 0.17, 0.98, 0.19, shadeHex(coat, 0.86), dark);
  b(0, 0.82, -0.86, 0.12, 0.66, 0.12, dark);                              // tail
  if (o.saddle !== false) {
    b(0, 1.57, -0.05, 0.66, 0.1, 0.62, '#5b3a26', '#3b2518');
    b(0, 1.6, -0.34, 0.5, 0.16, 0.1, '#5b3a26');
    b(0.34, 1.05, -0.05, 0.05, 0.5, 0.36, '#6a4630');                     // saddle bag
    b(-0.34, 1.05, -0.05, 0.05, 0.5, 0.36, '#6a4630');
  }
  if (o.solid !== false) solidBox(L, x, z, r, 0.8, 2.1, false, 16);
}

function shadeHex(hex, k) {
  const c = [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export { shadeHex };

export function wagon(L, x, z, r, o = {}) {
  const cover = o.cover;
  const b = (a, y, bb, sx, sy, sz, c, c2) => { const [wx, wz] = rot(x, z, r, a, bb); box(L, wx, y, wz, sx, sy, sz, c, { r, c2 }); };
  b(0, 0.7, 0, 1.5, 0.16, 3.0, WOOD, WOOD_D);                // bed
  b(0.72, 0.86, 0, 0.08, 0.55, 3.0, WOOD_L, WOOD);            // sides
  b(-0.72, 0.86, 0, 0.08, 0.55, 3.0, WOOD_L, WOOD);
  b(0, 0.86, 1.46, 1.5, 0.55, 0.08, WOOD_L, WOOD);
  b(0, 0.86, -1.46, 1.5, 0.55, 0.08, WOOD_L, WOOD);
  b(0, 0.55, 2.2, 0.1, 0.1, 1.5, WOOD_D);                     // tongue
  for (const [wa, wb] of [[0.86, 1.0], [-0.86, 1.0], [0.86, -1.0], [-0.86, -1.0]]) {
    const [wx, wz] = rot(x, z, r, wa, wb);
    L.pieces.push({ m: '@cyl', x: wx, y: 0.62, z: wz, sx: 0.62, sy: 0.12, sz: 0.62, r, c: WOOD_L, c2: WOOD_D, seg: 10, axis: 'x' });
  }
  if (cover) {
    for (let k = -1; k <= 1; k++) b(0, 1.4, k * 1.0, 1.56, 0.9, 0.96, '#e4d8bc', '#c9b99a');
    b(0, 2.3, 0, 1.2, 0.2, 2.9, '#ece2c8', '#d8cbae');
  } else if (o.load) {
    b(0.2, 0.86, 0.5, 0.7, 0.5, 0.8, '#9a7a52', '#6e5536');
    b(-0.25, 0.86, -0.6, 0.6, 0.62, 0.7, '#8a6a44', '#5e4830');
  }
  if (o.solid !== false) solidBox(L, x, z, r, 1.9, 3.2, Boolean(cover), cover ? 24 : 14);
}

export function coach(L, x, z, r) {
  const b = (a, y, bb, sx, sy, sz, c, c2) => { const [wx, wz] = rot(x, z, r, a, bb); box(L, wx, y, wz, sx, sy, sz, c, { r, c2 }); };
  b(0, 0.8, 0, 1.5, 0.14, 3.0, IRON_D);                       // chassis
  b(0, 0.94, 0, 1.6, 1.45, 2.1, '#8e3428', '#6a2219');        // cabin
  b(0, 2.39, 0, 1.75, 0.12, 2.3, '#3b2a20');                  // roof
  b(0.81, 1.55, 0, 0.03, 0.55, 0.8, '#d8c39a');               // windows
  b(-0.81, 1.55, 0, 0.03, 0.55, 0.8, '#d8c39a');
  b(0, 1.45, 1.35, 1.3, 0.12, 0.55, WOOD, WOOD_D);            // driver's bench
  b(0, 0.94, 1.5, 1.4, 0.6, 0.25, WOOD_D);
  b(0, 2.5, -0.2, 1.1, 0.35, 0.9, '#6a4630', '#4a3020');      // luggage
  for (const [wa, wb, rad] of [[0.9, 1.05, 0.55], [-0.9, 1.05, 0.55], [0.9, -0.9, 0.72], [-0.9, -0.9, 0.72]]) {
    const [wx, wz] = rot(x, z, r, wa, wb);
    L.pieces.push({ m: '@cyl', x: wx, y: rad, z: wz, sx: rad, sy: 0.12, sz: rad, r, c: '#c9a05a', c2: '#7a5a30', seg: 12, axis: 'x' });
  }
  solidBox(L, x, z, r, 2.0, 3.3, true, 25);
}

export function barrel(L, x, z, o = {}) {
  cyl(L, x, 0, z, 0.38, 0.95, o.c || '#9a6e44', { c2: '#6a4a2e', top: 0.34, seg: 8 });
  cyl(L, x, 0.93, z, 0.3, 0.03, '#5c3e2a', { seg: 8 });
  if (o.solid !== false) solidDisc(L, x, z, 0.36, false, 10);
}

export function crate(L, x, z, r = 0, size = 0.9, o = {}) {
  box(L, x, o.y || 0, z, size, size * 0.85, size, o.c || '#a47a4c', { r, c2: '#77552f' });
  box(L, x, (o.y || 0) + size * 0.85, z, size * 1.04, 0.05, size * 1.04, '#8a623c', { r });
  if (o.solid !== false && !o.y) solidBox(L, x, z, r, size, size, false, Math.round(size * 9));
}

export function hitchRail(L, x, z, r, len = 3) {
  const b = (a, y, bb, sx, sy, sz, c, c2) => { const [wx, wz] = rot(x, z, r, a, bb); box(L, wx, y, wz, sx, sy, sz, c, { r, c2 }); };
  b(-len / 2, 0, 0, 0.16, 1.1, 0.16, WOOD, WOOD_D);
  b(len / 2, 0, 0, 0.16, 1.1, 0.16, WOOD, WOOD_D);
  b(0, 0.95, 0, len + 0.3, 0.12, 0.12, WOOD_L, WOOD);
  solidBox(L, x, z, r, len, 0.3, false, 11);
}

export function lampPost(L, x, z, o = {}) {
  box(L, x, 0, z, 0.16, 3.0, 0.16, '#4a3a2e', { c2: '#2e241c' });
  box(L, x + 0.28, 2.85, z, 0.6, 0.08, 0.08, '#4a3a2e');
  box(L, x + 0.52, 2.42, z, 0.24, 0.36, 0.24, '#f2c46a', { c2: '#e0a040' });
  box(L, x + 0.52, 2.78, z, 0.3, 0.06, 0.3, '#2e241c');
  L.lights.push({ x: x + 0.52, y: 2.6, z, c: [1, 0.74, 0.38], r: o.r || 9, kind: 'lantern' });
  addFlags(L, Math.floor(x / TM), Math.floor(z / TM), SOLID, 30);
}

export function trough(L, x, z, r = 0) {
  box(L, x, 0, z, 2.2, 0.55, 0.8, WOOD, { r, c2: WOOD_D });
  box(L, x, 0.5, z, 1.96, 0.06, 0.58, '#4f93a6', { r });
  solidBox(L, x, z, r, 2.2, 0.8, false, 6);
}

export function well(L, x, z) {
  cyl(L, x, 0, z, 1.0, 0.85, '#a09a92', { c2: '#77716b', seg: 10 });
  cyl(L, x, 0.84, z, 0.78, 0.03, '#35596a', { seg: 10 });
  box(L, x - 0.95, 0, z, 0.16, 2.5, 0.16, WOOD, { c2: WOOD_D });
  box(L, x + 0.95, 0, z, 0.16, 2.5, 0.16, WOOD, { c2: WOOD_D });
  box(L, x, 2.45, z, 2.5, 0.16, 1.5, '#7a4a34', { c2: '#5c3526' });
  box(L, x, 1.9, z, 1.9, 0.1, 0.1, WOOD_D);
  solidDisc(L, x, z, 1.05, false, 9);
}

export function waterTower(L, x, z) {
  for (const [a, b] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) {
    box(L, x + a, 0, z + b, 0.24, 5.2, 0.24, WOOD, { c2: WOOD_D });
    addFlags(L, Math.floor((x + a) / TM), Math.floor((z + b) / TM), WALL, 60);
  }
  box(L, x, 2.4, z, 2.6, 0.14, 0.14, WOOD_D); box(L, x, 2.4, z, 0.14, 0.14, 2.6, WOOD_D);
  box(L, x, 5.1, z, 3.0, 0.2, 3.0, WOOD_L, { c2: WOOD });
  cyl(L, x, 5.3, z, 1.55, 2.4, '#9a6e44', { c2: '#6a4a2e', seg: 12 });
  cyl(L, x, 7.7, z, 1.75, 0.9, '#6e4a36', { c2: '#7a5440', top: 0.1, seg: 12 });
}

export function grave(L, x, z, r = 0, kind = 0) {
  if (kind === 0) {
    box(L, x, 0, z, 0.12, 1.15, 0.12, '#b9a98c', { r, c2: '#8a7a62' });
    box(L, x, 0.72, z, 0.66, 0.12, 0.12, '#b9a98c', { r });
  } else {
    box(L, x, 0, z, 0.62, 0.8, 0.16, '#a09a92', { r, c2: '#77716b' });
    box(L, x, 0.78, z, 0.5, 0.12, 0.16, '#a8a29a', { r });
  }
  // the mound
  const [mx, mz] = rot(x, z, r, 0, 1.0);
  box(L, mx, 0, mz, 0.9, 0.16, 1.8, '#b98a62', { r, c2: '#a5774f' });
}

export function jobBoard(L, x, z, r) {
  const b = (a, y, bb, sx, sy, sz, c, c2) => { const [wx, wz] = rot(x, z, r, a, bb); box(L, wx, y, wz, sx, sy, sz, c, { r, c2 }); };
  b(-0.9, 0, 0, 0.14, 2.3, 0.14, WOOD, WOOD_D);
  b(0.9, 0, 0, 0.14, 2.3, 0.14, WOOD, WOOD_D);
  b(0, 1.0, 0, 1.9, 1.15, 0.08, '#6e4a30', '#5c3e2a');
  b(0, 2.2, 0, 2.2, 0.12, 0.3, '#5c3e2a');
  const notes = [[-0.55, 1.5, '#ece2c8'], [0.05, 1.62, '#e4d2a0'], [0.55, 1.42, '#ece2c8'], [-0.3, 1.12, '#d8c39a'], [0.4, 1.08, '#ece2c8']];
  for (const [a, y, c] of notes) b(a, y, 0.06, 0.4, 0.34, 0.02, c);
  solidBox(L, x, z, r, 2.0, 0.3, false, 23);
}

export function archGate(L, x, z, r, span = 7, text = 'MERCY') {
  const [ax, az] = rot(x, z, r, -span / 2, 0), [bx, bz] = rot(x, z, r, span / 2, 0);
  box(L, ax, 0, az, 0.4, 5.2, 0.4, WOOD, { c2: WOOD_D });
  box(L, bx, 0, bz, 0.4, 5.2, 0.4, WOOD, { c2: WOOD_D });
  box(L, x, 4.9, z, span + 1.2, 0.36, 0.36, WOOD_L, { r, c2: WOOD });
  addFlags(L, Math.floor(ax / TM), Math.floor(az / TM), WALL, 52);
  addFlags(L, Math.floor(bx / TM), Math.floor(bz / TM), WALL, 52);
  const nx = Math.sin(r), nz = Math.cos(r);
  L.signs.push({ text, x: x + nx * 0.22, y: 4.2, z: z + nz * 0.22, nx, nz, w: 4.2, h: 1.1 });
  L.signs.push({ text, x: x - nx * 0.22, y: 4.2, z: z - nz * 0.22, nx: -nx, nz: -nz, w: 4.2, h: 1.1 });
}

/** A flag on a pole. Only the pole is solid, not the cloth. */
export function flag(L, x, z, s = 1.5, t = null) {
  place(L, 'forest/flag', x, z, { s, t, solid: false });
  addFlags(L, Math.floor(x / TM), Math.floor(z / TM), SOLID, 20);
}

export function campfire(L, x, z, lit = true) {
  place(L, 'nat/campfire_stones', x, z, { solid: false });
  place(L, 'nat/campfire_logs', x, z, { solid: false, y: 0.05 });
  if (lit) L.lights.push({ x, y: 0.7, z, c: [1, 0.55, 0.22], r: 11, kind: 'fire' });
  solidDisc(L, x, z, 0.5, false, 4);
}

export function railTrack(L, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), r = Math.atan2(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const off of [-0.6, 0.6]) {
    const [rx, rz] = rot(cx, cz, r, off, 0);
    box(L, rx, 0.12, rz, 0.1, 0.1, len, '#5a5a62', { r, c2: '#3a3a42' });
  }
  for (let t = -len / 2 + 0.4; t < len / 2; t += 0.8) {
    const [sx, sz] = rot(cx, cz, r, 0, t);
    box(L, sx, 0, sz, 1.9, 0.12, 0.26, '#6a4a30', { r, c2: '#4a3220' });
  }
}

export function table(L, x, z, o = {}) {
  cyl(L, x, 0, z, 0.12, 0.8, WOOD_D, { seg: 6 });
  cyl(L, x, 0.8, z, 0.75, 0.08, WOOD_L, { c2: WOOD, seg: 10 });
  if (o.stools !== false) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + (o.turn || 0);
      cyl(L, x + Math.cos(a) * 1.15, 0, z + Math.sin(a) * 1.15, 0.24, 0.5, WOOD, { c2: WOOD_D, seg: 8 });
    }
  }
  solidDisc(L, x, z, 0.72, false, 9);
}

export function counter(L, x, z, r, len, o = {}) {
  box(L, x, 0, z, len, 1.02, 0.78, o.c || '#9a6e44', { r, c2: '#6e4a30' });
  box(L, x, 1.02, z, len + 0.12, 0.08, 0.9, o.top || '#b98a5c', { r });
  solidBox(L, x, z, r, len, 0.8, false, 11);
}

export function shelfWall(L, x, z, r, len, o = {}) {
  // a tall goods shelf against a wall, with coloured stock
  box(L, x, 0, z, len, 2.3, 0.45, '#7a5236', { r, c2: '#5c3e2a' });
  const cols = o.stock || ['#b5483a', '#d9a83a', '#5b7f4b', '#3f6e8c', '#d8c39a', '#8b6fb5'];
  const n = Math.floor(len / 0.42);
  for (let row = 0; row < 3; row++) for (let k = 0; k < n; k++) {
    if ((k * 7 + row * 3) % 5 === 0) continue;
    const [wx, wz] = rot(x, z, r, -len / 2 + 0.25 + k * 0.42, 0.14);
    box(L, wx, 0.42 + row * 0.62, wz, 0.3, 0.34 + ((k + row) % 3) * 0.06, 0.26, cols[(k + row * 2) % cols.length], { r });
  }
  solidBox(L, x, z, r, len, 0.5, true, 23);
}
