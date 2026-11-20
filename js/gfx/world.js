// Turns a level into meshes: painted ground, rock caps, merged props per
// 16 m sector, roofs that can be hidden, doors, signs and glass.
import { buildCanopy } from './canopy.js';
import { TILE, PX, MACRO, SOLID, ROCK, WATER, GROUND } from '../content.js';
import { Merger } from './assets.js';

const TM = TILE / PX;
const SECTOR = 32; // tiles (16 m)

const G = GROUND;
const BASE_GROUND = {
  [G.sand]: [222, 178, 126], [G.trail]: [203, 152, 106], [G.rockfloor]: [204, 146, 108], [G.wood]: [146, 102, 66],
  [G.grass]: [182, 164, 98], [G.camp]: [170, 124, 86], [G.water]: [64, 142, 164], [G.paving]: [176, 168, 158],
  [G.mine]: [112, 94, 80], [G.hollow]: [66, 58, 90], [G.field]: [142, 106, 68], [G.plank]: [164, 120, 78], [G.gravel]: [184, 168, 146],
  [G.deck]: [118, 104, 92], [G.grate]: [88, 76, 68], [G.hull]: [78, 80, 94], [G.glow]: [96, 176, 188],
};
const CITY_GROUND = {
  ...BASE_GROUND, [G.sand]: [54, 56, 72], [G.trail]: [74, 76, 98], [G.rockfloor]: [60, 60, 76], [G.wood]: [70, 74, 96], [G.grass]: [58, 64, 74], [G.camp]: [66, 60, 80],
  [G.paving]: [84, 78, 104], [G.field]: [196, 164, 44], [G.plank]: [76, 80, 104], [G.gravel]: [64, 64, 80], [G.deck]: [60, 64, 84], [G.grate]: [40, 43, 58], [G.hull]: [48, 50, 70], [G.glow]: [70, 215, 235],
};
export const THEMES = {
  // a district of the Spire: wet-dark paving, worn lanes, roofs you never see lit
  red: { ground: CITY_GROUND, cap: [15, 16, 25], rockTint: 'mine' },
  town: { ground: CITY_GROUND, cap: [15, 16, 25], rockTint: 'mine' },
  mine: {
    ground: { ...BASE_GROUND, [G.sand]: [118, 98, 84], [G.trail]: [128, 108, 90], [G.rockfloor]: [104, 86, 76], [G.mine]: [112, 94, 80], [G.camp]: [96, 78, 66] },
    cap: [34, 28, 28], rockTint: 'mine', dark: true,
  },
  works: { ground: { ...CITY_GROUND, [G.deck]: [72, 60, 62], [G.grate]: [44, 36, 40], [G.plank]: [92, 80, 84] }, cap: [20, 14, 16], rockTint: 'mine' },
  foundry: { ground: { ...CITY_GROUND, [G.deck]: [62, 70, 92], [G.grate]: [38, 42, 58] }, cap: [14, 16, 24], rockTint: null },
  ship: { ground: { ...CITY_GROUND, [G.hull]: [52, 44, 72], [G.glow]: [150, 110, 255] }, cap: [16, 12, 24], rockTint: null },
  deck: {
    ground: CITY_GROUND,
    cap: [15, 16, 25], rockTint: null,
  },
  hollow: {
    ground: { ...BASE_GROUND, [G.sand]: [74, 64, 100], [G.trail]: [88, 76, 116], [G.rockfloor]: [64, 56, 90], [G.hollow]: [52, 44, 78], [G.grass]: [84, 80, 120], [G.camp]: [60, 52, 80] },
    cap: [70, 58, 100], rockTint: 'hollow',
  },
};
const HARD = new Set([G.wood, G.plank, G.paving, G.field]);

function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// wood and stone from the older kits are painted as dark plate wherever nothing says otherwise
const OLD_KIT = /^(nat|west|forest|arena)\/(?!rock_|stone_|rocks)/;
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Baked light: every lamp, sign and window in the level tints the surfaces around it, once, when the
// level is built. Colour spills onto floors and walls without paying for real lights every frame.
const SPILL = { neon: 1.0, lantern: 0.5, window: 0.4, glow: 0.7, fire: 0.8, shaft: 1.0 };
function bakeLight(m, lights) {
  if (!lights.length || m.empty) return;
  const CELL = 8, grid = new Map();
  for (const l of lights) {
    const k = SPILL[l.kind] ?? 0.6;
    const R = Math.min(14, (l.r || 8) * 1.1);
    const e = { x: l.x, y: l.y ?? 2, z: l.z, R, c: l.c, k };
    const x0 = Math.floor((l.x - R) / CELL), x1 = Math.floor((l.x + R) / CELL), z0 = Math.floor((l.z - R) / CELL), z1 = Math.floor((l.z + R) / CELL);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const key = gx * 73856093 ^ gz * 19349663;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(e);
    }
  }
  const P = m.pos, N = m.nrm, C = m.col;
  for (let i = 0; i < m.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const list = grid.get(Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663);
    if (!list) continue;
    const nx = N[i * 3] / 127, ny = N[i * 3 + 1] / 127, nz = N[i * 3 + 2] / 127;
    let r = 0, g = 0, b = 0;
    for (const l of list) {
      const dx = l.x - x, dy = l.y - y, dz = l.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= l.R) continue;
      const f = (1 - d / l.R) ** 2 * l.k;
      const ndl = d > 0.01 ? Math.max(0.2, (dx * nx + dy * ny + dz * nz) / d) : 1;
      r += l.c[0] * f * ndl; g += l.c[1] * f * ndl; b += l.c[2] * f * ndl;
    }
    if (r + g + b < 0.003) continue;
    const o = i * 4;
    const k = Math.min(1, 0.9 / Math.max(0.9, r, g, b));   // never more than about doubling a surface
    C[o] = Math.min(255, C[o] * (1 + 0.9 * r * k) + 255 * 0.06 * r * k);
    C[o + 1] = Math.min(255, C[o + 1] * (1 + 0.9 * g * k) + 255 * 0.06 * g * k);
    C[o + 2] = Math.min(255, C[o + 2] * (1 + 0.9 * b * k) + 255 * 0.06 * b * k);
  }
}

export function buildWorld(assets, L, opts = {}) {
  const THREE = window.THREE;
  const theme = THEMES[L.theme] || THEMES.red;
  const seed = opts.seed || 1;
  const group = new THREE.Group();
  const mat = assets.worldMaterial();
  const { w, h, flags, ground, hgt } = L;
  const sw = Math.ceil(w / SECTOR), sh = Math.ceil(h / SECTOR);
  const sectors = Array.from({ length: sw * sh }, () => new Merger(assets));
  const sectorAt = (xm, zm) => {
    const sx = Math.min(sw - 1, Math.max(0, Math.floor(xm / TM / SECTOR))), sy = Math.min(sh - 1, Math.max(0, Math.floor(zm / TM / SECTOR)));
    return sectors[sy * sw + sx];
  };

  // ---- ground --------------------------------------------------------------
  // Per-vertex colour: soft ground types blend across tile corners, hard ones (planks, paving) keep crisp tiles.
  const vw = w + 1, vh = h + 1;
  const vcol = new Float32Array(vw * vh * 3);
  const vshade = new Float32Array(vw * vh);
  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : ty * w + tx);
  for (let vy = 0; vy < vh; vy++) for (let vx = 0; vx < vw; vx++) {
    let r = 0, g = 0, b = 0, n = 0, walls = 0;
    for (let k = 0; k < 4; k++) {
      const i = tileAt(vx - (k & 1), vy - (k >> 1));
      if (i < 0) { walls++; continue; }
      if (hgt[i] >= 20 && flags[i] & SOLID) walls++;
      if (flags[i] & ROCK) continue;
      const gt = ground[i];
      if (HARD.has(gt)) continue;
      const c = theme.ground[gt] || theme.ground[G.sand];
      r += c[0]; g += c[1]; b += c[2]; n++;
    }
    const o = (vy * vw + vx) * 3;
    if (n) { vcol[o] = r / n; vcol[o + 1] = g / n; vcol[o + 2] = b / n; }
    const big = valueNoise(vx / 14, vy / 14, seed), mid = valueNoise(vx / 4.5, vy / 4.5, seed + 7), fine = hash2(vx, vy, seed + 3);
    vshade[vy * vw + vx] = (0.9 + big * 0.14 + mid * 0.08 + fine * 0.035) * (1 - Math.min(3, walls) * 0.11);
  }
  const hardColor = (gt, tx, ty) => {
    const c = theme.ground[gt] || theme.ground[G.sand];
    let k = 1;
    if (gt === G.wood || gt === G.plank) k = 0.9 + 0.16 * hash2(ty, Math.floor((tx + (ty % 2) * 3) / 6), seed);
    else if (gt === G.paving) k = 0.92 + 0.12 * hash2(Math.floor(tx / 2), Math.floor(ty / 2), seed);
    else if (gt === G.field) k = ty % 2 ? 0.86 : 1.02;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  const UP = [0, 1, 0];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx;
    if (flags[i] & ROCK) continue;
    const m = sectors[Math.floor(ty / SECTOR) * sw + Math.floor(tx / SECTOR)];
    const gt = ground[i];
    const water = (flags[i] & WATER) !== 0;
    const y = water ? -0.55 : 0;
    const x0 = tx * TM, z0 = ty * TM, x1 = x0 + TM, z1 = z0 + TM;
    const cols = [];
    const hard = HARD.has(gt) ? hardColor(gt, tx, ty) : null;
    for (const [vx, vy] of [[tx, ty + 1], [tx + 1, ty + 1], [tx + 1, ty], [tx, ty]]) {
      const o = (vy * vw + vx) * 3, sh2 = vshade[vy * vw + vx];
      if (hard) cols.push(hard[0] * (0.75 + sh2 * 0.25), hard[1] * (0.75 + sh2 * 0.25), hard[2] * (0.75 + sh2 * 0.25));
      else if (water) cols.push(vcol[o] * 0.5 * sh2, vcol[o + 1] * 0.55 * sh2, vcol[o + 2] * 0.6 * sh2);
      else cols.push(Math.min(255, vcol[o] * sh2), Math.min(255, vcol[o + 1] * sh2), Math.min(255, vcol[o + 2] * sh2));
    }
    m.addQuad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], UP, cols);
    if (!water) {
      // banks down to neighbouring water
      const bank = [150, 112, 82, 150, 112, 82, 96, 74, 60, 96, 74, 60];
      const wat = (ax, ay) => { const j = tileAt(ax, ay); return j >= 0 && flags[j] & WATER; };
      if (wat(tx, ty + 1)) m.addQuad([x1, 0, z1, x0, 0, z1, x0, -0.55, z1, x1, -0.55, z1], [0, 0, 1], bank);
      if (wat(tx, ty - 1)) m.addQuad([x0, 0, z0, x1, 0, z0, x1, -0.55, z0, x0, -0.55, z0], [0, 0, -1], bank);
      if (wat(tx + 1, ty)) m.addQuad([x1, 0, z0, x1, 0, z1, x1, -0.55, z1, x1, -0.55, z0], [1, 0, 0], bank);
      if (wat(tx - 1, ty)) m.addQuad([x0, 0, z1, x0, 0, z0, x0, -0.55, z0, x0, -0.55, z1], [-1, 0, 0], bank);
    }
  }

  // ---- rock caps -----------------------------------------------------------
  const capShade = (mx, my) => 0.9 + 0.2 * valueNoise(mx / 2.3, my / 2.3, seed + 11);
  const capCol = (xm, zm, y) => {
    const k = capShade(xm / 4, zm / 4) * (y > 5 ? 1.06 : 1);
    return [Math.min(255, theme.cap[0] * k), Math.min(255, theme.cap[1] * k), Math.min(255, theme.cap[2] * k)];
  };
  const capQuad = (m, x0, z0, x1, z1, y) => {
    m.addQuad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], UP, [...capCol(x0, z1, y), ...capCol(x1, z1, y), ...capCol(x1, z0, y), ...capCol(x0, z0, y)]);
  };
  for (let my = 0; my < L.mh; my++) for (let mx = 0; mx < L.mw; mx++) {
    const tx0 = mx * MACRO, ty0 = my * MACRO;
    let all = true, first = -1;
    for (let ty = ty0; ty < ty0 + MACRO && all; ty++) for (let tx = tx0; tx < tx0 + MACRO; tx++) {
      const i = ty * w + tx;
      if (!(flags[i] & ROCK) || (first >= 0 && hgt[i] !== first)) { all = false; break; }
      first = hgt[i];
    }
    const m = sectors[Math.floor(ty0 / SECTOR) * sw + Math.floor(tx0 / SECTOR)];
    if (all) capQuad(m, tx0 * TM, ty0 * TM, (tx0 + MACRO) * TM, (ty0 + MACRO) * TM, first / 10 - 0.03);
    else {
      for (let ty = ty0; ty < ty0 + MACRO; ty++) for (let tx = tx0; tx < tx0 + MACRO; tx++) {
        const i = ty * w + tx;
        if (flags[i] & ROCK) capQuad(m, tx * TM, ty * TM, (tx + 1) * TM, (ty + 1) * TM, hgt[i] / 10 - 0.03);
      }
    }
  }
  // a skirt of rock beyond the map so the rim never shows a hard edge
  if (opts.skirt !== false) {
    const far = 60, W = w * TM, H = h * TM, y = 3.97;
    const sk = new Merger(assets);
    for (const [x0, z0, x1, z1] of [[-far, -far, W + far, 0], [-far, H, W + far, H + far], [-far, 0, 0, H], [W, 0, W + far, H]]) capQuad(sk, x0, z0, x1, z1, y);
    const mesh = new THREE.Mesh(sk.build(), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- props ---------------------------------------------------------------
  const rockTinted = (m) => theme.rockTint && (m.startsWith('cave/') || m.startsWith('nat/rock_') || m.startsWith('nat/stone_') || m.startsWith('forest/rocks'));
  const addPiece = (m, p) => {
    if (p.m === '@box') m.addBox(p.x, p.y, p.z, p.sx, p.sy, p.sz, p.r, hexRgb(p.c), p.c2 ? hexRgb(p.c2) : null);
    else if (p.m === '@cyl') m.addCyl(p.x, p.y, p.z, p.sx, p.sy, p.sz, hexRgb(p.c), p.c2 ? hexRgb(p.c2) : null, p.seg, p.axis || 'y', p.r || 0);
    else m.add(p.m, p.x, p.y, p.z, p.r, p.s, p.t || (rockTinted(p.m) ? theme.rockTint : OLD_KIT.test(p.m) ? 'timber' : null), p.shade || 1);
  };
  // lit things (neon, screens) are drawn unshaded, in a mesh of their own
  const glowM = new Merger(assets);
  for (const p of L.pieces) addPiece(p.glow ? glowM : sectorAt(p.x, p.z), p);
  if (!glowM.empty) {
    const mesh = new THREE.Mesh(glowM.build(), assets.glowMaterial());
    group.add(mesh);
  }

  const sectorMeshes = [];
  for (const m of sectors) {
    if (m.empty) continue;
    if (opts.bakeLight !== false) bakeLight(m, L.lights);
    const mesh = new THREE.Mesh(m.build(), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    sectorMeshes.push(mesh);
  }

  // ---- water ---------------------------------------------------------------
  let water = null;
  {
    const wm = new Merger(assets);
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      if (!(flags[ty * w + tx] & WATER)) continue;
      const c = theme.ground[G.water];
      const k = 0.9 + 0.2 * valueNoise(tx / 5, ty / 5, seed + 5);
      const col = [c[0] * k, c[1] * k, c[2] * k];
      wm.addQuad([tx * TM, -0.16, (ty + 1) * TM, (tx + 1) * TM, -0.16, (ty + 1) * TM, (tx + 1) * TM, -0.16, ty * TM, tx * TM, -0.16, ty * TM], UP, [...col, ...col, ...col, ...col]);
    }
    if (!wm.empty) {
      water = new THREE.Mesh(wm.build(), assets.makeMaterial({ transparent: true, opacity: 0.78 }));
      water.receiveShadow = true;
      group.add(water);
    }
  }

  // ---- glass ---------------------------------------------------------------
  const pivoted = (p) => {
    const pv = assets.raw(p.m).pivot || [0, 0, 0];
    const c = Math.cos(p.r), s = Math.sin(p.r);
    return [p.x + pv[0] * c + pv[2] * s, (p.y || 0) + pv[1], p.z - pv[0] * s + pv[2] * c];
  };
  if (L.glass.length) {
    const gm = new Merger(assets);
    for (const p of L.glass) { const [x, y, z] = pivoted(p); gm.add(p.m, x, y, z, p.r, 1); }
    const mesh = new THREE.Mesh(gm.build(), assets.glassMaterial());
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // ---- roofs ---------------------------------------------------------------
  const roofs = L.roofs.map((r) => {
    const rm = new Merger(assets);
    for (const p of r.pieces) addPiece(rm, p);
    for (const p of r.porch || []) addPiece(rm, p);
    const material = assets.makeMaterial({ transparent: false });
    const mesh = new THREE.Mesh(rm.build(), material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return { id: r.id, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, mesh, material, alpha: 1, signs: [] };
  });

  // ---- doors ---------------------------------------------------------------
  const doors = L.doors.map((d) => {
    const mesh = assets.mesh(d.m, d.t);
    mesh.position.set(d.x, 0, d.z);
    mesh.rotation.y = d.r;
    mesh.castShadow = true;
    group.add(mesh);
    return { ...d, mesh, open: 0 };
  });

  // ---- signs ---------------------------------------------------------------
  const signs = L.signs.map((s) => {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = Math.max(64, Math.round(512 * s.h / s.w));
    const c = cv.getContext('2d');
    c.fillStyle = s.bg || '#5e3f28'; c.fillRect(0, 0, cv.width, cv.height);
    if (!s.glow) {
      c.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = 0; y < cv.height; y += Math.round(cv.height / 4)) c.fillRect(0, y, cv.width, 2);
    } else { c.shadowColor = s.fg; c.shadowBlur = 18; }
    c.strokeStyle = s.fg || '#ecd9a8'; c.lineWidth = s.glow ? 5 : 8; c.strokeRect(10, 10, cv.width - 20, cv.height - 20);
    c.fillStyle = s.fg || '#ecd9a8';
    let size = cv.height * 0.56;
    c.font = `700 ${size}px "Jersey 15", "Arial Narrow", Impact, sans-serif`;
    const tw = c.measureText(s.text).width;
    if (tw > cv.width - 60) { size *= (cv.width - 60) / tw; c.font = `700 ${size}px "Jersey 15", "Arial Narrow", Impact, sans-serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(s.text, cv.width / 2, cv.height / 2 + size * 0.04);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new (s.glow ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)({ map: tex, transparent: false }));
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = Math.atan2(s.nx, s.nz);
    group.add(mesh);
    const roof = s.roof ? roofs.find((r) => r.id === s.roof) : null;
    if (roof) roof.signs.push(mesh);
    return mesh;
  });

  function dispose() {
    group.traverse((o) => {
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      if (o.material && o.material.map) o.material.map.dispose();
    });
    for (const r of roofs) r.material.dispose();
  }

  /** Hide the roof over the given position (metres); swing doors near any of `actors` ([{x, z}]). */
  function update(dt, px, pz, actors = []) {
    for (const r of roofs) {
      const inside = px > r.x0 - 0.2 && px < r.x1 + 0.2 && pz > r.z0 - 0.2 && pz < r.z1 + 0.2;
      const target = inside ? 0 : 1;
      if (r.alpha !== target) {
        r.alpha += Math.sign(target - r.alpha) * Math.min(Math.abs(target - r.alpha), dt * 5);
        r.material.transparent = r.alpha < 1;
        r.material.opacity = r.alpha;
        r.material.needsUpdate = true;
        r.mesh.visible = r.alpha > 0.02;
        r.mesh.castShadow = r.alpha > 0.5;
        for (const s of r.signs) s.visible = r.alpha > 0.5;
      }
    }
    for (const d of doors) {
      let near = false;
      for (const a of actors) { if ((a.x - d.cx) ** 2 + (a.z - d.cz) ** 2 < 5.3) { near = true; break; } }
      const target = near ? 1 : 0;
      if (d.open !== target) {
        d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 4);
        const e = d.open * d.open * (3 - 2 * d.open);
        d.mesh.rotation.y = d.r + d.swing * e * 1.75;
      }
    }
  }

  // ---- the city overhead (towers, bridges, cables, the upper city; the deck's ceiling): drawn, never solid
  if (opts.canopy !== false) {
    const canopy = buildCanopy(THREE, assets, L, seed);
    if (canopy) group.add(canopy);
  }

  // ---- light shafts: a faint cone of lit haze under each overhead lamp ---------------------------
  // One merged, additive, unlit mesh. Colour fades from the lamp to nothing at the floor, so the haze
  // reads as light in the air rather than a solid shape.
  {
    const shafts = L.lights.filter((l) => (l.kind === 'lantern' || l.kind === 'neon') && l.y >= 2.4).slice(0, 80);
    if (shafts.length && opts.shafts !== false) {
      const SEG = 14, pos = [], colr = [], idx = [];
      for (const l of shafts) {
        const top = l.y - 0.1, rTop = 0.12, rBot = Math.min(1.8, 0.4 + l.y * 0.3);
        const k = l.kind === 'lantern' ? 0.045 : 0.03;
        const base = pos.length / 3;
        for (let i = 0; i <= SEG; i++) {
          const a = (i / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          pos.push(l.x + ca * rTop, top, l.z + sa * rTop, l.x + ca * rBot, 0.02, l.z + sa * rBot);
          colr.push(l.c[0] * k, l.c[1] * k, l.c[2] * k, 0, 0, 0);
        }
        for (let i = 0; i < SEG; i++) { const v = base + i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: true }));   // front only: from inside a cone, nothing
      mesh.renderOrder = 2;
      mesh.userData.shafts = true;
      group.add(mesh);
    }
  }

  return { group, roofs, doors, signs, water, sectorMeshes, update, dispose, theme };
}
