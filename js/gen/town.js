// Mercy Deck: the walkable hub between runs. Level 12 of the Spire, a sealed concourse of open-fronted
// stalls under neon. The layout is fixed; what stands in it depends on the campaign (investments,
// names on the Wall, how well the deck is doing).
import { PX, MACRO, ROCK, GROUND, SHOPS } from '../content.js';
import { makeRng } from '../rng.js';
import { createLevel, place, box, cyl, paint, setTile, WALL } from '../level.js';

const P = (m) => m * PX;
const M = 4;                    // metres per macro cell
const TM = 0.5;                 // metres per tile
const WALL_H = 4.4;

export const NEON = { pink: '#ff3fa4', cyan: '#3fe0ff', amber: '#ffb43f', red: '#ff5a3a', gold: '#ffd23f', violet: '#a070ff', green: '#5dff9a', white: '#dfe8ff' };
const DARK = '#161822', DARK2 = '#0e0f18', STEEL = '#2a2d40', STEEL2 = '#1a1c2a';
const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// North and south of the concourse, west to east. x0 and w are in macro cells.
// Stalls stand shoulder to shoulder, split by partition walls, so the deck is a short walk end to end.
const BAYS = [
  { id: 'saloon', side: 'n', x0: 3, w: 4, col: NEON.pink },
  { id: 'store', side: 'n', x0: 7, w: 3, col: NEON.amber },
  { id: 'hall', side: 'n', x0: 10, w: 4, col: NEON.cyan },
  { id: 'gunsmith', side: 'n', x0: 14, w: 3, col: NEON.red },
  { id: 'stable', side: 's', x0: 3, w: 3, col: NEON.gold },
  { id: 'outfitter', side: 's', x0: 6, w: 3, col: NEON.violet },
  { id: 'clinic', side: 's', x0: 9, w: 3, col: NEON.green },
  { id: 'telegraph', side: 's', x0: 12, w: 2, col: NEON.cyan },
];
const ROW_N = 6, ROW_S = 7;     // the concourse is macro rows 6 and 7
const EAST = 17;                // the range (north) and the Wall (south) are macro columns 17 to 19
const BAY_D = 2;                // a stall is two cells deep

export function generateTown(spec = {}) {
  const rng = makeRng((spec.seed ?? 20251) | 0);
  const invest = spec.investments || [];
  const prosperity = spec.prosperity ?? 0;
  const L = createLevel('town', 'deck', EAST + 4, 12);
  L.name = 'Mercy Deck';
  L.neon = true;
  L.ambient = { sky: '#7078c0', ground: '#3c2c50', hemi: 0.66, sun: '#8fa0ff', sunI: 0.2, fog: '#0b0a16', near: 24, far: 96 };
  const { mw, mh } = L;

  // ---- the shape of the deck ---------------------------------------------------
  L.rock.fill(1);
  const open = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) L.rock[y * mw + x] = 0; };
  open(1, ROW_N, EAST + 2, ROW_S);                             // the concourse
  open(1, ROW_N - 1, 2, ROW_S + 1);                            // the lift lobby at its west end
  for (const b of BAYS) b.side === 'n' ? open(b.x0, ROW_N - BAY_D, b.x0 + b.w - 1, ROW_N - 1) : open(b.x0, ROW_S + 1, b.x0 + b.w - 1, ROW_S + BAY_D);
  open(EAST, 1, EAST + 2, ROW_N - 1);                          // the range
  open(EAST, ROW_S + 1, EAST + 2, ROW_S + 3);                  // the Wall

  // ---- walls: kit panels on a dark plate, a line of light along the top -----------
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    if (!L.rock[my * mw + mx]) continue;
    for (let ty = my * MACRO; ty < (my + 1) * MACRO; ty++) for (let tx = mx * MACRO; tx < (mx + 1) * MACRO; tx++) setTile(L, tx, ty, WALL | ROCK, WALL_H * 10);
    const cx = (mx + 0.5) * M, cz = (my + 0.5) * M;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = mx + dx, ny = my + dy;
      if (nx < 0 || ny < 0 || nx >= mw || ny >= mh || L.rock[ny * mw + nx]) continue;
      const ex = cx + dx * (M / 2 - 0.12), ez = cz + dy * (M / 2 - 0.12);
      const along = dx === 0;
      const kind = rng.chance(0.3) ? 'scifi/wallastra-straight-flat' : 'scifi/wallband-straight';
      place(L, kind, cx + dx * M, cz + dy * M, { r: Math.atan2(-dy, dx), s: [1, 1.47, 1], t: 'deckwall', solid: 'auto' });
      box(L, ex, 0, ez, along ? M : 0.2, WALL_H, along ? 0.2 : M, DARK2);
      const tube = box(L, ex + dx * 0.16, WALL_H - 0.16, ez + dy * 0.16, along ? M : 0.07, 0.07, along ? 0.07 : M, dy > 0 ? NEON.pink : NEON.cyan);
      tube.glow = true;
    }
  }

  // ---- partitions between neighbouring stalls (and the lobby, and the range) -------------
  const partition = (xm, z0, z1, north) => {
    const x = xm * M, zc = (z0 + z1) / 2, d = z1 - z0;
    box(L, x, 0, zc, 0.4, WALL_H, d, DARK2, { c2: DARK, solid: 'wall' });
    const tube = box(L, x, WALL_H - 0.16, zc, 0.07, 0.07, d, north ? NEON.cyan : NEON.pink);
    tube.glow = true;
  };
  for (const xm of [3, 7, 10, 14, EAST]) partition(xm, (ROW_N - BAY_D) * M, ROW_N * M, true);
  for (const xm of [3, 6, 9, 12]) partition(xm, (ROW_S + 1) * M, (ROW_S + 1 + BAY_D) * M, false);

  // ---- floor --------------------------------------------------------------------
  for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
    const i = ty * L.w + tx;
    if (L.flags[i] & ROCK) continue;
    const seam = tx % MACRO === 0 || ty % MACRO === 0;
    L.ground[i] = seam ? GROUND.grate : GROUND.deck;
  }
  // guide lines along the concourse, and hazard paint in front of the lift
  for (let tx = 20; tx < (EAST + 3) * MACRO - 4; tx++) {
    if (tx % 8 < 5) { L.ground[(ROW_N * MACRO + 2) * L.w + tx] = GROUND.glow; L.ground[((ROW_S + 1) * MACRO - 3) * L.w + tx] = GROUND.glow; }
  }
  paint(L, 8, ROW_N * MACRO + 4, 19, (ROW_S + 1) * MACRO - 5, GROUND.field);

  const light = (x, y, z, col, r = 9, kind = 'neon') => L.lights.push({ x, y, z, c: rgb(col), r, kind });
  const glow = (x, y, z, sx, sy, sz, col, o = {}) => { const p = box(L, x, y, z, sx, sy, sz, col, o); p.glow = true; return p; };
  const sign = (text, x, y, z, w, h, nx, nz, col) => L.signs.push({ text, x, y, z, w, h, nx, nz, bg: '#0a0b14', fg: col, glow: true });
  const prop = (m, x, z, o = {}) => place(L, m, x, z, { t: m.startsWith('cyber/') ? 'street' : m.startsWith('station/') || m.startsWith('scifi/') ? 'deckprop' : undefined, ...o });
  const lit = (m, x, z, o = {}) => { const p = place(L, m, x, z, { t: 'neonsign', solid: false, ...o }); p.glow = true; return p; };
  const keeper = (id, x, z, a, look, extra = {}) => L.npcs.push({ role: 'keeper', shop: id, name: SHOPS[id].keeper, x: P(x), y: P(z), a, look, fixed: true, ...extra });
  const shopSpot = (id, x, z, r = 64) => L.items.push({ kind: 'shop', shop: id, x: P(x), y: P(z), r });

  /** A service counter: dark body, a lit edge on the customer's side. */
  const counter = (x, z, len, col, towards) => {
    box(L, x, 0, z, len, 1.0, 0.8, STEEL, { c2: STEEL2, solid: true });
    box(L, x, 1.0, z, len + 0.14, 0.07, 0.94, '#3c4060');
    glow(x, 0.5, z + towards * 0.42, len - 0.2, 0.05, 0.04, col);
  };
  /** Shelving against a wall with rows of stock. */
  const rack = (x, z, len, stock, along = true) => {
    box(L, x, 0, z, along ? len : 0.4, 2.3, along ? 0.4 : len, STEEL2, { solid: 'wall' });
    for (let row = 0; row < 3; row++) for (let k = 0; k < Math.floor(len / 0.42); k++) {
      const c = stock[(k * 7 + row * 3) % stock.length];
      const off = -len / 2 + 0.3 + k * 0.42;
      box(L, along ? x + off : x, 0.45 + row * 0.62, along ? z : z + off, 0.3, 0.36, 0.3, c);
    }
  };
  const table = (x, z, col) => {
    cyl(L, x, 0, z, 0.1, 0.78, STEEL2);
    cyl(L, x, 0.78, z, 0.62, 0.06, '#34384f', { solid: true, seg: 12 });
    const ring = cyl(L, x, 0.74, z, 0.66, 0.03, col, { seg: 12 }); ring.glow = true;
    for (const a of [0.6, 2.7, 4.6]) cyl(L, x + Math.cos(a) * 1.05, 0, z + Math.sin(a) * 1.05, 0.2, 0.48, '#2c2f44', { solid: true, seg: 8 });
  };

  // ---- the stalls --------------------------------------------------------------------
  const frames = {};
  for (const b of BAYS) {
    const north = b.side === 'n';
    const x0 = b.x0 * M, x1 = (b.x0 + b.w) * M, W = x1 - x0, D = BAY_D * M;
    const zm = north ? ROW_N * M : (ROW_S + 1) * M, out = north ? 1 : -1;       // out: towards the concourse
    const T = north ? (u, v) => [x0 + u, zm - v] : (u, v) => [x1 - u, zm + v];
    const F = frames[b.id] = { W, D, T, out, zm, x0, x1, face: north ? Math.PI / 2 : -Math.PI / 2, r: north ? 0 : Math.PI, col: b.col };
    paint(L, x0 / TM, (north ? zm - D : zm) / TM, x1 / TM - 1, (north ? zm : zm + D) / TM - 1, GROUND.paving);
    // the mouth: two posts, a header with the name on it
    for (const u of [0.3, W - 0.3]) {
      const [px, pz] = T(u, 0.3);
      box(L, px, 0, pz, 0.5, WALL_H, 0.5, DARK, { c2: DARK2, solid: 'wall' });
      glow(px, 0.3, pz + out * 0.28, 0.07, 3.0, 0.07, b.col);
    }
    const mid = (x0 + x1) / 2;
    box(L, mid, 3.25, zm - out * 0.3, W, 1.15, 0.44, DARK, { c2: DARK2 });
    sign(SHOPS[b.id].sign, mid, 3.83, zm - out * 0.06, Math.min(W - 1.6, 6.4), 0.92, 0, out, b.col);
    glow(mid, 3.2, zm - out * 0.1, W - 1.2, 0.05, 0.08, b.col);
    light(mid, 3.0, zm + out * 0.9, b.col, 10);
    // inside: a strip along the back wall and a work light
    glow(mid, 2.7, zm - out * (D - 0.3), W - 1.6, 0.06, 0.05, b.col);
    const [lx, lz] = T(W / 2, D / 2);
    glow(lx, 3.9, lz, 0.9, 0.06, 0.3, '#fff0d8');
    light(lx, 3.7, lz, '#ffe2c0', 11, 'lantern');
    // a lit strip on the floor across the mouth, a screen high on the back wall, cables from the header
    glow(mid, 0.015, zm - out * 0.05, W - 1.0, 0.02, 0.07, b.col);
    const [sx, sz] = T(W - 1.3, D - 0.25);
    lit(['cyber/tv-1', 'cyber/tv-2'][b.x0 % 2], sx, sz, { y: 2.5, r: north ? 0 : Math.PI, s: 0.75 });
    light(sx, 2.6, sz + out * 0.8, b.col, 6);
    prop('cyber/cable-small', ...T(W * 0.3, 0.6), { y: WALL_H - 0.2, solid: false });
    // stock lamps hung low over the counter area, in the stall's colour
    for (const u of [W * 0.3, W * 0.7]) {
      const [hx, hz] = T(u, 3.4);
      box(L, hx, 3.0, hz, 0.03, 1.4, 0.03, '#2a2c3a');
      cyl(L, hx, 2.8, hz, 0.22, 0.22, DARK2, { seg: 10 });
      const bulb = cyl(L, hx, 2.74, hz, 0.16, 0.06, '#ffe6c8', { seg: 10 }); bulb.glow = true;
    }
  }
  const stand = (id, u, v, len, look, extra) => {
    const F = frames[id];
    const [cx, cz] = F.T(u, v);
    counter(cx, cz, len, F.col, F.out);
    const [kx, kz] = F.T(u, v + 1.15);
    keeper(id, kx, kz, F.face, look, extra);
    shopSpot(id, ...F.T(u, v - 1.3));
  };

  // The Low Tide: a long bar, tables, the job board outside
  {
    const F = frames.saloon;
    stand('saloon', F.W / 2 + 2.2, 5.0, 8.2, 'keeper_saloon');
    const [bx, bz] = F.T(F.W / 2 + 2.2, F.D - 0.5);
    box(L, bx, 0, bz, 8.0, 2.4, 0.4, STEEL2, { solid: 'wall' });
    for (let k = 0; k < 18; k++) glow(bx - 3.6 + k * 0.42, 1.25 + (k % 3) * 0.36, bz + F.out * 0.24, 0.12, 0.3, 0.06, [NEON.pink, NEON.amber, NEON.cyan, NEON.green, NEON.violet][k % 5]);
    table(...F.T(2.4, 2.4), NEON.pink); table(...F.T(3.0, 5.6), NEON.cyan); table(...F.T(6.0, 2.2), NEON.pink);
    const [jx, jz] = F.T(-1.4, -0.75);
    prop('cyber/computer-large', jx, jz, { r: F.r, s: 0.62 });
    sign('JOBS', jx, 3.05, jz + F.out * 0.42, 1.5, 0.42, 0, F.out, NEON.amber);
    L.items.push({ kind: 'board', x: P(jx), y: P(jz + F.out * 1.3), r: 62 });
    L.npcs.push({ role: 'rider', name: 'Nell Dunmore', x: P(F.T(F.W - 1.6, -1.3)[0]), y: P(F.T(F.W - 1.6, -1.3)[1]), a: F.face, look: 'rider', fixed: true });
  }
  // General Supply
  {
    const F = frames.store;
    stand('store', F.W / 2 - 0.6, 5.0, 5.0, 'keeper_store');
    rack(...F.T(F.W / 2, F.D - 0.4), F.W - 1.6, ['#c9a23a', '#3f7f9a', '#b5483a', '#5b7f4b', '#d8d2c4']);
    rack(...F.T(0.45, 4.2), 3.6, ['#3f7f9a', '#d8d2c4', '#c9a23a'], false);
    prop('scifi/prop-crate4', ...F.T(F.W - 1.1, 1.6), { y: 0.6 });
    prop('scifi/prop-crate3', ...F.T(F.W - 1.0, 2.9), { y: 0.5, r: 0.4 });
    prop('scifi/prop-crate3', ...F.T(F.W - 1.1, 1.7), { y: 1.7, r: 0.2, solid: false });
    prop('scifi/prop-barrel-large', ...F.T(F.W - 0.9, 4.2));
    prop('scifi/prop-barrel-large', ...F.T(1.4, 1.2));
  }
  // The customs hall: the Unlisted's desk, a holding cell, the marshal outside
  {
    const F = frames.hall;
    stand('hall', F.W / 2 - 2.2, 5.0, 4.2, 'clerk', { name: 'Winslow' });
    sign('NO ONE IS LISTED', ...((p) => [p[0], 2.0, p[1] + F.out * 0.16])(F.T(F.W / 2 - 2.2, F.D)), 4.6, 0.6, 0, F.out, NEON.cyan);
    // the cell: bars of light
    const cw = 3.4, cd = 3.2;
    for (let k = 0; k <= 8; k++) {
      for (const [u, v] of [[F.W - cw, F.D - 0.2 - (k / 8) * cd], [F.W - cw + (k / 8) * cw, F.D - 0.2 - cd]]) {
        const [bx, bz] = F.T(u, v);
        glow(bx, 0, bz, 0.05, 2.6, 0.05, NEON.red);
        setTile(L, Math.floor(bx / TM), Math.floor(bz / TM), WALL, 26, GROUND.paving);
      }
    }
    box(L, ...((p) => [p[0], 0, p[1]])(F.T(F.W - 0.7, F.D - 1.5)), 0.8, 0.45, 1.9, STEEL, { c2: STEEL2 });
    prop('station/computer-screen', ...F.T(1.3, F.D - 0.9), { s: 0.62, r: F.r });
    prop('station/computer-system', ...F.T(1.0, 3.2), { s: 0.6, r: F.r + Math.PI / 2 });
    table(...F.T(F.W / 2 + 1.0, 2.4), NEON.cyan);
    const [mx2, mz2] = F.T(2.2, -1.4);
    L.npcs.push({ role: 'marshal', name: 'Marshal Ada Quill', x: P(mx2), y: P(mz2), a: F.face, look: 'marshal', fixed: true });
  }
  // The gun counter
  {
    const F = frames.gunsmith;
    stand('gunsmith', F.W / 2 + 0.4, 5.0, 5.2, 'keeper_gunsmith');
    ['gun/blaster-d', 'gun/blaster-l', 'gun/blaster-c', 'gun/blaster-n', 'gun/blaster-h', 'gun/blaster-e'].forEach((g, k) => {
      const [gx, gz] = F.T(1.6 + k * 1.7, F.D - 0.2);
      box(L, gx, 1.45, gz, 1.4, 0.95, 0.08, STEEL2);
      glow(gx, 1.42, gz + F.out * 0.06, 1.3, 0.03, 0.03, NEON.red);
      place(L, g, gx, gz + F.out * 0.16, { y: 1.95, r: Math.PI / 2, s: 1.35, t: 'gun_enemy', solid: false });
    });
    prop('scifi/prop-chest', ...F.T(F.W - 1.2, 1.4), { r: F.r + Math.PI / 2 });
    prop('scifi/prop-crate4', ...F.T(1.0, 1.3), { y: 0.6 });
    box(L, ...((p) => [p[0], 0, p[1]])(F.T(1.1, F.D - 1.4)), 1.6, 0.9, 0.8, STEEL, { c2: STEEL2, solid: true });   // the workbench
    prop('scifi/prop-clamp', ...F.T(1.1, F.D - 1.4), { y: 0.9, solid: false });
  }
  // The freight lift office
  {
    const F = frames.stable;
    stand('stable', F.W / 2 + 1.2, 4.6, 3.6, 'keeper_stable');
    prop('station/container-flat', ...F.T(1.6, F.D - 2.0), { s: 0.8, r: F.r });
    prop('station/container', ...F.T(1.3, 2.2), { s: 0.7 });
    prop('station/container-tall', ...F.T(F.W - 1.1, F.D - 1.1), { s: 0.7 });
    prop('cyber/lever', ...F.T(F.W / 2 + 3.4, 4.6), { r: F.r });
    prop('scifi/prop-pipeholder', ...F.T(F.W / 2 - 1.0, F.D - 0.8), { r: F.r });
  }
  // The rig shop: plug-ins and kit
  {
    const F = frames.outfitter;
    stand('outfitter', F.W / 2 - 0.8, 5.0, 4.6, 'keeper_outfitter');
    prop('station/chair-armrest-headrest', ...F.T(F.W - 1.6, 3.0), { s: 0.62, r: F.r + Math.PI });     // the fitting chair
    prop('station/computer-system', ...F.T(F.W - 1.2, 5.4), { s: 0.6, r: F.r - Math.PI / 2 });
    for (let k = 0; k < 4; k++) {
      const [sx, sz] = F.T(2.6 + k * 1.5, F.D - 0.5);
      box(L, sx, 0, sz, 0.7, 1.1, 0.5, STEEL2, { solid: true });
      lit(k % 2 ? 'cyber/collectible-board' : 'cyber/collectible-gear', sx, sz, { y: 1.5, s: 0.7, r: F.r });
    }
  }
  // The clinic
  {
    const F = frames.clinic;
    stand('clinic', F.W / 2 + 2.0, 4.8, 3.2, 'keeper_clinic');
    prop('station/bed-single', ...F.T(1.4, F.D - 2.0), { s: 0.64, r: F.r, t: 'clinic' });
    prop('station/bed-single', ...F.T(3.6, F.D - 2.0), { s: 0.64, r: F.r, t: 'clinic' });
    rack(...F.T(F.W - 2.6, F.D - 0.4), 3.6, ['#e8e6de', '#b5483a', '#e8e6de', '#3f7f9a']);
    const [gx, gz] = F.T(2.5, F.D - 0.14);
    glow(gx, 2.4, gz, 1.0, 0.3, 0.05, NEON.green); glow(gx, 2.05, gz, 0.3, 1.0, 0.05, NEON.green);
    lit('cyber/pickup-health', ...F.T(F.W / 2 + 3.2, 4.8), { y: 1.36, s: 0.7 });
  }
  // The feed terminal
  {
    const F = frames.telegraph;
    stand('telegraph', F.W / 2, 4.6, 3.0, 'keeper_telegraph');
    prop('cyber/computer-large', ...F.T(1.6, F.D - 0.8), { r: F.r, s: 0.7 });
    prop('cyber/computer', ...F.T(F.W - 1.2, F.D - 0.8), { r: F.r });
    prop('station/computer-wide', ...F.T(F.W - 1.1, 2.4), { s: 0.6, r: F.r - Math.PI / 2 });
    prop('cyber/antenna-1', F.x0 + 1.2, F.zm - F.out * 0.3, { y: WALL_H, solid: false });
    prop('cyber/antenna-2', F.x1 - 1.4, F.zm - F.out * 0.3, { y: WALL_H + 0.7, solid: false });
  }

  // ---- customers: people standing at the bar, browsing, waiting -------------------------------
  const looksFor = ['townsman', 'townswoman', 'towns2', 'towns3', 'towns5', 'towns6', 'towns7'];
  const patrons = [
    ['saloon', F0 => F0.W / 2 - 0.9, 3.85, 0], ['saloon', F0 => F0.W / 2 + 4.9, 3.85, 0], ['saloon', () => 2.4, 3.5, 0],
    ['store', F0 => F0.W / 2 + 1.0, F0 => F0.D - 1.25, Math.PI], ['gunsmith', () => 4.9, F0 => F0.D - 1.3, Math.PI],
    ['clinic', () => 2.5, F0 => F0.D - 3.7, Math.PI], ['outfitter', F0 => F0.W - 1.6, 4.3, Math.PI],
  ];
  const fx = (v, F0) => (typeof v === 'function' ? v(F0) : v);
  patrons.slice(0, 4 + Math.min(3, prosperity)).forEach(([id, u, v, turn], k) => {
    const F0 = frames[id];
    const [px, pz] = F0.T(fx(u, F0), fx(v, F0));
    L.npcs.push({ role: 'townsfolk', name: 'Someone on the deck', x: P(px), y: P(pz), a: F0.face + turn, look: looksFor[(k * 3) % looksFor.length], fixed: true, patron: true });
  });

  // ---- Meridian's liaison office: a shut door and a clean sign ---------------------------
  {
    const x = (EAST - 2) * M, z = (ROW_S + 1) * M;
    box(L, x, 0, z - 0.06, 1.5, 2.5, 0.12, '#c8cede', { c2: '#8a90a8' });
    glow(x, 2.56, z - 0.14, 1.7, 0.06, 0.05, NEON.white);
    sign('MERIDIAN', x, 3.3, z - 0.3, 3.6, 0.7, 0, -1, NEON.white);
    light(x, 3.0, z - 1, NEON.white, 8);
    L.npcs.push({ role: 'agent', name: 'Mr Ashby', x: P(x + 1.6), y: P(z - 1.4), a: -Math.PI / 2, look: 'agent', fixed: true });
  }

  // ---- the freight lift ------------------------------------------------------------------
  {
    const lx = 6, lz = (ROW_N + ROW_S + 1) * M / 2;
    place(L, 'scifi/platform-round1', lx, lz, { s: 0.9, t: 'deckprop', solid: false });
    const ring = cyl(L, lx, 0.1, lz, 2.5, 0.04, NEON.gold, { seg: 20 }); ring.glow = true;
    cyl(L, lx, 0.12, lz, 2.3, 0.04, '#20222e', { seg: 20 });
    for (const dz of [-5.6, 5.6]) {
      box(L, 9.2, 0, lz + dz, 0.6, WALL_H, 0.6, DARK, { c2: DARK2, solid: 'wall' });
      glow(9.52, 0.3, lz + dz, 0.07, 3.2, 0.07, NEON.gold);
    }
    box(L, 9.2, 3.3, lz, 0.5, 1.1, 11.6, DARK, { c2: DARK2 });
    sign('FREIGHT LIFT', 9.47, 3.85, lz, 6.4, 0.86, 1, 0, NEON.gold);
    light(8, 3, lz, NEON.gold, 11);
    L.items.push({ kind: 'ride', x: P(lx), y: P(lz), r: 120 });
    prop('station/container-wide', 5.0, lz - 6.8, { s: 0.8 });
    prop('station/container', 7.0, lz - 7.0, { s: 0.8, r: 0.3 });
    prop('station/container-flat', 5.4, lz + 6.8, { s: 0.8, r: Math.PI / 2 });
    if (invest.includes('watchtower')) {
      for (const dz of [-4.2, 4.2]) {
        box(L, 10.6, 0, lz + dz, 0.5, 2.2, 0.5, STEEL, { c2: STEEL2, solid: true });
        place(L, 'cyber/turret-gun', 10.6, lz + dz, { y: 2.2, s: 0.5, t: 'street', solid: false });
        place(L, 'cyber/turret-gun#Turret_Gun_Top', 10.6, lz + dz, { y: 2.2, s: 0.5, r: -Math.PI / 2, t: 'street', solid: false });
        glow(10.6, 2.0, lz + dz, 0.56, 0.05, 0.56, NEON.red);
      }
    }
  }

  // ---- the concourse ---------------------------------------------------------------------------
  const zN = ROW_N * M, zS = (ROW_S + 1) * M, zc = (zN + zS) / 2, xE = (EAST + 3) * M;
  // street lights on the partitions between stalls
  for (const [xm, north] of [[7, true], [10, true], [14, true], [6, false], [9, false], [12, false]]) {
    const x = xm * M, z = north ? zN + 0.4 : zS - 0.4;
    prop('cyber/light-street-1', x, z, { r: north ? 0 : Math.PI, s: 0.82 });
    glow(x, 4.3, z + (north ? 0.8 : -0.8), 0.3, 0.06, 0.5, '#e8f4ff');
    light(x, 4.2, z + (north ? 0.9 : -0.9), '#cfe6ff', 12, 'lantern');
  }
  // beams overhead, with whatever people have hung from them
  const hung = ['cyber/sign-1', 'cyber/sign-2', 'cyber/sign-3', 'cyber/sign-small-1', 'cyber/sign-small-2', 'cyber/sign-small-3'];
  const tubes = [NEON.pink, NEON.cyan, NEON.violet, NEON.amber];
  for (let k = 0; 14 + k * 7 < xE - 4; k++) {
    const x = 14 + k * 7;
    box(L, x, WALL_H + 0.1, zc, 0.3, 0.3, zS - zN + 0.4, DARK2);
    glow(x, WALL_H + 0.04, zc, 0.06, 0.06, zS - zN - 0.4, tubes[k % tubes.length]);
    if (k % 2 === 0 || prosperity >= 2) {
      const z = zc - 2 + ((k * 5) % 5), m = hung[(k * 3 + 1) % hung.length];
      box(L, x, 3.95, z, 0.04, 0.6, 0.04, '#3a3d50');
      lit(m, x + 0.1, z, { y: 3.5, r: Math.PI / 2 });
      lit(m, x - 0.1, z, { y: 3.5, r: -Math.PI / 2 });
    }
    if (k % 3 === 1) prop('cyber/cable-small', x, zc - 1.5 + (k % 4), { y: WALL_H + 0.1, solid: false });
  }
  // signs on the stretch of bare wall between the feed terminal and the Wall
  lit('cyber/sign-4', 13.8 * M, zS - 0.08, { y: 2.3, r: Math.PI, s: 0.9 });
  lit('cyber/sign-small-1', 16.2 * M, zS - 0.08, { y: 2.7, r: Math.PI }); lit('cyber/sign-small-3', 16.2 * M, zS - 0.08, { y: 1.75, r: Math.PI });
  lit('cyber/sign-small-2', 1.6 * M, (ROW_N - 1) * M + 0.08, { y: 2.5, s: 1.4 });
  // freight and clutter where it is out of the way: against partitions and the bare wall
  for (const [m, x, z, y, r] of [
    ['scifi/prop-barrel-large', 6 * M + 0.1, zS - 0.6, 0, 0], ['scifi/prop-crate3', 12 * M - 0.1, zS - 0.6, 0.5, 0.3],
    ['scifi/prop-crate4', 15.0 * M, zS - 0.7, 0.6, 0.2], ['scifi/prop-crate3', 15.0 * M + 1.2, zS - 0.6, 0.5, 0.6],
    ['scifi/prop-barrel-large', 13.2 * M, zS - 0.6, 0, 0],
  ]) prop(m, x, z, { y, r });
  for (const [x, z] of [[30, zN + 0.4], [46, zS - 0.4]]) prop('scifi/prop-vent-big', x, z, { solid: false, y: 0.02 });
  // a public screen on the end wall, looking down the concourse
  prop('cyber/tv-3', xE - 0.6, zc, { r: -Math.PI / 2, s: 0.8 });
  light(xE - 1.4, 3, zc, NEON.cyan, 10);
  // a bench against the bare wall
  box(L, 15.8 * M, 0, zS - 0.5, 2.2, 0.42, 0.6, STEEL, { c2: STEEL2, solid: true });
  glow(15.8 * M, 0.05, zS - 0.5, 2.3, 0.04, 0.7, NEON.violet);

  // ---- the range, beside the gun counter ----------------------------------------------------------
  {
    const x0 = EAST * M, x1 = (EAST + 3) * M;
    for (let k = 0; k < 2; k++) {
      const x = x0 + 2.5 + k * 5;
      box(L, x, 0, 19.5, 3.2, 0.95, 0.3, STEEL, { c2: STEEL2, solid: true });
      glow(x, 0.95, 19.5, 3.2, 0.04, 0.34, NEON.red);
    }
    for (let k = 0; k < 4; k++) {
      const x = x0 + 1.8 + k * 2.8, z = 6.4 + (k % 2) * 1.6;
      L.spawns.push({ kind: 'target', x: P(x), y: P(z + 1.0), respawn: 2.5 });
      box(L, x, 0, z, 0.5, 0.9, 0.5, STEEL, { c2: STEEL2 });
      glow(x, 0.9, z, 0.56, 0.04, 0.56, NEON.red);
    }
    for (let z = 8; z <= 16; z += 4) { glow(x0 + 0.2, 0.02, z, 0.06, 0.02, 3.0, NEON.red); glow(x1 - 0.2, 0.02, z, 0.06, 0.02, 3.0, NEON.red); }
    sign('RANGE', (x0 + x1) / 2, 3.6, 4.2, 4.2, 0.8, 0, 1, NEON.red);
    light((x0 + x1) / 2, 3.2, 7, NEON.red, 11);
    light((x0 + x1) / 2, 3.6, 18, '#ffe2c0', 11, 'lantern');
    paint(L, x0 / TM, 4 / TM, x1 / TM - 1, zN / TM - 1, GROUND.hull);
    L.zones.push({ name: 'The range', x0: P(x0), y0: P(4), x1: P(x1), y1: P(zN) });
  }

  // ---- the Wall: names of the flatlined ---------------------------------------------------------------
  {
    const x0 = EAST * M, x1 = (EAST + 3) * M, zb = (ROW_S + 4) * M;
    box(L, (x0 + x1) / 2, 0, zb - 0.3, 11.2, 3.6, 0.4, '#101119', { solid: 'wall' });
    sign('THE WALL', (x0 + x1) / 2, 3.1, zb - 0.52, 4.0, 0.6, 0, -1, NEON.white);
    const fallen = spec.fallen || [];
    for (let k = 0; k < 9; k++) {
      const x = x0 + 1.2 + k * 1.2, dead = fallen[k];
      for (let row = 0; row < 5; row++) glow(x, 0.6 + row * 0.42, zb - 0.52, 0.8, 0.14, 0.03, dead && row === 2 ? NEON.amber : (k * 3 + row * 5) % 7 < 2 ? '#3a4a66' : '#5a7090');
      L.items.push({
        kind: 'grave', x: P(x), y: P(zb - 1.6), r: 40,
        text: dead ? `${dead.name}. ${dead.epitaph}` : (k % 3 === 0 ? 'A column of unit numbers. Someone has scratched names over them.' : k % 3 === 1 ? 'Calloway shift, level 9. Forty names, one plate.' : 'A plate worn smooth by thumbs. No name left on it.'),
      });
    }
    light((x0 + x1) / 2, 2.4, zb - 1.6, '#9ab8ff', 10);
    for (const x of [x0 + 0.6, x1 - 0.6]) { cyl(L, x, 0, zb - 1.0, 0.16, 0.5, STEEL2, { solid: true }); const f = cyl(L, x, 0.5, zb - 1.0, 0.1, 0.14, NEON.amber); f.glow = true; light(x, 0.8, zb - 1.0, NEON.amber, 5); }
    L.npcs.push({ role: 'undertaker', name: 'The engraver', x: P((x0 + x1) / 2 + 3.4), y: P(zS + 2.0), a: Math.PI / 2, look: 'undertaker', fixed: true });
    paint(L, x0 / TM, zS / TM, x1 / TM - 1, zb / TM - 1, GROUND.hull);
    L.zones.push({ name: 'The Wall', x0: P(x0), y0: P(zS), x1: P(x1), y1: P(zb) });
  }

  // ---- people who walk the deck -----------------------------------------------------------------------
  const walkers = [
    { look: 'townsman', route: [[14, 26], [40, 25.5], [66, 26.5], [50, 30]] },
    { look: 'townswoman', route: [[62, 30.5], [36, 30], [16, 29], [44, 26]] },
    { look: 'towns2', route: [[74, 18], [74, 28], [54, 30.5], [30, 25.5]] },
    { look: 'towns3', route: [[74, 38], [70, 30], [26, 26], [58, 26]] },
  ];
  walkers.slice(0, 2 + Math.min(2, Math.floor(prosperity / 2))).forEach((wk, k) => {
    L.npcs.push({ role: 'townsfolk', name: 'Someone on the deck', x: P(wk.route[0][0]), y: P(wk.route[0][1]), a: 0, look: wk.look, route: wk.route.map(([x, y]) => [P(x), P(y)]), idx: k });
  });

  L.zones.push({ name: 'The concourse', x0: P(10), y0: P(zN), x1: P(EAST * M), y1: P(zS) });
  L.zones.push({ name: 'The freight lift', x0: P(4), y0: P(zN - M), x1: P(9), y1: P(zS + M), exit: true });
  const home = frames.saloon.T(frames.saloon.W / 2, -3);
  L.start = spec.arrive === 'saloon' ? { x: P(home[0]), y: P(home[1]), a: 0 } : { x: P(12.5), y: P(zc), a: 0 };
  return L;
}
