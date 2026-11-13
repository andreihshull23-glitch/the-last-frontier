// Minimal GLB reader for the asset bake. Reads geometry, skins and animations
// with node transforms resolved. No dependencies.
import { readFileSync } from 'node:fs';

const COMPONENT = {
  5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
  5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4],
};
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + path);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

export function accessor(glb, index) {
  const { json, bin } = glb;
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const [Ctor, bytes] = COMPONENT[acc.componentType];
  const size = TYPE_SIZE[acc.type];
  const stride = view.byteStride || bytes * size;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * size);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const read = {
    5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true),
    5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
  }[acc.componentType];
  const norm = acc.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[acc.componentType] : 0;
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < size; k++) {
      let v = read(base + i * stride + k * bytes);
      if (norm) v = Math.max(v / norm, -1);
      out[i * size + k] = v;
    }
  }
  return { data: out, size, count: acc.count, Ctor };
}

// ---- small matrix helpers (column-major 4x4) ----
export function compose(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
export function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
export function xformPoint(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
export function xformDir(m, x, y, z) {
  const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function nodeLocal(node) {
  if (node.matrix) return node.matrix.slice();
  return compose(node.translation, node.rotation, node.scale);
}

// World matrices for every node of the default scene.
export function worldMatrices(glb) {
  const { json } = glb;
  const world = new Array(json.nodes.length).fill(null);
  const parent = new Array(json.nodes.length).fill(-1);
  const visit = (i, pm) => {
    const m = mul(pm, nodeLocal(json.nodes[i]));
    world[i] = m;
    for (const c of json.nodes[i].children || []) { parent[c] = i; visit(c, m); }
  };
  const scene = json.scenes[json.scene || 0];
  for (const r of scene.nodes) visit(r, IDENT);
  return { world, parent };
}

// Flattened primitives: [{ node, name, material, positions, normals, uvs, indices, joints, weights, skin }]
export function primitives(glb) {
  const { json } = glb;
  const { world } = worldMatrices(glb);
  const out = [];
  json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined || !world[ni]) return;
    const mesh = json.meshes[node.mesh];
    for (const prim of mesh.primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const a = prim.attributes;
      const p = {
        node: ni, name: node.name || mesh.name || '', material: prim.material,
        matrix: world[ni], skin: node.skin,
        positions: accessor(glb, a.POSITION).data,
        normals: a.NORMAL !== undefined ? accessor(glb, a.NORMAL).data : null,
        uvs: a.TEXCOORD_0 !== undefined ? accessor(glb, a.TEXCOORD_0).data : null,
        colors: a.COLOR_0 !== undefined ? accessor(glb, a.COLOR_0) : null,
        joints: a.JOINTS_0 !== undefined ? accessor(glb, a.JOINTS_0).data : null,
        weights: a.WEIGHTS_0 !== undefined ? accessor(glb, a.WEIGHTS_0).data : null,
        indices: prim.indices !== undefined ? accessor(glb, prim.indices).data : null,
      };
      if (!p.indices) { p.indices = new Float64Array(p.positions.length / 3); for (let i = 0; i < p.indices.length; i++) p.indices[i] = i; }
      out.push(p);
    }
  });
  return out;
}
