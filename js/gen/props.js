// Compound props assembled from kit models and coloured boxes: lift pads,
// freight haulers, street lights. The names are older than the setting. All positions are metres; `r` rotates about Y.
import { box, cyl, place, addFlags, WALL } from '../level.js';
import { SOLID, TILE, PX } from '../content.js';

const TM = TILE / PX;
const STEEL = '#2a2d40', STEEL_D = '#1a1c2a', STEEL_L = '#3c4060';
const glowBox = (L, ...a) => { const p = box(L, ...a); p.glow = true; return p; };
const glowCyl = (L, ...a) => { const p = cyl(L, ...a); p.glow = true; return p; };
const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const neon = (L, x, y, z, c, r = 8) => L.lights.push({ x, y, z, c: rgb(c), r, kind: 'neon' });

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

/** A personal lift pad: where a runner arrives and leaves. (Once a horse.) */
export function horse(L, x, z, r, coat = '#ffd23f', o = {}) {
  const c = coat.startsWith('#f') || coat.startsWith('#3') ? coat : '#ffd23f';
  cyl(L, x, 0, z, 1.0, 0.08, STEEL, { c2: STEEL_D, seg: 14, to: o.to });
  const ring = cyl(L, x, 0.08, z, 0.9, 0.03, c, { seg: 14, to: o.to }); ring.glow = true;
  cyl(L, x, 0.1, z, 0.74, 0.03, '#20222e', { seg: 14, to: o.to });
  const [px, pz] = rot(x, z, r, 0.0, -1.15);
  box(L, px, 0, pz, 0.3, 1.25, 0.2, STEEL_L, { r, c2: STEEL_D, to: o.to });
  const lamp = box(L, px, 1.25, pz, 0.34, 0.1, 0.24, c, { r, to: o.to }); lamp.glow = true;
  if (!o.to) neon(L, x, 0.8, z, c, 6);
}

function shadeHex(hex, k) {
  const c = [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
export { shadeHex };

/** A freight hauler: a flatbed with containers on it. */
export function wagon(L, x, z, r, o = {}) {
  box(L, x, 0.3, z, 1.9, 0.3, 3.6, STEEL_L, { r, c2: STEEL_D });
  for (const [a, b] of [[-0.8, -1.3], [0.8, -1.3], [-0.8, 1.3], [0.8, 1.3]]) { const [wx, wz] = rot(x, z, r, a, b); cyl(L, wx, 0, wz, 0.32, 0.36, '#14151c', { seg: 8 }); }
  const [cx, cz] = rot(x, z, r, 0, -0.5);
  if (o.load !== false) place(L, o.covered ? 'station/container-flat' : 'station/container-wide', cx, cz, { y: 0.6, r, s: 0.8, t: 'deckprop', solid: false });
  const [hx, hz] = rot(x, z, r, 0, 1.55);
  box(L, hx, 0.6, hz, 1.7, 0.8, 0.5, STEEL, { r, c2: STEEL_D });
  const [gx, gz] = rot(x, z, r, 0, 1.82);
  glowBox(L, gx, 0.9, gz, 1.3, 0.12, 0.04, '#ffb43f', { r });
  solidBox(L, x, z, r, 1.9, 3.6, true, 22);
}

/** A freight tram car waiting at its stop. */
export function coach(L, x, z, r) {
  box(L, x, 0.35, z, 2.3, 2.2, 5.6, '#34384f', { r, c2: STEEL_D });
  box(L, x, 2.55, z, 2.0, 0.16, 5.2, STEEL_D, { r });
  for (const side of [-1.17, 1.17]) {
    const [wx, wz] = rot(x, z, r, side, 0);
    glowBox(L, wx, 1.5, wz, 0.04, 0.6, 4.4, '#ffe2a8', { r });
    const [sx, sz] = rot(x, z, r, side, 0);
    glowBox(L, sx, 0.5, sz, 0.05, 0.06, 5.4, '#3fe0ff', { r });
  }
  for (const b of [-2.82, 2.82]) { const [wx, wz] = rot(x, z, r, 0, b); glowBox(L, wx, 0.9, wz, 1.6, 0.14, 0.04, b > 0 ? '#ffe2a8' : '#ff5a3a', { r }); }
  solidBox(L, x, z, r, 2.3, 5.6, true, 26);
  neon(L, x, 1.6, z, '#ffe2a8', 9);
}

export function barrel(L, x, z, o = {}) {
  place(L, 'scifi/prop-barrel-large', x, z, { r: (x * 7 + z * 3) % 6.28, s: 0.95, solid: o.solid === false ? false : 'low', t: o.c ? 'machine' : 'deckprop' });
}

export function crate(L, x, z, r = 0, size = 0.9, o = {}) {
  const m = size > 0.82 ? 'scifi/prop-crate4' : 'scifi/prop-crate3';
  const half = m === 'scifi/prop-crate4' ? 0.6 : 0.5, sc = size / (half * 2);
  place(L, m, x, z, { r, y: (o.y || 0) + half * sc, s: sc, t: 'deckprop', solid: o.solid !== false && !o.y ? 'low' : false });
}

/** A low barrier with a strip of light along it. */
export function hitchRail(L, x, z, r, len = 3) {
  box(L, x, 0, z, len, 0.9, 0.22, STEEL, { r, c2: STEEL_D });
  glowBox(L, x, 0.9, z, len, 0.04, 0.26, '#ffb43f', { r });
  solidBox(L, x, z, r, len, 0.3, false, 9);
}

export function lampPost(L, x, z, o = {}) {
  place(L, 'cyber/light-street-1', x, z, { r: Math.PI / 2, s: 0.7, t: 'street', solid: false });
  glowBox(L, x + 0.68, 3.66, z, 0.42, 0.05, 0.26, '#e8f4ff');
  L.lights.push({ x: x + 0.7, y: 3.5, z, c: [0.78, 0.9, 1], r: o.r || 10, kind: 'lantern' });
  addFlags(L, Math.floor(x / TM), Math.floor(z / TM), SOLID, 30);
}

/** A run of pipe on stands. */
export function trough(L, x, z, r = 0) {
  place(L, 'scifi/prop-pipeholder', x, z, { r, s: 0.7, t: 'deckprop', solid: 'low' });
}

/** A coolant tank cluster. */
export function well(L, x, z) {
  cyl(L, x, 0, z, 1.0, 0.5, STEEL, { c2: STEEL_D, seg: 12 });
  for (const [a, b, h] of [[-0.35, -0.25, 1.9], [0.4, -0.1, 1.5], [0, 0.42, 2.3]]) {
    cyl(L, x + a, 0.5, z + b, 0.34, h, '#3a4660', { c2: '#222a3c', seg: 10 });
    glowCyl(L, x + a, 0.5 + h * 0.6, z + b, 0.35, 0.06, '#3fe0ff', { seg: 10 });
  }
  solidDisc(L, x, z, 1.05, true, 24);
  neon(L, x, 1.6, z, '#3fe0ff', 7);
}

/** A relay mast. */
export function waterTower(L, x, z) {
  box(L, x, 0, z, 1.6, 1.4, 1.6, STEEL, { c2: STEEL_D });
  box(L, x, 1.4, z, 0.3, 5.4, 0.3, STEEL_L, { c2: STEEL_D });
  place(L, 'cyber/antenna-2', x + 0.3, z, { y: 5.2, s: 1.2, t: 'street', solid: false });
  place(L, 'cyber/antenna-1', x, z, { y: 6.8, t: 'street', solid: false });
  glowBox(L, x, 6.9, z, 0.2, 0.2, 0.2, '#ff5a3a');
  L.lights.push({ x, y: 7, z, c: [1, 0.3, 0.2], r: 6, kind: 'neon' });
  solidBox(L, x, z, 0, 1.6, 1.6, true, 40);
}

export function grave(L, x, z, r = 0, kind = 0) {
  box(L, x, 0, z, 0.62, 0.8, 0.16, STEEL, { r, c2: STEEL_D });
  glowBox(L, x, 0.5, z + 0.09, 0.4, 0.08, 0.02, kind === 0 ? '#ffb43f' : '#5a7090', { r });
}

export function jobBoard(L, x, z, r) {
  place(L, 'cyber/computer-large', x, z, { r, s: 0.62, t: 'street' });
}

export function archGate(L, x, z, r, span = 7, text = 'MERCY') {
  const [ax, az] = rot(x, z, r, -span / 2, 0), [bx, bz] = rot(x, z, r, span / 2, 0);
  box(L, ax, 0, az, 0.4, 5.2, 0.4, STEEL, { c2: STEEL_D });
  box(L, bx, 0, bz, 0.4, 5.2, 0.4, STEEL, { c2: STEEL_D });
  box(L, x, 4.9, z, span + 1.2, 0.36, 0.36, STEEL_L, { r, c2: STEEL });
  addFlags(L, Math.floor(ax / TM), Math.floor(az / TM), WALL, 52);
  addFlags(L, Math.floor(bx / TM), Math.floor(bz / TM), WALL, 52);
  const nx = Math.sin(r), nz = Math.cos(r);
  L.signs.push({ text, x: x + nx * 0.22, y: 4.2, z: z + nz * 0.22, nx, nz, w: 4.2, h: 1.1, glow: true, bg: '#0a0b14', fg: '#3fe0ff' });
  L.signs.push({ text, x: x - nx * 0.22, y: 4.2, z: z - nz * 0.22, nx: -nx, nz: -nz, w: 4.2, h: 1.1, glow: true, bg: '#0a0b14', fg: '#3fe0ff' });
}

/** A standing light bar in a faction's colour. Only the pole is solid. */
export function flag(L, x, z, s = 1.5, t = null) {
  const c = t === 'tent_red' ? '#ff5a3a' : '#3fe0ff';
  box(L, x, 0, z, 0.12, 2.2 * s, 0.12, STEEL_L, { c2: STEEL_D });
  glowBox(L, x, 1.3 * s, z + 0.3, 0.05, 0.8 * s, 0.6, c);
  L.lights.push({ x, y: 1.8 * s, z, c: rgb(c), r: 6, kind: 'neon' });
  addFlags(L, Math.floor(x / TM), Math.floor(z / TM), SOLID, 20);
}

/** A fire in a drum: what people warm their hands at down here. */
export function campfire(L, x, z, lit = true) {
  cyl(L, x, 0, z, 0.38, 0.8, '#3a3230', { c2: '#1c1818', seg: 10 });
  if (lit) {
    glowCyl(L, x, 0.78, z, 0.32, 0.05, '#ff9a3a', { seg: 10 });
    L.lights.push({ x, y: 1.0, z, c: [1, 0.55, 0.22], r: 11, kind: 'fire' });
  }
  solidDisc(L, x, z, 0.5, false, 8);
}

/** Maglev rail: a dark bed with a guide light down the middle. */
export function railTrack(L, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), r = Math.atan2(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  box(L, cx, 0, cz, 1.9, 0.1, len, '#20222e', { r, c2: '#14151c' });
  for (const off of [-0.7, 0.7]) {
    const [rx, rz] = rot(cx, cz, r, off, 0);
    box(L, rx, 0.1, rz, 0.14, 0.1, len, '#5a6078', { r, c2: '#3a3e52' });
  }
  glowBox(L, cx, 0.1, cz, 0.08, 0.03, len, '#3fe0ff', { r });
}

export function table(L, x, z, o = {}) {
  cyl(L, x, 0, z, 0.12, 0.8, STEEL_D, { seg: 6 });
  cyl(L, x, 0.8, z, 0.75, 0.08, STEEL_L, { c2: STEEL, seg: 10 });
  if (o.stools !== false) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + (o.turn || 0);
      cyl(L, x + Math.cos(a) * 1.15, 0, z + Math.sin(a) * 1.15, 0.24, 0.5, STEEL, { c2: STEEL_D, seg: 8 });
    }
  }
  solidDisc(L, x, z, 0.72, false, 9);
}

export function counter(L, x, z, r, len, o = {}) {
  box(L, x, 0, z, len, 1.02, 0.78, STEEL, { r, c2: STEEL_D });
  box(L, x, 1.02, z, len + 0.12, 0.08, 0.9, STEEL_L, { r });
  solidBox(L, x, z, r, len, 0.8, false, 11);
}

export function shelfWall(L, x, z, r, len, o = {}) {
  // a tall goods rack against a wall, with coloured stock
  box(L, x, 0, z, len, 2.3, 0.45, STEEL_D, { r });
  const cols = o.stock && o.stock[0] !== '#8a623c' && o.stock[0] !== '#ece2c8' ? o.stock : ['#b5483a', '#d9a83a', '#5b7f4b', '#3f7f9a', '#d8d2c4', '#8b6fb5'];
  const n = Math.floor(len / 0.42);
  for (let row = 0; row < 3; row++) for (let k = 0; k < n; k++) {
    if ((k * 7 + row * 3) % 5 === 0) continue;
    const [wx, wz] = rot(x, z, r, -len / 2 + 0.25 + k * 0.42, 0.14);
    box(L, wx, 0.42 + row * 0.62, wz, 0.3, 0.34 + ((k + row) % 3) * 0.06, 0.26, cols[(k + row * 2) % cols.length], { r });
  }
  solidBox(L, x, z, r, len, 0.5, true, 23);
}

/** A big extractor fan on a stand. */
export function windmill(L, x, z, r = 0) {
  box(L, x, 0, z, 1.4, 3.2, 1.4, STEEL, { c2: STEEL_D });
  place(L, 'scifi/prop-fan-small', x, z, { y: 3.3, s: 1.3, t: 'deckprop', solid: false });
  solidBox(L, x, z, 0, 1.4, 1.4, true, 34);
}
export function gallows(L, x, z, r = 0) {
  place(L, 'cyber/tv-3', x, z, { r, s: 0.8, t: 'street' });
}
export function cactus(L, x, z, kind = 0, s = 1) {
  place(L, ['cyber/tank', 'scifi/prop-barrel-large', 'cyber/light-square', 'scifi/prop-crate3'][kind % 4], x, z, { r: (x * 5 + z * 11) % 6.28, s, t: 'street', y: kind % 4 === 3 ? 0.5 * s : 0 });
}
export function tumbleweed(L, x, z) {
  place(L, 'scifi/prop-cable-1', x, z, { r: (x + z) % 6.28, solid: false, t: 'deckprop' });
}
