// Bakes the Kenney model packs (CC0) into the compact packs the game loads.
//
//   node tools/bake-assets.mjs <packsDir> [outDir]
//
// <packsDir> holds the unzipped packs (kenney_mini-characters, ...).
// Output: assets/<pack>.json (index + base64 geometry) and js/data/models.js
// (bounding boxes for the level generators).
//
// Geometry is stored quantised: positions int16, normals int8, colours uint8.
// Texture atlases are baked into vertex colours, so the game needs no textures
// and can recolour anything per instance.
import { readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, primitives, worldMatrices, accessor, xformPoint, xformDir } from './glb.mjs';
import { readPng, sample } from './png.mjs';
import { readFbxMeshes } from './fbx.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = resolve(process.argv[2] || '');
const outDir = resolve(process.argv[3] || join(here, '..'));
if (!process.argv[2] || !existsSync(packsDir)) {
  console.error('usage: node tools/bake-assets.mjs <packsDir> [outDir]');
  process.exit(1);
}

const BONES = ['root', 'leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'];
const CLIPS = [
  'idle', 'walk', 'sprint', 'jump', 'fall', 'crouch', 'sit', 'die', 'pick-up', 'emote-yes', 'emote-no',
  'holding-right', 'holding-both', 'holding-right-shoot', 'holding-both-shoot',
  'attack-melee-right', 'attack-kick-right', 'interact-right',
];

const NATURE = [
  /^cactus_/, /^campfire_/, /^fence_(simple|planks|gate|corner|simpleHigh|simpleLow|planksDouble)$/, /^flower_(purple|red|yellow)A$/,
  /^grass/, /^log/, /^pot_/, /^rock_/, /^stone_(large[A-F]|tall[A-J]|small[A-I]|smallFlat[A-C]|smallTop[AB])$/, 'sign', /^statue_/, /^stump_/, /^tent_/,
  /^tree_(default|oak|thin|simple|small|tall|fat|detailed|plateau)_fall$/, /^tree_palm/, /^tree_pine(TallA|TallB|TallC|TallD|RoundA|RoundC|SmallA|SmallB)$/,
  /^tree_(default|oak|thin|simple)_dark$/, /^tree_(default|oak|thin)$/,
  /^crops_(corn|wheat|dirt)/, /^crop_/, /^bridge_wood/, /^bridge_(center|side)_wood$/, /^path_wood/, /^path_stone/, 'canoe', 'canoe_paddle', 'bed', 'bed_floor',
  /^mushroom_/, /^platform_/, /^plant_/, /^lily_/, 'hanging_moss',
];

const PACKS = [
  { id: 'chr', dir: 'kenney_mini-characters', scale: 2.4, characters: true, pick: [/^character-/], rename: (n) => n.replace('character-', ''),
    extra: [['kenney_mini-shop_2.1', 'character-employee', 'employee'], ['kenney_mini-arena', 'character-soldier', 'gladiator'], ['kenney_mini-forest_1.0', 'character-archer', 'archer']] },
  { id: 'cave', dir: 'kenney_modular-cave-kit_1.0', scale: 1, pick: [/^template-/, /^gate/, 'ladder'], parts: { 'gate-metal-bars': ['gate'] } },
  { id: 'bk', dir: 'kenney_building-kit', scale: 1.5, pick: [/./], parts: { '*': ['door', '(%ignore)'] } },
  { id: 'nat', dir: 'kenney_nature-kit', sub: 'GLTF format', scale: 3, pick: NATURE },
  { id: 'arena', dir: 'kenney_mini-arena', scale: 2.4, pick: [/^(?!character-)/], parts: { 'wall-gate': ['gate'] } },
  { id: 'forest', dir: 'kenney_mini-forest_1.0', scale: 2.4, pick: [/^(?!character-)/] },
  { id: 'shop', dir: 'kenney_mini-shop_2.1', scale: 2.4, pick: [/^(?!character-)/], parts: { 'wall-door-rotate': ['door-left', 'door-right'], 'fence-door-rotate': ['door-left', 'door-right'], 'wall-window': ['(%ignore)'] } },
  // sci-fi and industrial interiors for the lower floors of the Descent
  { id: 'station', dir: 'kenney_space-station-kit', scale: 3, pick: [/./] },
  { id: 'factory', dir: 'kenney_factory-kit', scale: 2.4, pick: [/^(?!arrow|indicator|button)/] },
  { id: 'spacemod', dir: 'kenney_modular-space-kit', scale: 1, pick: [/^(gate|cables|template-(wall|floor|corner|detail))/] },
  // the frontier itself: a flat-coloured western kit (FBX). Building pieces are stretched upward so a 1.8 m person fits a doorway.
  { id: 'west', fbx: 'wild-west', scale: 1, tall: { match: /^(Modular)\//, y: 1.3 } },
  { id: 'gun', dir: 'kenney_blaster-kit_2.1', scale: 1, pick: [/^blaster-[a-r]$/, /^crate-/, /^grenade-/, /^clip-/, /^bullet-foam$/, /^target-(large|small)$/], parts: { 'crate-*': ['lid'] } },
];

// The nature kit has flat material colours and no texture. Give it a dry,
// high-desert palette and a soft top-to-bottom gradient like the other kits.
const NAT_COLORS = {
  leafsGreen: '#7ea35c', leafsDark: '#5b7f4b', leafsFall: '#cf9440', grass: '#a9a35c',
  wood: '#9c6b43', woodDark: '#6e4a30', woodBark: '#7d5539', woodBarkDark: '#5c3e2a', woodBirch: '#cdbfa3', woodInner: '#dcbc8e',
  stone: '#a09a92', stoneDark: '#7b756f', dirt: '#b9755a', dirtDark: '#96583f', water: '#4fa3b8',
  colorRed: '#b5483a', colorRedDark: '#8e3428', colorTan: '#d8c39a', colorWhite: '#ece6d8', colorYellow: '#d9a83a', colorPurple: '#8b6fb5',
  corn: '#d9b443', _defaultMat: '#bdb6aa',
};
// sunlit sandstone instead of grass on top of rocks
const NAT_OVERRIDES = [[/^(rock_|cliff_)/, { grass: '#d9a27e' }], [/^stone_/, { grass: '#b8b2a8' }], [/^statue_/, { grass: '#b8b2a8' }]];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const texCache = new Map();
function texture(path) {
  if (!texCache.has(path)) texCache.set(path, existsSync(path) ? readPng(path) : null);
  return texCache.get(path);
}
const lin2srgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));

function matches(name, rules) {
  return rules.some((r) => (typeof r === 'string' ? r === name : r.test(name)));
}
function partNames(pack, name) {
  const out = [];
  for (const [pat, names] of Object.entries(pack.parts || {})) {
    const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(name)) out.push(...names);
  }
  return out;
}

// Geometry of one GLB as flat arrays, split into the body and named parts.
function extract(file, pack, name) {
  const glb = readGlb(file);
  const { json } = glb;
  const { world, parent } = worldMatrices(glb);
  const wanted = partNames(pack, name);
  // node -> owning part (nearest ancestor whose name is a requested part)
  const owner = json.nodes.map((_, i) => {
    for (let n = i; n >= 0; n = parent[n]) if (wanted.includes(json.nodes[n].name)) return n;
    return -1;
  });
  const groups = new Map(); // partNode (-1 body) -> {pos, nrm, col, idx}
  const group = (k) => {
    if (!groups.has(k)) groups.set(k, { pos: [], nrm: [], col: [], idx: [], bone: [], flat: [] });
    return groups.get(k);
  };
  const dir = dirname(file);
  for (const p of primitives(glb)) {
    const g = group(owner[p.node]);
    const mat = json.materials?.[p.material] || {};
    const pbr = mat.pbrMetallicRoughness || {};
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
    let img = null;
    if (pbr.baseColorTexture) {
      const tex = json.textures[pbr.baseColorTexture.index];
      const uri = json.images[tex.source].uri;
      img = texture(join(dir, decodeURIComponent(uri)));
      if (!img) throw new Error('missing texture ' + uri + ' for ' + file);
    }
    // parts are stored relative to their pivot (the part node's rest position)
    const pivot = owner[p.node] >= 0 ? [world[owner[p.node]][12], world[owner[p.node]][13], world[owner[p.node]][14]] : [0, 0, 0];
    const m = p.matrix;
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    const base = g.pos.length / 3;
    const n = p.positions.length / 3;
    const skin = p.skin !== undefined ? json.skins[p.skin] : null;
    const jointBone = skin ? skin.joints.map((j) => BONES.indexOf(json.nodes[j].name)) : null;
    for (let i = 0; i < n; i++) {
      const w = xformPoint(m, p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]);
      g.pos.push((w[0] - pivot[0]) * pack.scale, (w[1] - pivot[1]) * pack.scale, (w[2] - pivot[2]) * pack.scale);
      const nn = p.normals ? xformDir(m, p.normals[i * 3], p.normals[i * 3 + 1], p.normals[i * 3 + 2]) : [0, 1, 0];
      g.nrm.push(nn[0], nn[1], nn[2]);
      let c;
      if (img && p.uvs) {
        const s = sample(img, p.uvs[i * 2], p.uvs[i * 2 + 1]);
        c = [s[0] * factor[0], s[1] * factor[1], s[2] * factor[2]];
      } else if (pack.id === 'nat') {
        let h = NAT_COLORS[mat.name] || NAT_COLORS._defaultMat;
        for (const [re, map] of NAT_OVERRIDES) if (re.test(name) && map[mat.name]) h = map[mat.name];
        c = hex(h);
        c.flat = true;
      } else {
        c = [lin2srgb(factor[0]), lin2srgb(factor[1]), lin2srgb(factor[2])];
      }
      g.col.push(Math.round(c[0]), Math.round(c[1]), Math.round(c[2]));
      g.flat.push(c.flat ? 1 : 0);
      if (jointBone) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (p.weights[i * 4 + k] > p.weights[i * 4 + best]) best = k;
        const b = jointBone[p.joints[i * 4 + best]];
        if (b < 0) throw new Error('unknown bone in ' + file);
        g.bone.push(b);
      } else g.bone.push(0);
    }
    for (let i = 0; i < p.indices.length; i += 3) {
      const a = p.indices[i] + base, b = p.indices[i + 1] + base, c = p.indices[i + 2] + base;
      if (det < 0) g.idx.push(a, c, b); else g.idx.push(a, b, c);
    }
  }
  const out = [];
  for (const [k, g] of groups) {
    if (!g.idx.length) continue;
    // gradient for flat-coloured models: darker toward the base, lighter on up-facing faces
    if (g.flat.some((f) => f)) {
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 1; i < g.pos.length; i += 3) { y0 = Math.min(y0, g.pos[i]); y1 = Math.max(y1, g.pos[i]); }
      const span = Math.max(0.4, y1 - y0);
      for (let i = 0; i < g.flat.length; i++) {
        if (!g.flat[i]) continue;
        const t = (g.pos[i * 3 + 1] - y0) / span;
        const f = 0.8 + 0.2 * Math.min(1, t * 1.4) + 0.05 * g.nrm[i * 3 + 1];
        for (let k2 = 0; k2 < 3; k2++) g.col[i * 3 + k2] = Math.max(0, Math.min(255, Math.round(g.col[i * 3 + k2] * f)));
      }
    }
    const entry = { name: k < 0 ? name : name + '#' + json.nodes[k].name.replace('(%ignore)', 'glass'), ...g };
    if (k >= 0) entry.pivot = [world[k][12] * pack.scale, world[k][13] * pack.scale, world[k][14] * pack.scale];
    out.push(entry);
  }
  return { models: out, glb };
}

// Top-down occupancy at 0.25 m: bit 1 = blocks a body (geometry between 0.3 and 1.3 m),
// bit 2 = blocks shots and sight (geometry between 1.0 and 1.7 m).
const FOOT = 0.25;
function footprint(m) {
  const n = m.pos.length / 3;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, m.pos[i * 3]); x1 = Math.max(x1, m.pos[i * 3]); z0 = Math.min(z0, m.pos[i * 3 + 2]); z1 = Math.max(z1, m.pos[i * 3 + 2]); }
  const gx0 = Math.floor(x0 / FOOT + 1e-6), gz0 = Math.floor(z0 / FOOT + 1e-6);
  const w = Math.max(1, Math.ceil(x1 / FOOT - 1e-6) - gx0), h = Math.max(1, Math.ceil(z1 / FOOT - 1e-6) - gz0);
  const cells = new Uint8Array(w * h);
  const mark = (x, y, z) => {
    const cx = Math.min(w - 1, Math.max(0, Math.floor(x / FOOT) - gx0)), cz = Math.min(h - 1, Math.max(0, Math.floor(z / FOOT) - gz0));
    if (y >= 0.3 && y <= 1.3) cells[cz * w + cx] |= 1;
    if (y >= 1.0 && y <= 1.7) cells[cz * w + cx] |= 2;
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t] * 3, b = m.idx[t + 1] * 3, c = m.idx[t + 2] * 3;
    const P = m.pos;
    const e1 = Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]), e2 = Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]);
    const steps = Math.max(1, Math.ceil(Math.max(e1, e2) / (FOOT * 0.4)));
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
      const u = i / steps, v = j / steps, wv = 1 - u - v;
      mark(P[a] * wv + P[b] * u + P[c] * v, P[a + 1] * wv + P[b + 1] * u + P[c + 1] * v, P[a + 2] * wv + P[b + 2] * u + P[c + 2] * v);
    }
  }
  // fill enclosed interiors row by row (models are shells): between the first and last marked cell
  // of a row only when the column is also bracketed, so concave outlines stay open.
  const filled = cells.slice();
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (cells[z * w + x]) continue;
    let l = 0, r = 0, u = 0, d = 0;
    for (let i = 0; i < x; i++) l |= cells[z * w + i];
    for (let i = x + 1; i < w; i++) r |= cells[z * w + i];
    for (let i = 0; i < z; i++) u |= cells[i * w + x];
    for (let i = z + 1; i < h; i++) d |= cells[i * w + x];
    filled[z * w + x] = l & r & u & d;
  }
  if (!filled.some((v) => v)) return null;
  return [gx0 * FOOT, gz0 * FOOT, w, h, Array.from(filled).join('')];
}

// The western kit's sixteen flat colours, warmed and weathered a little (linear rgb in, sRGB bytes out).
const WEST_COLORS = [
  [[0.50, 0.30, 0.16], '#a8763f'], [[0.09, 0.03, 0.02], '#5a3a26'], [[0.30, 0.18, 0.11], '#7d5534'], [[0.09, 0.09, 0.09], '#4a463f'],
  [[0.40, 0.80, 0.02], '#7f9c4b'], [[0.10, 0.01, 0.01], '#6e2c22'], [[0.01, 0.01, 0.01], '#1f1c1a'], [[0.55, 0.54, 0.54], '#bcb6aa'],
  [[0.06, 0.00, 0.00], '#4a1c16'], [[0.28, 0.34, 0.44], '#8fa1b5'], [[0.35, 0.05, 0.08], '#a8473c'], [[0.80, 0.80, 0.80], '#e6dfcf'],
  [[0.03, 0.06, 0.00], '#3f4f2c'], [[0.35, 0.34, 0.34], '#8f8a80'], [[0.80, 0.38, 0.03], '#d99a3a'], [[0.02, 0.07, 0.11], '#33485c'],
];
function westColor(r, g, b) {
  let best = null, bd = 1e9;
  for (const [c, h] of WEST_COLORS) { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = h; } }
  return bd < 0.01 ? hex(best) : [lin2srgb(r), lin2srgb(g), lin2srgb(b)];
}
const slug = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function fbxSources(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const f of readdirSync(d).sort()) {
      const full = join(d, f);
      if (statSync(full).isDirectory()) walk(full, rel ? rel + '/' + f : f);
      else if (f.toLowerCase().endsWith('.fbx')) out.push([full, slug(f.slice(0, -4)), rel]);
    }
  };
  walk(dir, '');
  return out;
}
function extractFbx(file, pack, name, rel) {
  const g = { pos: [], nrm: [], col: [], idx: [], bone: [], flat: [] };
  const modular = Boolean(pack.tall && pack.tall.match.test(rel + '/'));
  const sy = modular ? pack.tall.y : 1;
  const seen = new Map(); // identical corners are stored once
  for (const m of readFbxMeshes(file)) {
    const n = m.positions.length / 3;
    const remap = new Array(n);
    for (let i = 0; i < n; i++) {
      // the kit lies along z with its face to +x; the game's kits face +z, so turn it a quarter
      const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
      const P = [z * pack.scale, y * pack.scale * sy, -x * pack.scale];
      const Nn = [m.normals[i * 3 + 2], m.normals[i * 3 + 1], -m.normals[i * 3]];
      const c = westColor(m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]);
      const key = P.map((v) => Math.round(v * 2000)).join(',') + '|' + Nn.map((v) => Math.round(v * 20)).join(',') + '|' + c.join(',');
      let at = seen.get(key);
      if (at === undefined) {
        at = g.pos.length / 3;
        seen.set(key, at);
        g.pos.push(P[0], P[1], P[2]);
        g.nrm.push(Nn[0], Nn[1], Nn[2]);
        g.col.push(c[0], c[1], c[2]);
        g.flat.push(1);
        g.bone.push(0);
      }
      remap[i] = at;
    }
    for (const i of m.indices) g.idx.push(remap[i]);
  }
  // loose props stand on the ground; building pieces keep their own origin so they stack
  if (!modular && g.pos.length) {
    let lo = Infinity;
    for (let i = 1; i < g.pos.length; i += 3) lo = Math.min(lo, g.pos[i]);
    if (lo < -0.02 && !/sign/.test(name)) for (let i = 1; i < g.pos.length; i += 3) g.pos[i] -= lo;
  }
  // the same soft gradient the other flat-coloured kits get
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < g.pos.length; i += 3) { y0 = Math.min(y0, g.pos[i]); y1 = Math.max(y1, g.pos[i]); }
  const span = Math.max(0.4, y1 - y0);
  for (let i = 0; i < g.flat.length; i++) {
    const t = (g.pos[i * 3 + 1] - y0) / span;
    const f = 0.84 + 0.16 * Math.min(1, t * 1.4) + 0.06 * g.nrm[i * 3 + 1];
    for (let k = 0; k < 3; k++) g.col[i * 3 + k] = Math.max(0, Math.min(255, Math.round(g.col[i * 3 + k] * f)));
  }
  return { models: g.idx.length ? [{ name, ...g }] : [], glb: null };
}

function rigAndClips(glb, scale) {
  const { json } = glb;
  const nodeBone = json.nodes.map((n) => BONES.indexOf(n.name));
  const parentOf = new Array(json.nodes.length).fill(-1);
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parentOf[c] = i; }));
  const rig = BONES.map((name) => {
    const ni = json.nodes.findIndex((n) => n.name === name);
    const n = json.nodes[ni];
    const p = parentOf[ni] >= 0 ? nodeBone[parentOf[ni]] : -1;
    return { name, parent: p, t: (n.translation || [0, 0, 0]).map((v) => +(v * scale).toFixed(4)) };
  });
  const clips = {};
  for (const a of json.animations || []) {
    if (!CLIPS.includes(a.name)) continue;
    let dur = 0;
    const tracks = [];
    for (const ch of a.channels) {
      const bone = nodeBone[ch.target.node];
      if (bone < 0 || ch.target.path === 'scale') continue;
      const s = a.samplers[ch.sampler];
      const times = Array.from(accessor(glb, s.input).data, (v) => +v.toFixed(4));
      const vals = accessor(glb, s.output).data;
      const isT = ch.target.path === 'translation';
      const values = Array.from(vals, (v) => +(isT ? v * scale : v).toFixed(4));
      dur = Math.max(dur, times[times.length - 1]);
      tracks.push({ b: bone, p: isT ? 't' : 'r', t: times, v: values });
    }
    clips[a.name] = { dur: +dur.toFixed(4), tracks };
  }
  return { rig, clips };
}

function pack(packDef) {
  let sources;
  if (packDef.fbx) sources = fbxSources(join(packsDir, packDef.fbx));
  else {
    const sub = packDef.sub || 'GLB format';
    const dir = join(packsDir, packDef.dir, 'Models', sub);
    const files = readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).filter((n) => matches(n, packDef.pick)).sort();
    sources = files.map((n) => [join(dir, n + '.glb'), packDef.rename ? packDef.rename(n) : n]);
    for (const [d, n, as] of packDef.extra || []) sources.push([join(packsDir, d, 'Models', 'GLB format', n + '.glb'), as]);
  }

  const index = {};
  const pos = [], idx = [], nrm = [], col = [];
  let rig = null;
  for (const [file, name, rel] of sources) {
    const { models, glb } = packDef.fbx ? extractFbx(file, packDef, name, rel) : extract(file, packDef, name);
    if (packDef.characters && !rig && name === 'male-a') rig = rigAndClips(glb, packDef.scale);
    for (const m of models) {
      const n = m.pos.length / 3;
      if (n > 65535) throw new Error('too many vertices: ' + m.name);
      let maxAbs = 0;
      const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        const v = m.pos[i * 3 + k];
        maxAbs = Math.max(maxAbs, Math.abs(v));
        bb[k] = Math.min(bb[k], v); bb[k + 3] = Math.max(bb[k + 3], v);
      }
      const q = Math.min(8192, Math.floor(32767 / Math.max(maxAbs, 1e-6)));
      const entry = { vo: pos.length / 3, vc: n, io: idx.length, ic: m.idx.length, q, bb: bb.map((v) => +v.toFixed(3)) };
      if (m.pivot) entry.pivot = m.pivot.map((v) => +v.toFixed(4));
      for (let i = 0; i < n * 3; i++) pos.push(Math.round(m.pos[i] * q));
      for (let i = 0; i < n * 3; i++) nrm.push(Math.round(m.nrm[i] * 127));
      for (let i = 0; i < n; i++) col.push(m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2], m.bone[i]);
      for (const i of m.idx) idx.push(i);
      index[m.name] = entry;
      if (!packDef.characters && !m.name.includes('#glass')) { const f = footprint(m); if (f) feet[packDef.id + '/' + m.name] = f; }
    }
  }
  // layout: int16 positions | uint16 indices | int8 normals | uint8 colour+bone
  const bytes = pos.length * 2 + idx.length * 2 + nrm.length + col.length;
  const buf = Buffer.alloc(bytes);
  let o = 0;
  for (const v of pos) { buf.writeInt16LE(v, o); o += 2; }
  for (const v of idx) { buf.writeUInt16LE(v, o); o += 2; }
  for (const v of nrm) { buf.writeInt8(Math.max(-127, Math.min(127, v)), o); o += 1; }
  for (const v of col) { buf.writeUInt8(Math.max(0, Math.min(255, v)), o); o += 1; }
  const json = { v: 1, id: packDef.id, verts: pos.length / 3, indices: idx.length, models: index, bin: buf.toString('base64') };
  if (rig) { json.rig = rig.rig; json.clips = rig.clips; }
  return json;
}

mkdirSync(join(outDir, 'assets'), { recursive: true });
mkdirSync(join(outDir, 'js', 'data'), { recursive: true });
const boxes = {};
const feet = {};
let total = 0;
for (const def of PACKS) {
  const json = pack(def);
  const text = JSON.stringify(json);
  writeFileSync(join(outDir, 'assets', def.id + '.json'), text);
  total += text.length;
  for (const [name, m] of Object.entries(json.models)) boxes[def.id + '/' + name] = m.pivot ? [...m.bb, ...m.pivot] : m.bb;
  console.log(def.id.padEnd(7), String(Object.keys(json.models).length).padStart(4), 'models', String(json.verts).padStart(7), 'verts', (text.length / 1024).toFixed(0).padStart(6), 'KB');
}
const lines = Object.entries(boxes).map(([k, v]) => `  '${k}': [${v.join(', ')}],`);
writeFileSync(join(outDir, 'js', 'data', 'models.js'),
  `// Generated by tools/bake-assets.mjs. Bounding boxes in metres: [minX, minY, minZ, maxX, maxY, maxZ, (pivot x, y, z)].\nexport const MODEL_BOX = {\n${lines.join('\n')}\n};\nexport const ASSET_PACKS = ${JSON.stringify(PACKS.map((p) => p.id))};\n`
  + `// Collision footprints at ${FOOT} m: [x0, z0, width, depth, cells]. Cell digit: 1 blocks bodies, 2 blocks shots/sight, 3 both.\nexport const FOOT_RES = ${FOOT};\nexport const MODEL_FOOT = {\n${Object.entries(feet).map(([k, v]) => `  '${k}': [${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, '${v[4]}'],`).join('\n')}\n};\n`);
console.log('total', (total / 1024 / 1024).toFixed(2), 'MB');
