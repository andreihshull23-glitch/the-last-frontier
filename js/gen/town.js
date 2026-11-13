// Mercy: the walkable town between rides. The layout is fixed; what stands in
// it depends on the campaign (investments, graves, how far the story has run).
import { TILE, PX, MACRO, SOLID, GROUND, SHOPS } from '../content.js';
import { makeRng } from '../rng.js';
import { createLevel, building, skinRock, place, box, cyl, paint, reserve, metres, centreM, tileCentre, setTile } from '../level.js';
import { scatter, DESERT_FLORA, DESERT_ROCKS, PEBBLES, TM } from './common.js';
import { horse, wagon, barrel, crate, hitchRail, lampPost, trough, well, waterTower, grave, jobBoard, archGate, table, counter, shelfWall, flag } from './props.js';

const P = (m) => m * PX;

// Interior frame: u across the room, v from the door wall to the back wall (metres).
function frame(B, side) {
  const x0 = metres(B.in.x0), x1 = metres(B.in.x1 + 1), z0 = metres(B.in.y0), z1 = metres(B.in.y1 + 1);
  if (side === 's') return { W: x1 - x0, D: z1 - z0, T: (u, v) => [x0 + u, z1 - v], r: 0, face: Math.PI / 2 };
  return { W: x1 - x0, D: z1 - z0, T: (u, v) => [x1 - u, z0 + v], r: Math.PI, face: -Math.PI / 2 };
}

export function generateTown(spec = {}) {
  const rng = makeRng((spec.seed ?? 20251) | 0);
  const invest = spec.investments || [];
  const prosperity = spec.prosperity ?? 0;
  const L = createLevel('town', 'town', 28, 20);
  L.name = 'Mercy';
  const { mw, mh } = L;

  // ---- the bowl the town sits in -------------------------------------------
  L.rock.fill(1);
  for (let my = 2; my <= 17; my++) for (let mx = 2; mx <= 25; mx++) {
    const corner = (mx <= 3 || mx >= 24) && (my <= 3 || my >= 16);
    const nick = (mx === 2 || mx === 25 || my === 2 || my === 17) && rng.chance(0.28);
    if (!(corner && (mx === 2 || mx === 25 || my === 2 || my === 17)) && !nick) L.rock[my * mw + mx] = 0;
  }
  for (let mx = 0; mx <= 2; mx++) for (let my = 9; my <= 10; my++) L.rock[my * mw + mx] = 0; // the canyon mouth
  for (let my = 8; my <= 11; my++) L.rock[my * mw + 2] = 0;

  // keep the lots clear before the rock is skinned
  reserve(L, 16, 40, 207, 120);
  skinRock(L, rng, { roundChance: 0.9 });

  // ---- ground ----------------------------------------------------------------
  paint(L, 0, 70, 196, 89, GROUND.trail);                 // main street
  paint(L, 111, 20, 119, 70, GROUND.trail);               // alley to the range
  paint(L, 176, 60, 186, 70, GROUND.trail);               // path up to Boot Hill
  for (let ty = 60; ty < 100; ty++) for (let tx = 16; tx < 200; tx++) {
    const i = ty * L.w + tx;
    if (L.ground[i] === GROUND.sand && rng.chance(0.5) && (ty < 70 || ty > 89)) L.ground[i] = GROUND.trail;
  }

  // ---- buildings ---------------------------------------------------------------
  const shops = {};
  const mk = (id, o) => {
    shops[id] = building(L, rng, { windows: o.windows ?? 0.55, lit: true, name: SHOPS[id]?.name, sign: SHOPS[id]?.sign, ...o });
    shops[id].side = o.doors[0].side;
    return shops[id];
  };
  mk('stable', { x: 30, y: 44, mw: 3, md: 3, style: 'wood', front: 's', doors: [{ side: 's', at: 1, wide: true }], windows: 0.3 });
  mk('saloon', { x: 58, y: 44, mw: 4, md: 3, style: 'red', front: 's', porch: 's', doors: [{ side: 's', at: 1, wide: true }] });
  mk('store', { x: 92, y: 44, mw: 3, md: 3, style: 'sage', front: 's', porch: 's', doors: [{ side: 's', at: 1, leaf: true, kind: 'c' }] });
  mk('gunsmith', { x: 120, y: 44, mw: 3, md: 3, style: 'wood_dark', front: 's', porch: 's', doors: [{ side: 's', at: 1, leaf: true, kind: 'a' }] });
  mk('hall', { x: 148, y: 44, mw: 4, md: 3, style: 'cream', front: 's', porch: 's', doors: [{ side: 's', at: 1, wide: true }] });
  mk('outfitter', { x: 36, y: 98, mw: 3, md: 3, style: 'ochre', front: 'n', porch: 'n', doors: [{ side: 'n', at: 1, leaf: true, kind: 'c' }] });
  mk('clinic', { x: 64, y: 98, mw: 3, md: 2, style: 'blue', front: 'n', porch: 'n', doors: [{ side: 'n', at: 1, leaf: true, kind: 'b' }] });
  mk('telegraph', { x: 92, y: 98, mw: 2, md: 2, style: 'teal', front: 'n', porch: 'n', doors: [{ side: 'n', at: 0, leaf: true, kind: 'a' }] });
  const office = building(L, rng, { x: 118, y: 98, mw: 3, md: 2, style: 'company', front: 'n', sign: 'MERIDIAN CO.', doors: [{ side: 'n', at: 1, leaf: true, kind: 'b' }], windows: 0.6, lit: true, name: 'Meridian Company office' });

  const keeper = (id, x, y, a, look, extra = {}) => L.npcs.push({ role: 'keeper', shop: id, name: SHOPS[id].keeper, x: P(x), y: P(y), a, look, fixed: true, ...extra });
  const shopSpot = (id, x, y, r = 64) => L.items.push({ kind: 'shop', shop: id, x: P(x), y: P(y), r });

  // ---- General Store -------------------------------------------------------------
  {
    const B = shops.store, F = frame(B, 's');
    const [cx, cz] = F.T(F.W / 2 - 0.5, F.D - 2.7);
    counter(L, cx, cz, 0, F.W - 3.2);
    box(L, cx + 1.6, 1.1, cz, 0.5, 0.36, 0.42, '#5a5a62', { c2: '#3a3a42' });      // the till
    shelfWall(L, ...F.T(F.W / 2, F.D - 0.34), 0, F.W - 0.8);
    shelfWall(L, ...F.T(0.34, F.D / 2 - 0.4), Math.PI / 2, 3.6);
    place(L, 'shop/display-fruit', ...F.T(1.5, 2.0), { s: 0.8 });
    place(L, 'shop/display-cans', ...F.T(F.W - 1.5, 4.0), { s: 0.7 });
    place(L, 'shop/display-bread', ...F.T(F.W - 1.4, 1.9), { s: 0.8, r: Math.PI / 2 });
    barrel(L, ...F.T(F.W - 0.8, F.D - 3.6)); barrel(L, ...F.T(F.W - 0.8, F.D - 4.5), { c: '#7a5a3a' });
    crate(L, ...F.T(0.9, 0.9), 0.2, 0.8);
    const [kx, kz] = F.T(F.W / 2 - 0.5, F.D - 1.55);
    keeper('store', kx, kz, F.face, 'keeper_store');
    shopSpot('store', ...F.T(F.W / 2 - 0.5, F.D - 3.9));
  }
  // ---- Gunsmith --------------------------------------------------------------------
  {
    const B = shops.gunsmith, F = frame(B, 's');
    const [cx, cz] = F.T(F.W / 2 + 0.4, F.D - 2.7);
    counter(L, cx, cz, 0, F.W - 3.4, { c: '#6e4a30', top: '#4a4a52' });
    // rifles on the back wall
    const guns = ['gun/blaster-d', 'gun/blaster-l', 'gun/blaster-c', 'gun/blaster-n', 'gun/blaster-h'];
    guns.forEach((g, k) => {
      const [gx, gz] = F.T(1.4 + k * 1.5, F.D - 0.22);
      box(L, gx, 1.5, gz, 1.3, 0.9, 0.06, '#5c3e2a');
      place(L, g, gx, gz + 0.14, { y: 1.95, r: Math.PI / 2, s: 1.35, t: 'gun', solid: false });
    });
    place(L, 'arena/weapon-rack', ...F.T(0.7, 3.2), { r: Math.PI / 2, s: 0.9, t: 'timber' });
    place(L, 'gun/crate-wide', ...F.T(F.W - 0.9, 1.2), { s: 1.5, t: 'crate', r: Math.PI / 2 });
    place(L, 'gun/crate-wide#lid', ...F.T(F.W - 0.9 + 0.375, 1.2), { y: 0.285, s: 1.5, t: 'crate', r: Math.PI / 2, solid: false });
    box(L, ...((p) => [p[0], 0, p[1]])(F.T(0.9, F.D - 1.2)), 0.7, 0.55, 0.5, '#3a3a42', { c2: '#24242a', solid: true }); // anvil block
    box(L, ...((p) => [p[0], 0.55, p[1]])(F.T(0.9, F.D - 1.2)), 0.95, 0.22, 0.36, '#4a4a52');
    const [kx, kz] = F.T(F.W / 2 + 0.4, F.D - 1.55);
    keeper('gunsmith', kx, kz, F.face, 'keeper_gunsmith');
    shopSpot('gunsmith', ...F.T(F.W / 2 + 0.4, F.D - 3.9));
  }
  // ---- Saloon ------------------------------------------------------------------------
  {
    const B = shops.saloon, F = frame(B, 's');
    const [cx, cz] = F.T(F.W / 2 + 1.0, F.D - 2.4);
    counter(L, cx, cz, 0, F.W - 4.4, { c: '#6a3a2a', top: '#8a5a3a' });
    shelfWall(L, ...F.T(F.W / 2 + 1.0, F.D - 0.34), 0, F.W - 4.6, { stock: ['#b5773a', '#8e3428', '#d9a83a', '#5b7f4b', '#c9b48a'] });
    table(L, ...F.T(2.2, 2.4)); table(L, ...F.T(5.6, 3.0), { turn: 0.7 }); table(L, ...F.T(9.4, 2.3), { turn: 1.4 });
    // an upright piano against the left wall
    const [px2, pz2] = F.T(0.55, F.D - 2.4);
    box(L, px2, 0, pz2, 0.6, 1.3, 1.6, '#3b2a20', { c2: '#2a1c14', solid: 'wall' });
    box(L, px2 + 0.34, 0.75, pz2, 0.3, 0.06, 1.4, '#ece2c8');
    const [kx, kz] = F.T(F.W / 2 + 1.0, F.D - 1.4);
    keeper('saloon', kx, kz, F.face, 'keeper_saloon');
    shopSpot('saloon', ...F.T(F.W / 2 + 1.0, F.D - 3.6));
    // the job board stands on the boardwalk by the door
    const [bx, bz] = [metres(B.x) + 1.9, metres(B.y1) + 1.35];
    jobBoard(L, bx, bz, 0);
    L.items.push({ kind: 'board', x: P(bx), y: P(bz + 1.0), r: 62 });
    L.npcs.push({ role: 'rider', name: 'Nell Dunmore', x: P(metres(B.x1) - 1.6), y: P(metres(B.y1) + 1.5), a: Math.PI / 2, look: 'rider', fixed: true });
  }
  // ---- Town Hall -----------------------------------------------------------------------
  {
    const B = shops.hall, F = frame(B, 's');
    const [cx, cz] = F.T(F.W / 2 - 1.2, F.D - 2.6);
    counter(L, cx, cz, 0, 3.4, { c: '#7a5236', top: '#3f6e4a' });
    flag(L, ...F.T(1.0, F.D - 0.9), 1.5);
    shelfWall(L, ...F.T(F.W / 2 - 1.2, F.D - 0.34), 0, 5, { stock: ['#8a623c', '#6e4a30', '#9c6b43', '#c9b48a'] });
    // the jail cell in the back corner
    const cellW = 3.0, cellD = 3.0;
    for (let k = 0; k <= 8; k++) {
      const [bx, bz] = F.T(F.W - cellW, F.D - 0.2 - (k / 8) * cellD);
      box(L, bx, 0, bz, 0.07, 2.6, 0.07, '#4a4a52');
      setTile(L, Math.floor(bx / TM), Math.floor(bz / TM), SOLID, 26, GROUND.wood);
    }
    for (let k = 0; k <= 8; k++) {
      const [bx, bz] = F.T(F.W - cellW + (k / 8) * cellW, F.D - 0.2 - cellD);
      box(L, bx, 0, bz, 0.07, 2.6, 0.07, '#4a4a52');
      setTile(L, Math.floor(bx / TM), Math.floor(bz / TM), SOLID, 26, GROUND.wood);
    }
    box(L, ...((p) => [p[0], 2.55, p[1]])(F.T(F.W - cellW / 2, F.D - 0.2 - cellD)), cellW, 0.1, 0.1, '#4a4a52');
    box(L, ...((p) => [p[0], 0, p[1]])(F.T(F.W - 0.6, F.D - 1.4)), 0.7, 0.45, 1.8, '#7a5236', { c2: '#5c3e2a' });
    table(L, ...F.T(2.6, 2.6), { stools: false });
    const [kx, kz] = F.T(F.W / 2 - 1.2, F.D - 1.5);
    keeper('hall', kx, kz, F.face, 'clerk', { name: 'Clerk Winslow' });
    shopSpot('hall', ...F.T(F.W / 2 - 1.2, F.D - 3.8));
    L.npcs.push({ role: 'marshal', name: 'Marshal Ada Quill', x: P(metres(B.x) + 2.2), y: P(metres(B.y1) + 1.5), a: Math.PI / 2, look: 'marshal', fixed: true });
  }
  // ---- Livery ----------------------------------------------------------------------------
  {
    const B = shops.stable, F = frame(B, 's');
    for (const [u, v, s] of [[1.0, F.D - 1.0, 1.1], [2.3, F.D - 0.9, 0.9], [1.2, F.D - 2.2, 0.9]]) {
      const [hx, hz] = F.T(u, v);
      box(L, hx, 0, hz, 1.1 * s, 0.7 * s, 0.8 * s, '#d9b443', { c2: '#b08a2e', solid: true, r: u });
    }
    box(L, ...((p) => [p[0], 0.7, p[1]])(F.T(1.0, F.D - 1.0)), 0.9, 0.6, 0.7, '#d9b443', { c2: '#b08a2e', r: 0.4 });
    place(L, 'nat/fence_simple', ...F.T(F.W - 3.2, F.D - 3.1), { centre: true,  r: 0 });
    place(L, 'nat/fence_simple', ...F.T(F.W - 3.2, F.D - 0.2), { centre: true,  r: 0, solid: false });
    horse(L, ...F.T(F.W - 1.6, F.D - 1.6), Math.PI, '#5a3a26');
    barrel(L, ...F.T(F.W - 0.7, 0.8));
    const [kx, kz] = F.T(2.6, 2.6);
    keeper('stable', kx, kz, F.face, 'keeper_stable');
    shopSpot('stable', ...F.T(2.6, 1.4), 70);
    // corral beside the stable
    const cx0 = metres(B.x) - 7.5, cz0 = metres(B.y) + 1.5;
    for (let k = 0; k < 3; k++) {
      place(L, 'nat/fence_simple', cx0 + 1.5 + k * 3, cz0, { centre: true,  r: 0 });
      place(L, 'nat/fence_simple', cx0 + 1.5 + k * 3, cz0 + 7.5, { centre: true,  r: 0 });
    }
    for (let k = 0; k < 2; k++) place(L, 'nat/fence_simple', cx0, cz0 + 2.25 + k * 3, { centre: true,  r: Math.PI / 2 });
    place(L, 'nat/fence_gate', cx0 + 9, cz0 + 3.75, { centre: true,  r: Math.PI / 2 });
    place(L, 'nat/fence_simple', cx0 + 9, cz0 + 0.9, { centre: true,  r: Math.PI / 2, s: [1, 1, 0.6] });
    horse(L, cx0 + 3, cz0 + 3.2, 0.6, '#8a5a36', { saddle: false });
    horse(L, cx0 + 5.6, cz0 + 5.2, 2.4, '#c9b48a', { saddle: false });
    trough(L, cx0 + 4.5, cz0 + 0.8);
    paint(L, Math.floor(cx0 / TM), Math.floor(cz0 / TM), Math.floor((cx0 + 9) / TM), Math.floor((cz0 + 7.5) / TM), GROUND.camp);
    reserve(L, Math.floor(cx0 / TM) - 1, Math.floor(cz0 / TM) - 1, Math.floor((cx0 + 9) / TM) + 1, Math.floor((cz0 + 7.5) / TM) + 1);
  }
  // ---- Outfitter ----------------------------------------------------------------------------
  {
    const B = shops.outfitter, F = frame(B, 'n');
    const [cx, cz] = F.T(F.W / 2 - 0.5, F.D - 2.7);
    counter(L, cx, cz, 0, F.W - 3.2, { c: '#8a5a3a' });
    shelfWall(L, ...F.T(F.W / 2, F.D - 0.34), 0, F.W - 0.8, { stock: ['#8a623c', '#3d342e', '#c9b48a', '#6f5136', '#b5483a'] });
    place(L, 'shop/clothing-rack', ...F.T(1.5, 2.2), { s: 0.8, r: F.r });
    place(L, 'shop/clothing-rack', ...F.T(F.W - 1.5, 3.6), { s: 0.8, r: F.r + Math.PI / 2 });
    place(L, 'shop/mannequin', ...F.T(F.W - 1.2, 1.3), { s: 0.9, r: F.r + Math.PI });
    place(L, 'shop/clothing-table', ...F.T(1.6, 4.6), { s: 0.8, r: F.r });
    const [kx, kz] = F.T(F.W / 2 - 0.5, F.D - 1.55);
    keeper('outfitter', kx, kz, F.face, 'keeper_outfitter');
    shopSpot('outfitter', ...F.T(F.W / 2 - 0.5, F.D - 3.9));
  }
  // ---- Clinic ----------------------------------------------------------------------------------
  {
    const B = shops.clinic, F = frame(B, 'n');
    place(L, 'nat/bed', ...F.T(1.2, F.D - 1.4), { r: F.r, s: 1.1 });
    place(L, 'nat/bed', ...F.T(3.0, F.D - 1.4), { r: F.r, s: 1.1 });
    shelfWall(L, ...F.T(F.W - 2.0, F.D - 0.34), 0, 3.2, { stock: ['#ece6d8', '#b5483a', '#ece6d8', '#3f6e8c', '#d8c39a'] });
    counter(L, ...F.T(F.W - 2.0, F.D - 2.2), 0, 2.4, { c: '#d8d2c4', top: '#ece6d8' });
    const [kx, kz] = F.T(F.W - 2.0, F.D - 1.3);
    keeper('clinic', kx, kz, F.face, 'keeper_clinic');
    shopSpot('clinic', ...F.T(F.W - 2.0, F.D - 3.3));
  }
  // ---- Telegraph ---------------------------------------------------------------------------------
  {
    const B = shops.telegraph, F = frame(B, 'n');
    counter(L, ...F.T(F.W / 2, F.D - 2.2), 0, F.W - 2.2, { c: '#7a5236' });
    box(L, ...((p) => [p[0], 1.1, p[1]])(F.T(F.W / 2 + 0.8, F.D - 2.2)), 0.4, 0.12, 0.26, '#c9a05a');
    shelfWall(L, ...F.T(F.W / 2, F.D - 0.34), 0, F.W - 0.8, { stock: ['#ece2c8', '#d8c39a', '#ece2c8', '#c9b48a'] });
    const [kx, kz] = F.T(F.W / 2, F.D - 1.3);
    keeper('telegraph', kx, kz, F.face, 'keeper_telegraph');
    shopSpot('telegraph', ...F.T(F.W / 2, F.D - 3.3));
    // the pole and its line out of town
    const px0 = metres(B.x1) + 1.6, pz0 = metres(B.y) - 1.0;
    box(L, px0, 0, pz0, 0.2, 6.2, 0.2, '#6e4a30', { c2: '#4a3220' });
    box(L, px0, 5.6, pz0, 1.6, 0.14, 0.14, '#6e4a30');
    L.npcs.push({ role: 'agent', name: 'Mr Ashby', x: P(metres(office.x) + 4.5), y: P(metres(office.y) - 1.4), a: -Math.PI / 2, look: 'agent', fixed: true });
  }

  // ---- the street ------------------------------------------------------------------------------------
  archGate(L, 9.5, 40, Math.PI / 2, 9, 'MERCY');
  L.items.push({ kind: 'ride', x: P(4.2), y: P(40), r: 120 });
  hitchRail(L, 20.5, 33.9, 0, 3.4);
  horse(L, 20.2, 35.0, Math.PI, '#7a4e30');
  hitchRail(L, 37.5, 34.2, 0, 3);
  hitchRail(L, 52.5, 34.2, 0, 3);
  trough(L, 44.5, 34.4);
  wagon(L, 88, 46.6, 1.2, { load: true });
  well(L, 76, 52.5);
  waterTower(L, 81.5, 60);
  for (const [lx, lz] of [[27, 34.6], [45, 45.6], [57.5, 34.6], [73, 45.6], [87, 34.6], [57, 45.6], [31.5, 45.6]]) lampPost(L, lx, lz);
  for (const [bx, bz] of [[30.2, 32.6], [47.3, 32.4], [55.6, 32.6], [69.6, 32.5], [84.6, 47.9], [17.6, 48.4], [33.6, 48.2]]) barrel(L, bx, bz);
  crate(L, 60.6, 32.5, 0.3, 0.8); crate(L, 61.4, 32.6, 0.1, 0.6);
  crate(L, 43.9, 48.3, 0.2, 0.85);
  place(L, 'nat/sign', 13.5, 36.2, { r: -Math.PI / 2 });
  if (prosperity >= 2) for (const [fx, fz] of [[36.8, 33.0], [72.6, 32.9], [22.5, 48.0]]) place(L, 'nat/pot_small', fx, fz, { s: 0.8 });
  if (prosperity >= 3) { place(L, 'arena/banner', 74.6, 33.3, { s: 0.9 }); place(L, 'arena/banner', 85.4, 33.3, { s: 0.9 }); }

  // ---- watchtower (an investment you can see) --------------------------------------------------------
  if (invest.includes('watchtower')) {
    const wx = 14.5, wz = 30;
    place(L, 'forest/building-structure', wx, wz, { s: 1.2, t: 'timber' });
    place(L, 'forest/building-structure', wx, wz, { y: 2.88, s: 1.2, t: 'timber', solid: false });
    place(L, 'forest/building-platform', wx, wz, { y: 5.76, s: 1.25, t: 'timber', solid: false });
    place(L, 'forest/building-roof', wx, wz, { y: 6.9, s: 1.15, t: 'timber', solid: false });
    place(L, 'forest/ladder', wx, wz + 1.5, { s: 2.4, solid: false, t: 'timber' });
  }

  // ---- shooting range ----------------------------------------------------------------------------------
  {
    for (let k = 0; k < 4; k++) place(L, 'nat/fence_simple', 49.5 + k * 3, 19.5, { centre: true,  r: 0 });
    for (let k = 0; k < 4; k++) L.spawns.push({ kind: 'target', x: P(50 + k * 3), y: P(11.2 + (k % 2) * 1.2), respawn: 2.5 });
    for (let k = 0; k < 4; k++) box(L, 50 + k * 3, 0, 10.2 + (k % 2) * 1.2, 0.5, 0.9, 0.5, '#d9b443', { c2: '#b08a2e' });
    place(L, 'nat/sign', 57.2, 21.8, { r: Math.PI });
    L.zones.push({ name: 'Shooting range', x0: P(46), y0: P(9), x1: P(62), y1: P(24) });
    paint(L, 94, 16, 124, 38, GROUND.camp);
    reserve(L, 92, 16, 126, 40);
  }

  // ---- Boot Hill --------------------------------------------------------------------------------------
  {
    const gx0 = 90, gz0 = 12, gx1 = 101, gz1 = 30;
    for (let x = gx0 + 1.5; x < gx1; x += 3) { place(L, 'nat/fence_simple', x, gz0, { centre: true, }); if (Math.abs(x - 94.5) > 1) place(L, 'nat/fence_simple', x, gz1, { centre: true, }); }
    for (let z = gz0 + 1.5; z < gz1; z += 3) { place(L, 'nat/fence_simple', gx0, z, { centre: true,  r: Math.PI / 2 }); }
    place(L, 'nat/tree_thin_fall', 98.5, 15, { s: 1.5 });
    place(L, 'nat/stump_oldTall', 92, 14.5, {});
    const fallen = spec.fallen || [];
    const slots = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) slots.push([92.2 + col * 3.0, 17.5 + row * 4.0]);
    slots.forEach(([sx, sz], k) => {
      const dead = fallen[k];
      grave(L, sx, sz, 0, dead ? 0 : 1);
      L.items.push({ kind: 'grave', x: P(sx), y: P(sz + 1.2), r: 46, text: dead ? `${dead.name}. ${dead.epitaph}` : (k % 2 ? 'A stone worn smooth. No name left on it.' : 'Calloway crew. Forty names, one stone.') });
    });
    L.npcs.push({ role: 'undertaker', name: 'The undertaker', x: P(94.5), y: P(31.4), a: Math.PI / 2, look: 'undertaker', fixed: true });
    L.zones.push({ name: 'Boot Hill', x0: P(gx0), y0: P(gz0), x1: P(gx1), y1: P(gz1) });
    paint(L, gx0 * 2, gz0 * 2, gx1 * 2, gz1 * 2, GROUND.grass);
    reserve(L, gx0 * 2 - 2, gz0 * 2 - 2, gx1 * 2 + 2, gz1 * 2 + 6);
  }

  // ---- townsfolk who wander the street -----------------------------------------------------------------
  const walkers = [
    { look: 'townsman', route: [[24, 38], [52, 37.5], [86, 38.5], [60, 42]] },
    { look: 'townswoman', route: [[70, 42.5], [40, 43], [20, 41.5], [48, 37]] },
    { look: 'towns2', route: [[57.5, 28], [57.5, 37], [78, 42], [57.5, 40]] },
    { look: 'towns3', route: [[88, 37], [66, 43.5], [34, 38], [70, 38]] },
  ];
  walkers.slice(0, 2 + Math.min(2, Math.floor(prosperity / 2))).forEach((wk, k) => {
    L.npcs.push({ role: 'townsfolk', name: 'Townsfolk', x: P(wk.route[0][0]), y: P(wk.route[0][1]), a: 0, look: wk.look, route: wk.route.map(([x, y]) => [P(x), P(y)]), idx: k });
  });

  // ---- dressing -----------------------------------------------------------------------------------------
  scatter(L, rng, 70, DESERT_FLORA);
  scatter(L, rng, 16, DESERT_ROCKS, { near: 'wall' });
  scatter(L, rng, 90, PEBBLES);

  L.zones.push({ name: 'Main Street', x0: P(16), y0: P(35), x1: P(98), y1: P(45) });
  L.zones.push({ name: 'The trail out', x0: 0, y0: P(35), x1: P(9), y1: P(45), exit: true });
  L.start = { x: P(spec.arrive === 'saloon' ? 40 : 15), y: P(spec.arrive === 'saloon' ? 37 : 40), a: 0 };
  return L;
}
