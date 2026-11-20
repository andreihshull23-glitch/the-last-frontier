// The city overhead: what makes a district feel walled-in without making it any smaller to walk.
// Built from the level's block layout when the world is built, drawn only (never solid, never in the sim):
//   districts: the blocks rise into towers of 14 to 40 m with lit floors; skybridges and cables span the
//     streets; blade signs hang high on the facades; an upper city of slabs covers much of the sky.
//   Mercy Deck: the walls go on up to a ceiling of girders, ducts and light panels, 11 m overhead.
// None of it casts shadows, so the streets stay readable. Deterministic from the level's seed.
import { Merger } from './assets.js';
import { MACRO, TILE, PX } from '../content.js';

const TM = TILE / PX;          // metres per tile
const M = MACRO * TM;          // metres per macro cell
const NEONS = [[255, 63, 164], [63, 224, 255], [160, 112, 255], [255, 180, 63], [93, 255, 154]];
const WINDOW = [[255, 207, 122], [255, 207, 122], [127, 230, 255], [255, 122, 192], [230, 236, 255]];

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hash = (x, y, k) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1442695041)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function buildCanopy(THREE, assets, L, seed = 1) {
  const city = Boolean(L.city), deck = L.theme === 'deck';
  if (!city && !deck) return null;
  const R = rng(seed * 31 + 7);
  const solid = new Merger(assets), glow = new Merger(assets);
  const dark = (h) => [h, h, h + 10];
  const { mw, mh } = L;
  const rock = (mx, my) => (mx < 0 || my < 0 || mx >= mw || my >= mh ? 1 : L.rock[my * mw + mx]);

  if (city) {
    // ---- towers: every block face that looks onto a street climbs well past the street wall
    // a block's height is shared by its 2x2 neighbourhood, so the skyline reads as buildings, not columns
    const heightAt = (mx, my) => {
      const t = rock(mx, my);
      if (!t) return 0;
      const h = hash(mx >> 1, my >> 1, seed);
      return t === 2 ? 22 + h * 20 : 11 + h * 7;
    };
    for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
      if (!rock(mx, my)) continue;
      const top = heightAt(mx, my);
      const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const other = heightAt(mx + dx, my + dy);
        if (other >= top - 0.5) continue;
        const base = Math.max(4.4, other);
        const along = dx === 0;
        const ex = cx + dx * (M / 2 - 0.1), ez = cz + dy * (M / 2 - 0.1);
        const shade = 34 + Math.floor(hash(mx, my, 3) * 18);
        solid.addBox(ex, base, ez, along ? M : 0.2, top - base, along ? 0.2 : M, 0, dark(shade), dark(shade - 10));
        // each storey: a slab edge standing proud of the face, and a few lit windows
        for (let y = base + 3.1; y < top - 0.5; y += 3.1) solid.addBox(ex + dx * 0.16, y - 0.18, ez + dy * 0.16, along ? M : 0.14, 0.18, along ? 0.14 : M, 0, dark(shade + 22), dark(shade + 6));
        for (let y = base + 1.1; y < top - 1.4; y += 3.1) for (let k = 0; k < 4; k++) {
          if (hash(mx * 7 + k, my * 5 + Math.floor(y), seed) > 0.27) continue;
          const off = (k - 1.5) * (M / 4.4), w = M / 8;
          const c = WINDOW[Math.floor(hash(mx, k, Math.floor(y)) * WINDOW.length)];
          glow.addBox(ex + dx * 0.12 + (along ? off : 0), y, ez + dy * 0.12 + (along ? 0 : off), along ? w : 0.05, 0.9, along ? 0.05 : w, 0, c, c);
        }
        // a neon line along the roof edge, and now and then a blade sign hung out over the street
        if (hash(mx, my, 11) < 0.5) { const c = NEONS[Math.floor(hash(mx, my, 12) * NEONS.length)]; glow.addBox(ex + dx * 0.14, top - 0.15, ez + dy * 0.14, along ? M : 0.07, 0.08, along ? 0.07 : M, 0, c, c); }
        if (top > 12 && hash(mx, my, dx * 3 + dy + 20) < 0.16) {
          const c = NEONS[Math.floor(hash(mx, dy, dx + 30) * NEONS.length)];
          const sy = 6 + hash(mx, my, 40) * Math.min(10, top - 12), sh = 3 + hash(mx, my, 41) * 3;
          const sx = ex + dx * 1.0 + (along ? (hash(mx, my, 42) - 0.5) * M * 0.6 : 0), sz = ez + dy * 1.0 + (along ? 0 : (hash(mx, my, 42) - 0.5) * M * 0.6);
          // a dark panel with a lit border and a column of lit glyph blocks on both faces
          solid.addBox(sx, sy - 0.1, sz, along ? 0.2 : 1.6, sh + 0.2, along ? 1.6 : 0.2, 0, dark(12), dark(10));
          const bw = 1.6, t = 0.08;
          for (const v of [-1, 1]) {
            glow.addBox(sx + (along ? 0 : v * (bw / 2 - t / 2)), sy - 0.1, sz + (along ? v * (bw / 2 - t / 2) : 0), along ? 0.24 : t, sh + 0.2, along ? t : 0.24, 0, c, c);
          }
          glow.addBox(sx, sy - 0.12, sz, along ? 0.24 : bw, t, along ? bw : 0.24, 0, c, c);
          glow.addBox(sx, sy + sh + 0.04, sz, along ? 0.24 : bw, t, along ? bw : 0.24, 0, c, c);
          const inner = c.map((v) => Math.min(255, v * 0.55 + 110));
          for (let j = 0; j < Math.floor(sh / 0.8); j++) if (hash(mx, j, 50) < 0.8) glow.addBox(sx, sy + 0.3 + j * 0.8, sz, along ? 0.24 : 0.55 + hash(j, mx, 51) * 0.5, 0.42, along ? 0.55 + hash(j, my, 52) * 0.5 : 0.24, 0, inner, inner);
        }
      }
    }
    // ---- skybridges and cables across the streets
    const span = (horiz) => {
      const A = horiz ? mh : mw, B = horiz ? mw : mh;
      for (let a = 0; a < A; a++) {
        let b = 0;
        while (b < B) {
          const cell = (k) => (horiz ? rock(k, a) : rock(a, k));
          if (cell(b)) { b++; continue; }
          const s0 = b; while (b < B && !cell(b)) b++;
          const len = b - s0;
          if (len < 1 || len > 5 || s0 === 0 || b >= B) continue;
          const mid = (s0 + b) / 2 * M, across = a * M + M / 2, metres = len * M + 0.4;
          const at = (u, v) => (horiz ? [u, v] : [v, u]);
          if (R() < 0.42) {
            // a skybridge: deck, rails lit in two colours, a lamp line underneath
            const y = 8 + R() * 9;
            const [x, z] = at(mid, across + (R() - 0.5) * M * 0.5);
            solid.addBox(x, y, z, horiz ? metres : 2.4, 0.55, horiz ? 2.4 : metres, 0, dark(26), dark(14));
            for (const side of [-1.15, 1.15]) {
              const [rx, rz] = at(mid, across + side);
              solid.addBox(horiz ? x : rx, y + 0.55, horiz ? rz : z, horiz ? metres : 0.08, 1.0, horiz ? 0.08 : metres, 0, dark(30));
              const c = NEONS[Math.floor(R() * NEONS.length)];
              glow.addBox(horiz ? x : rx, y + 1.5, horiz ? rz : z, horiz ? metres : 0.06, 0.06, horiz ? 0.06 : metres, 0, c, c);
            }
            glow.addBox(x, y - 0.06, z, horiz ? metres * 0.9 : 0.3, 0.05, horiz ? 0.3 : metres * 0.9, 0, [255, 236, 210], [255, 236, 210]);
          }
          if (R() < 0.6) {
            // cables: two straight runs meeting low in the middle, now and then a sign hung from them
            const n = 1 + Math.floor(R() * 3);
            for (let k = 0; k < n; k++) {
              const y = 6.5 + R() * 5, sag = 0.5 + R() * 0.8;
              const [x, z] = at(mid, across + (R() - 0.5) * M * 0.8);
              const half = metres / 2;
              for (const sgn of [-1, 1]) for (let q = 0; q < 3; q++) {
                const f = (q + 0.5) / 3, u = mid + sgn * half * (1 - f), py = y - sag * f, seg = half / 3 + 0.1;
                if (horiz) solid.addBox(u, py, z, seg, 0.05, 0.05, 0, dark(8));
                else solid.addBox(x, py, u, 0.05, 0.05, seg, 0, dark(8));
              }
              if (R() < 0.3) { const c = NEONS[Math.floor(R() * NEONS.length)]; glow.addBox(x, y - sag - 1.3, z, horiz ? 1.2 : 0.1, 1.0, horiz ? 0.1 : 1.2, 0, c, c); }
            }
          }
        }
      }
    };
    span(true); span(false);
    // ---- the upper city: slabs over much of the sky, lit from beneath, held up by pylons
    const pad = 60, step = 14;
    const W = mw * M, D = mh * M;
    for (let x = -pad; x < W + pad; x += step) for (let z = -pad; z < D + pad; z += step) {
      const h = hash(Math.floor(x / step) + 100, Math.floor(z / step) + 100, seed + 5);
      if (h > 0.56) continue;
      const y = 44 + hash(Math.floor(x), Math.floor(z), 7) * 14;
      solid.addBox(x + step / 2, y, z + step / 2, step - 0.6, 3.5, step - 0.6, 0, dark(12), dark(20));
      if (h < 0.3) { const c = h < 0.1 ? NEONS[Math.floor(h * 50) % NEONS.length] : [255, 226, 190]; glow.addBox(x + step / 2, y - 0.05, z + step / 2, step * 0.7, 0.06, 0.25, 0, c, c); glow.addBox(x + step / 2, y - 0.05, z + step / 2, 0.25, 0.06, step * 0.7, 0, c, c); }
      if (h < 0.08) solid.addBox(x + step / 2, 24, z + step / 2, 2.2, y - 24, 2.2, 0, dark(16), dark(10));
    }
  }

  if (deck) {
    // ---- Mercy Deck is a level of the tower: the walls carry on up to a ceiling
    const TOP = 11, WALL = 4.4;
    for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
      if (!rock(mx, my)) continue;
      const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (rock(mx + dx, my + dy)) continue;
        const along = dx === 0;
        const ex = cx + dx * (M / 2 - 0.1), ez = cz + dy * (M / 2 - 0.1);
        solid.addBox(ex, WALL, ez, along ? M : 0.2, TOP - WALL, along ? 0.2 : M, 0, dark(20), dark(14));
        // the floor above: a balcony line with lit rooms behind it
        solid.addBox(ex + dx * 0.5, 7.3, ez + dy * 0.5, along ? M : 1.0, 0.25, along ? 1.0 : M, 0, dark(30));
        const c = NEONS[(mx * 3 + my) % NEONS.length];
        glow.addBox(ex + dx * 0.98, 7.55, ez + dy * 0.98, along ? M : 0.05, 0.05, along ? 0.05 : M, 0, c, c);
        for (let k = 0; k < 3; k++) if (hash(mx, my, k + dx * 5 + dy * 9) < 0.45) {
          const off = (k - 1) * 1.2, wc = WINDOW[Math.floor(hash(mx, k, my) * WINDOW.length)];
          glow.addBox(ex + dx * 0.11 + (along ? off : 0), 8.0, ez + dy * 0.11 + (along ? 0 : off), along ? 0.8 : 0.05, 1.5, along ? 0.05 : 0.8, 0, wc, wc);
        }
      }
    }
    // the ceiling itself: one slab, girders every 4 m, ducts, light panels
    const W = mw * M, D = mh * M;
    solid.addBox(W / 2, TOP, D / 2, W, 0.6, D, 0, dark(10), dark(18));
    for (let x = 2; x < W; x += 4) solid.addBox(x, TOP - 0.7, D / 2, 0.35, 0.7, D, 0, dark(24));
    for (let z = 2; z < D; z += 8) solid.addBox(W / 2, TOP - 1.2, z, W, 0.5, 0.35, 0, dark(28));
    for (let k = 0; k < 6; k++) { const z = 6 + R() * (D - 12), y = TOP - 1.9 - R() * 0.6; solid.addBox(W / 2, y, z, W, 0.7, 0.7, 0, dark(34), dark(26)); }
    for (let x = 6; x < W; x += 8) for (let z = 6; z < D; z += 8) {
      if (R() < 0.45) continue;
      const c = R() < 0.8 ? [255, 236, 214] : NEONS[Math.floor(R() * NEONS.length)];
      glow.addBox(x, TOP - 0.75, z, 1.8, 0.05, 0.6, 0, c, c);
    }
  }

  const g = new THREE.Group();
  if (!solid.empty) { const m = new THREE.Mesh(solid.build(), assets.worldMaterial()); m.castShadow = false; m.receiveShadow = false; m.userData.own = true; g.add(m); }
  if (!glow.empty) { const m = new THREE.Mesh(glow.build(), assets.glowMaterial()); m.userData.own = true; g.add(m); }
  return g;
}
