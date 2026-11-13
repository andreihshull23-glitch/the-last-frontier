// Bakes the Quaternius gun pack (CC0, OBJ + MTL) into assets/qg.json, in the
// same format as the other model packs. Each gun is scaled to a real length,
// with its muzzle along +Z and its grip at the origin.
//   node tools/bake-guns.mjs <objDir> [outDir]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2]);
const outDir = resolve(process.argv[3] || join(here, '..'));
const GUNS = { Revolver_1: 0.36, Revolver_3: 0.36, Revolver_5: 0.4, Pistol_1: 0.3, Pistol_4: 0.3, Shotgun_1: 1.0, Shotgun_SawedOff: 0.62, Shotgun_4: 0.95, SniperRifle_2: 1.25, SniperRifle_5: 1.2, AssaultRifle_1: 0.92, AssaultRifle2_2: 0.9, SubmachineGun_1: 0.6, SubmachineGun_4: 0.58, Bullpup_2: 0.78 };
const lin2srgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
const index = {}, pos = [], idx = [], nrm = [], col = [];
for (const [name, length] of Object.entries(GUNS)) {
  const mtl = {};
  let cur = null;
  for (const line of readFileSync(join(dir, name + '.mtl'), 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'newmtl') cur = p[1];
    else if (p[0] === 'Kd' && cur) mtl[cur] = [lin2srgb(+p[1]) , lin2srgb(+p[2]), lin2srgb(+p[3])].map((v) => Math.min(255, Math.round(v * 1.6 + 14)));
  }
  const V = [], N = [], out = { pos: [], nrm: [], col: [], idx: [] };
  let color = [128, 128, 128];
  for (const line of readFileSync(join(dir, name + '.obj'), 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') V.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'vn') N.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'usemtl') color = mtl[p[1]] || color;
    else if (p[0] === 'f') {
      const vs = p.slice(1).map((s) => s.split('/').map((x) => parseInt(x, 10)));
      for (let k = 1; k < vs.length - 1; k++) for (const v of [vs[0], vs[k], vs[k + 1]]) {
        out.idx.push(out.pos.length / 3);
        out.pos.push(...V[v[0] - 1]); out.nrm.push(...(N[(v[2] || 1) - 1] || [0, 1, 0])); out.col.push(...color, 0);
      }
    }
  }
  // long axis is X in the pack: turn it to +Z, scale to length
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < out.pos.length; i += 3) { x0 = Math.min(x0, out.pos[i]); x1 = Math.max(x1, out.pos[i]); }
  const s = length / (x1 - x0);
  const n = out.pos.length / 3;
  const P = [], NN = [];
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) {
    const p = [-out.pos[i * 3 + 2] * s, out.pos[i * 3 + 1] * s, out.pos[i * 3] * s];
    P.push(...p); NN.push(-out.nrm[i * 3 + 2], out.nrm[i * 3 + 1], out.nrm[i * 3]);
    for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[k]); bb[k + 3] = Math.max(bb[k + 3], p[k]); }
  }
  const q = 8192;
  index[name] = { vo: pos.length / 3, vc: n, io: idx.length, ic: out.idx.length, q, bb: bb.map((v) => +v.toFixed(3)) };
  for (const v of P) pos.push(Math.round(v * q));
  for (const v of NN) nrm.push(Math.round(v * 127));
  col.push(...out.col); idx.push(...out.idx);
}
const buf = Buffer.alloc(pos.length * 2 + idx.length * 2 + nrm.length + col.length);
let o = 0;
for (const v of pos) { buf.writeInt16LE(v, o); o += 2; }
for (const v of idx) { buf.writeUInt16LE(v, o); o += 2; }
for (const v of nrm) { buf.writeInt8(Math.max(-127, Math.min(127, v)), o); o += 1; }
for (const v of col) { buf.writeUInt8(v, o); o += 1; }
const text = JSON.stringify({ v: 1, id: 'qg', verts: pos.length / 3, indices: idx.length, models: index, bin: buf.toString('base64') });
writeFileSync(join(outDir, 'assets', 'qg.json'), text);
console.log('qg', Object.keys(index).length, 'guns', (text.length / 1024).toFixed(0), 'KB');
for (const [k, m] of Object.entries(index)) console.log(' ', k, m.bb.join(' '));
