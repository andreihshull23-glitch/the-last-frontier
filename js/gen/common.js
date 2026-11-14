// Shared pieces of the level generators: scattering props without blocking
// paths, and the sets of models each biome draws from.
import { TILE, PX, MACRO, SOLID, ROCK, GROUND } from '../content.js';
import { place, inb, centreM, tileCentre, reserve } from '../level.js';

const TM = TILE / PX;
const TAU = Math.PI * 2;

/** True if every tile in the square around (tx, ty) is free and not reserved. */
export function clearAround(L, tx, ty, r, allowKeep = false) {
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
    if (!inb(L, x, y)) return false;
    const i = y * L.w + x;
    if (L.flags[i] & SOLID) return false;
    if (!allowKeep && L.keep[i]) return false;
  }
  return true;
}

/** Distance in tiles to the nearest rock tile, capped at `max`. */
export function rockDistance(L, tx, ty, max = 6) {
  for (let r = 1; r <= max; r++) {
    for (let d = -r; d <= r; d++) {
      for (const [x, y] of [[tx + d, ty - r], [tx + d, ty + r], [tx - r, ty + d], [tx + r, ty + d]]) {
        if (!inb(L, x, y) || L.flags[y * L.w + x] & ROCK) return r;
      }
    }
  }
  return max + 1;
}

/**
 * Scatter props over open ground.
 *   set: [[model, weight, { s: [min, max], solid, clear, tint, near: 'wall'|'open', ground }]]
 * Solid props need a clear square around them and then reserve it, so two
 * never close a gap between them.
 */
export function scatter(L, rng, count, set, o = {}) {
  const total = set.reduce((a, s) => a + s[1], 0);
  let placed = 0;
  const x0 = o.x0 ?? 0, y0 = o.y0 ?? 0, x1 = o.x1 ?? L.w - 1, y1 = o.y1 ?? L.h - 1;
  for (let tries = 0; tries < count * 14 && placed < count; tries++) {
    let roll = rng.next() * total, pick = set[0];
    for (const s of set) { roll -= s[1]; if (roll <= 0) { pick = s; break; } }
    const [m, , opt = {}] = pick;
    const tx = rng.int(x0, x1), ty = rng.int(y0, y1);
    if (!inb(L, tx, ty)) continue;
    const solid = opt.solid !== false;
    const need = opt.clear ?? (solid ? 3 : 0);
    if (!clearAround(L, tx, ty, need, !solid && o.onKeep)) continue;
    if (opt.near || o.near) {
      const d = rockDistance(L, tx, ty, 5);
      const want = opt.near || o.near;
      if (want === 'wall' && d > 4) continue;
      if (want === 'open' && d < 5) continue;
    }
    if (opt.ground !== undefined && L.ground[ty * L.w + tx] !== opt.ground) continue;
    if (opt.notGround !== undefined && L.ground[ty * L.w + tx] === opt.notGround) continue;
    const sr = opt.s || [0.85, 1.2];
    const s = sr[0] + rng.next() * (sr[1] - sr[0]);
    const jx = (rng.next() - 0.5) * 0.3, jz = (rng.next() - 0.5) * 0.3;
    place(L, m, centreM(tx) + jx, centreM(ty) + jz, { r: rng.next() * TAU, s, t: opt.tint, solid: solid ? opt.solid || 'auto' : false, shade: 0.92 + rng.next() * 0.16 });
    if (solid) reserve(L, tx - need - 1, ty - need - 1, tx + need + 1, ty + need + 1);
    placed++;
  }
  return placed;
}

export const DESERT_FLORA = [
  ['nat/cactus_tall', 5, { s: [0.8, 1.25], clear: 2 }],
  ['west/cactus-a', 4, { s: [1.0, 1.5], clear: 2 }],
  ['west/cactus-b', 3, { s: [1.0, 1.4], clear: 2 }],
  ['west/cactus-d', 3, { s: [1.0, 1.5], clear: 2 }],
  ['west/tumbleweed', 3, { s: [0.8, 1.3], solid: false }],
  ['nat/cactus_short', 4, { s: [0.8, 1.3], clear: 2 }],
  ['nat/plant_bushDetailed', 4, { solid: false, s: [0.7, 1.2] }],
  ['nat/plant_bushLarge', 4, { solid: false, s: [0.8, 1.3] }],
  ['nat/plant_bush', 3, { solid: false, s: [0.8, 1.3] }],
  ['nat/grass_large', 6, { solid: false, s: [0.8, 1.4] }],
  ['nat/grass', 6, { solid: false, s: [0.8, 1.4] }],
  ['nat/plant_flatTall', 2, { solid: false }],
  ['nat/tree_thin_fall', 1.2, { s: [0.9, 1.3], clear: 3 }],
  ['nat/tree_default_fall', 0.8, { s: [0.9, 1.25], clear: 3 }],
  ['nat/stump_old', 0.7, { clear: 2 }],
  ['nat/log', 0.8, { solid: false }],
];
export const DESERT_ROCKS = [
  ['nat/rock_largeA', 2, { s: [0.9, 1.4], clear: 4 }],
  ['nat/rock_largeD', 2, { s: [0.9, 1.4], clear: 4 }],
  ['nat/rock_largeF', 2, { s: [0.9, 1.4], clear: 4 }],
  ['nat/rock_tallA', 1.5, { s: [0.9, 1.5], clear: 4 }],
  ['nat/rock_tallB', 1.5, { s: [0.9, 1.4], clear: 4 }],
  ['nat/rock_tallG', 2, { s: [0.9, 1.5], clear: 3 }],
  ['nat/rock_tallH', 2, { s: [0.9, 1.4], clear: 3 }],
  ['nat/rock_tallC', 2, { s: [1, 1.6], clear: 3 }],
];
export const PEBBLES = [
  ['nat/rock_smallA', 3, { solid: false, s: [0.6, 1.3] }],
  ['nat/rock_smallC', 3, { solid: false, s: [0.6, 1.3] }],
  ['nat/rock_smallFlatA', 3, { solid: false, s: [0.6, 1.4] }],
  ['nat/rock_smallFlatB', 3, { solid: false, s: [0.6, 1.4] }],
  ['nat/rock_smallD', 2, { solid: false, s: [0.6, 1.2] }],
  ['nat/rock_smallE', 1.5, { solid: false, s: [0.5, 0.9] }],
];
// what a district leaves lying about
export const STREET_CLUTTER = [
  ['scifi/prop-barrel-large', 5, { s: [0.85, 1.05], clear: 2, tint: 'deckprop', solid: 'low' }],
  ['cyber/tank', 2, { s: [0.7, 0.9], clear: 2, tint: 'street' }],
  ['cyber/light-square', 3, { s: [0.9, 1.1], clear: 2, tint: 'street', solid: 'low' }],
  ['cyber/computer', 1.2, { s: [0.9, 1.0], clear: 2, tint: 'street' }],
  ['scifi/prop-itemholder', 2, { s: [1, 1.4], clear: 2, tint: 'deckprop', solid: 'low' }],
  ['scifi/prop-chest', 1.5, { s: [0.9, 1.1], clear: 2, tint: 'deckprop', solid: 'low' }],
  ['station/container', 2, { s: [0.6, 0.75], clear: 3, tint: 'deckprop' }],
];
export const STREET_BULK = [
  ['station/container-flat', 3, { s: [0.7, 0.85], clear: 4, tint: 'deckprop' }],
  ['station/container-tall', 2, { s: [0.7, 0.85], clear: 3, tint: 'deckprop' }],
  ['station/container-wide', 3, { s: [0.7, 0.85], clear: 3, tint: 'deckprop' }],
  ['station/skip', 2, { s: [0.7, 0.85], clear: 4, tint: 'deckprop' }],
  ['cyber/computer-large', 1, { s: [0.6, 0.7], clear: 3, tint: 'street' }],
];
export const STREET_LITTER = [
  ['scifi/prop-cable-1', 4, { solid: false, tint: 'deckprop' }],
  ['scifi/prop-cable-3', 2, { solid: false, tint: 'deckprop' }],
  ['scifi/prop-vent-small', 3, { solid: false, tint: 'deckprop' }],
  ['scifi/prop-vent-big', 2, { solid: false, tint: 'deckprop' }],
  ['scifi/prop-clamp', 2, { solid: false, tint: 'deckprop' }],
];
export const HOLLOW_FLORA = [
  ['nat/mushroom_redGroup', 4, { solid: false, s: [1, 2.2], tint: 'hollow_glow' }],
  ['nat/mushroom_tanTall', 3, { solid: false, s: [1.2, 2.6], tint: 'hollow_glow' }],
  ['nat/statue_obelisk', 1.5, { s: [0.9, 1.5], clear: 3, tint: 'hollow' }],
  ['nat/statue_columnDamaged', 1.5, { s: [0.9, 1.3], clear: 3, tint: 'hollow' }],
  ['nat/stump_oldTall', 2, { clear: 2, tint: 'hollow' }],
  ['nat/tree_thin_dark', 1.5, { s: [0.9, 1.3], clear: 3, tint: 'hollow' }],
  ['nat/grass_large', 4, { solid: false, tint: 'hollow_glow' }],
];

/** Paint a wobbly path between two tile positions and reserve it. */
export function trail(L, rng, ax, ay, bx, by, width = 3, ground = GROUND.trail) {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
  const wob = rng.next() * 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sway = Math.sin(t * 9 + wob) * 1.6 * Math.sin(t * Math.PI);
    const nx = -(by - ay) / (steps || 1), ny = (bx - ax) / (steps || 1);
    const cx = Math.round(ax + (bx - ax) * t + nx * sway), cy = Math.round(ay + (by - ay) * t + ny * sway);
    for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
      if (dx * dx + dy * dy > width * width + 1) continue;
      const x = cx + dx, y = cy + dy;
      if (!inb(L, x, y)) continue;
      const k = y * L.w + x;
      if (L.flags[k] & (SOLID | ROCK)) continue;
      if (L.ground[k] === GROUND.sand || L.ground[k] === GROUND.rockfloor || L.ground[k] === GROUND.grass) L.ground[k] = ground;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) L.keep[k] = 1;
    }
  }
}

export const px = (m) => m * PX;
export { TM, TAU, tileCentre, MACRO };
