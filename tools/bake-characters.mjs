// Bakes the Quaternius character packs (CC0, .gltf with embedded buffers) into
// assets/people.json: skinned meshes (two bone influences per vertex), one
// skeleton and one set of resampled animation clips per rig family.
//   node tools/bake-characters.mjs <dirMen> <dirWomen> <dirRobots> <dirCyber> [outDir]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessor, compose, mul, IDENT, xformPoint } from './glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [dMen, dWomen, dRobots, dPack] = process.argv.slice(2, 6).map((p) => resolve(p));
const outDir = resolve(process.argv[6] || join(here, '..'));
const FPS = 15;
const FINGER = /Index|Middle|Ring|Pinky|Thumb|Palm/;

const FAMILIES = [
  { id: 'man', dir: dMen, height: 1.8, files: ['Adventurer', 'Farmer', 'Swat', 'Spacesuit'] },
  { id: 'woman', dir: dWomen, height: 1.7, files: ['Adventurer', 'SciFi', 'Soldier'] },
  { id: 'robot', dir: dRobots, height: 1.95, files: ['Mike', 'George', 'Leela', 'Stan'] },
  // the cyberpunk kit: one human body and three machine chassis, each with its own skeleton and clips
  { id: 'cyber', dir: dPack, height: 1.8, heights: { Enemy_2Legs: 1.15, Enemy_2Legs_Gun: 1.6, Enemy_Flying: 1.0, Enemy_Flying_Gun: 1.25, Enemy_Large: 2.3, Enemy_Large_Gun: 3.1 },
    drop: /^Blade/, // the runner is modelled holding a sword; the game puts guns in that hand instead
    files: ['Character', 'Enemy_2Legs', 'Enemy_2Legs_Gun', 'Enemy_Flying', 'Enemy_Flying_Gun', 'Enemy_Large', 'Enemy_Large_Gun'] },
];

function readGltf(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  if (json.buffers.length !== 1) throw new Error('expected one buffer: ' + path);
  const uri = json.buffers[0].uri;
  const bin = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  return { json, bin };
}
const lin2srgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
const local = (n) => (n.matrix ? n.matrix.slice() : compose(n.translation, n.rotation, n.scale));

function bakeFamily(fam) {
  const out = { id: fam.id, models: {}, rig: null, clips: null };
  const pos = [], idx = [], nrm = [], col = [], skin = [];
  for (const file of fam.files) {
    const glb = readGltf(join(fam.dir, file + '.gltf'));
    const { json } = glb;
    const sk = json.skins[0];
    const parent = new Array(json.nodes.length).fill(-1);
    json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
    const jointIndex = new Map(sk.joints.map((n, i) => [n, i]));
    // world rest matrices
    const world = new Array(json.nodes.length);
    const W = (i) => world[i] || (world[i] = parent[i] >= 0 ? mul(W(parent[i]), local(json.nodes[i])) : local(json.nodes[i]));
    const ibm = accessor(glb, sk.inverseBindMatrices).data;
    let bonesHere, clipsHere;
    {
      const bones = sk.joints.map((n, i) => {
        const node = json.nodes[n];
        const p = jointIndex.has(parent[n]) ? jointIndex.get(parent[n]) : -1;
        // a joint whose parent is not a joint carries the armature's transform too
        let t = node.translation || [0, 0, 0], r = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1], pre = null;
        if (p < 0 && parent[n] >= 0) pre = W(parent[n]).map((v) => +v.toFixed(5));
        return { name: node.name, parent: p, t: t.map((v) => +v.toFixed(5)), r: r.map((v) => +v.toFixed(5)), s: s.map((v) => +v.toFixed(4)), pre, inv: Array.from(ibm.subarray(i * 16, i * 16 + 16), (v) => +v.toFixed(5)) };
      });
      bonesHere = bones;
      clipsHere = {};
      for (const a of json.animations || []) {
        let dur = 0;
        const tracks = new Map();
        for (const ch of a.channels) {
          const b = jointIndex.get(ch.target.node);
          if (b === undefined || ch.target.path === 'scale') continue;
          if (FINGER.test(bones[b].name) && fam.id !== 'robot') continue;
          const s = a.samplers[ch.sampler];
          const times = accessor(glb, s.input).data, vals = accessor(glb, s.output).data;
          dur = Math.max(dur, times[times.length - 1]);
          tracks.set(b + ch.target.path[0], { b, p: ch.target.path[0], times, vals });
        }
        const frames = Math.max(2, Math.round(dur * FPS) + 1);
        const clip = { dur: +dur.toFixed(4), frames, tracks: [] };
        for (const tr of tracks.values()) {
          const w = tr.p === 't' ? 3 : 4;
          const v = [];
          let k = 0, moving = false;
          for (let f = 0; f < frames; f++) {
            const t = (f / (frames - 1)) * dur;
            while (k < tr.times.length - 2 && tr.times[k + 1] <= t) k++;
            const t0 = tr.times[k], t1 = tr.times[Math.min(tr.times.length - 1, k + 1)];
            const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
            const a0 = k * w, a1 = Math.min(tr.times.length - 1, k + 1) * w;
            const q = [];
            for (let i = 0; i < w; i++) q.push(tr.vals[a0 + i] + (tr.vals[a1 + i] - tr.vals[a0 + i]) * u);
            if (w === 4) { const l = Math.hypot(...q) || 1; for (let i = 0; i < 4; i++) q[i] /= l; }
            for (let i = 0; i < w; i++) { v.push(+q[i].toFixed(w === 4 ? 4 : 4)); if (f > 0 && Math.abs(q[i] - v[i]) > 1e-3) moving = true; }
          }
          // translations only matter where they actually move (hips); rest pose covers the others
          if (tr.p === 't' && !moving) { const rest = bones[tr.b].t; if (Math.hypot(v[0] - rest[0], v[1] - rest[1], v[2] - rest[2]) < 1e-3) continue; }
          clip.tracks.push({ b: tr.b, p: tr.p, v: moving ? v : v.slice(0, w) });
        }
        clipsHere[a.name] = clip;
      }
    }
    // the first file defines the family's skeleton and clips; a file whose skeleton differs keeps its own
    if (!out.rig) { out.rig = bonesHere; out.clips = clipsHere; }
    else {
      const same = bonesHere.length === out.rig.length && bonesHere.every((b, i) => b.name === out.rig[i].name && b.parent === out.rig[i].parent
        && b.inv.every((v, k) => Math.abs(v - out.rig[i].inv[k]) < 2e-3) && b.t.every((v, k) => Math.abs(v - out.rig[i].t[k]) < 2e-3));
      if (!same) { (out.rigs ||= {})[file] = bonesHere; (out.clipsets ||= {})[file] = clipsHere; }
    }
    // geometry: every skinned primitive, colours from the flat materials
    const g = { pos: [], nrm: [], col: [], idx: [], sk: [] };
    json.nodes.forEach((node) => {
      if (node.mesh === undefined || node.skin === undefined) return;
      for (const prim of json.meshes[node.mesh].primitives) {
        const a = prim.attributes;
        const P = accessor(glb, a.POSITION).data, N = accessor(glb, a.NORMAL).data;
        const J = accessor(glb, a.JOINTS_0).data, Wt = accessor(glb, a.WEIGHTS_0).data;
        const I = accessor(glb, prim.indices).data;
        if (fam.drop && fam.drop.test(json.materials[prim.material]?.name || '')) continue;
        const f = json.materials[prim.material]?.pbrMetallicRoughness?.baseColorFactor || [0.8, 0.8, 0.8, 1];
        let c = [lin2srgb(f[0]), lin2srgb(f[1]), lin2srgb(f[2])];
        // this pack draws skin as a black silhouette; next to the other packs it needs a skin tone
        const mat = json.materials[prim.material]?.name;
        if (fam.id === 'toon' && mat === 'Skin' && !/Zombie/.test(file)) c = /Female/.test(file) ? [214, 160, 122] : [198, 142, 104];
        if (fam.id === 'toon' && mat === 'Face' && !/Zombie/.test(file)) c = [40, 30, 26];
        const base = g.pos.length / 3;
        for (let i = 0; i < P.length / 3; i++) {
          g.pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
          g.nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
          g.col.push(c[0], c[1], c[2], 255);
          // keep the two strongest bones
          const order = [0, 1, 2, 3].sort((x, y) => Wt[i * 4 + y] - Wt[i * 4 + x]);
          const w0 = Wt[i * 4 + order[0]], w1 = Wt[i * 4 + order[1]];
          g.sk.push(J[i * 4 + order[0]], w1 > 0.01 ? J[i * 4 + order[1]] : J[i * 4 + order[0]], Math.round((w0 / (w0 + w1)) * 255));
        }
        for (const v of I) g.idx.push(v + base);
      }
    });
    // height in the rest pose, to scale every figure to a believable size
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < g.pos.length / 3; i++) {
      const j = g.sk[i * 3];
      const m = mul(W(sk.joints[j]), Array.from(ibm.subarray(j * 16, j * 16 + 16)));
      const p = xformPoint(m, g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    let maxAbs = 0;
    for (const v of g.pos) maxAbs = Math.max(maxAbs, Math.abs(v));
    const q = Math.floor(32767 / maxAbs);
    const n = g.pos.length / 3;
    if (n > 65535) throw new Error('too many vertices ' + file);
    out.models[file] = { vo: pos.length / 3, vc: n, io: idx.length, ic: g.idx.length, q, scale: +((fam.heights?.[file] ?? fam.height) / (y1 - y0)).toFixed(4), base: +y0.toFixed(4) };
    for (const v of g.pos) pos.push(Math.round(v * q));
    for (const v of g.nrm) nrm.push(Math.round(v * 127));
    col.push(...g.col); skin.push(...g.sk); idx.push(...g.idx);
  }
  // int16 positions | uint16 indices | int8 normals | uint8 rgba | uint8 bone0, bone1, weight0
  const buf = Buffer.alloc(pos.length * 2 + idx.length * 2 + nrm.length + col.length + skin.length);
  let o = 0;
  for (const v of pos) { buf.writeInt16LE(v, o); o += 2; }
  for (const v of idx) { buf.writeUInt16LE(v, o); o += 2; }
  for (const v of nrm) { buf.writeInt8(Math.max(-127, Math.min(127, v)), o); o += 1; }
  for (const v of col) { buf.writeUInt8(v, o); o += 1; }
  for (const v of skin) { buf.writeUInt8(v, o); o += 1; }
  out.verts = pos.length / 3; out.indices = idx.length;
  out.bin = buf.toString('base64');
  return out;
}

let total = 0;
for (const fam of FAMILIES) {
  const data = bakeFamily(fam);
  const text = JSON.stringify(data);
  writeFileSync(join(outDir, 'assets', `people-${fam.id}.json`), text);
  total += text.length;
  console.log(fam.id.padEnd(6), Object.keys(data.models).length, 'models', data.verts, 'verts', data.rig.length, 'bones', Object.keys(data.clips).length, 'clips', 'own rigs:', Object.keys(data.rigs || {}).join(',') || '-', (text.length / 1024).toFixed(0), 'KB');
}
console.log('total', (total / 1048576).toFixed(2), 'MB');
