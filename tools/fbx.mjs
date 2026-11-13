// Reads static meshes out of a binary FBX file (as exported by Blender): geometry,
// per-polygon flat material colours and the node transforms. No skinning, no textures.
// Needs the `fbx-parser` package (a dev dependency; `npm install`).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mul, IDENT, xformPoint, xformDir } from './glb.mjs';

const require = createRequire(import.meta.url);
let parseBinary = null;
function parser() {
  if (!parseBinary) {
    try { ({ parseBinary } = require('fbx-parser')); } catch { throw new Error('fbx-parser is not installed: run `npm install` in the project'); }
  }
  return parseBinary;
}

const D2R = Math.PI / 180;
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
const euler = (r) => mul(mul(rotZ(r[2] * D2R), rotY(r[1] * D2R)), rotX(r[0] * D2R)); // FBX default order XYZ: R = Rz * Ry * Rx
const translate = (t) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
const scaling = (s) => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1];

const child = (node, name) => node.nodes.find((n) => n.name === name);
function prop70(node, name, fallback) {
  const p = child(node, 'Properties70')?.nodes.find((q) => q.props[0] === name);
  return p ? p.props.slice(4).map(Number) : fallback;
}
function layer(geo, name) {
  const l = child(geo, name);
  if (!l) return null;
  const data = l.nodes.find((n) => ['Normals', 'Materials', 'Colors'].includes(n.name))?.props[0];
  const index = l.nodes.find((n) => /Index$/.test(n.name))?.props[0] || null;
  return { mapping: child(l, 'MappingInformationType')?.props[0], reference: child(l, 'ReferenceInformationType')?.props[0], data, index };
}

/**
 * Every mesh in the file as triangles in metres, Y up.
 * Returns [{ positions, normals, colors (linear 0..1 rgb per vertex), indices }], one per mesh, already in world space.
 */
export function readFbxMeshes(file) {
  const fbx = parser()(readFileSync(file));
  const top = (name) => fbx.find((n) => n.name === name);
  const unit = Number(prop70(top('GlobalSettings'), 'UnitScaleFactor', [1])[0]) || 1; // centimetres per unit
  const toMetres = unit / 100;
  const objects = top('Objects').nodes;
  const byId = new Map(objects.map((o) => [o.props[0], o]));
  const parentOf = new Map(), kids = new Map();
  for (const c of top('Connections').nodes) {
    if (c.props[0] !== 'OO') continue;
    parentOf.set(c.props[1], c.props[2]);
    if (!kids.has(c.props[2])) kids.set(c.props[2], []);
    kids.get(c.props[2]).push(c.props[1]);
  }
  const local = (m) => {
    const t = prop70(m, 'Lcl Translation', [0, 0, 0]), r = prop70(m, 'Lcl Rotation', [0, 0, 0]), s = prop70(m, 'Lcl Scaling', [1, 1, 1]);
    const pre = prop70(m, 'PreRotation', [0, 0, 0]);
    return mul(mul(mul(translate(t), euler(pre)), euler(r)), scaling(s));
  };
  const worldCache = new Map();
  const world = (id) => {
    if (worldCache.has(id)) return worldCache.get(id);
    const m = byId.get(id);
    let w = m && m.name === 'Model' ? local(m) : IDENT;
    const p = parentOf.get(id);
    if (p !== undefined && byId.get(p)?.name === 'Model') w = mul(world(p), w);
    worldCache.set(id, w);
    return w;
  };

  const out = [];
  for (const model of objects) {
    if (model.name !== 'Model') continue;
    const id = model.props[0];
    const mine = (kids.get(id) || []).map((k) => byId.get(k)).filter(Boolean);
    const geo = mine.find((o) => o.name === 'Geometry');
    if (!geo) continue;
    const mats = mine.filter((o) => o.name === 'Material').map((m) => prop70(m, 'DiffuseColor', [0.8, 0.8, 0.8]));
    const verts = child(geo, 'Vertices').props[0];
    const poly = child(geo, 'PolygonVertexIndex').props[0];
    const nrm = layer(geo, 'LayerElementNormal');
    const mat = layer(geo, 'LayerElementMaterial');
    const W = world(id);
    const positions = [], normals = [], colors = [], indices = [];
    let corner = [], polyIndex = 0, pv = 0;
    for (let i = 0; i < poly.length; i++) {
      let v = poly[i];
      const end = v < 0;
      if (end) v = ~v;
      // one output vertex per polygon corner, so faces stay flat-shaded and flat-coloured
      const p = xformPoint(W, verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
      let n = [0, 1, 0];
      if (nrm) {
        const k = nrm.mapping === 'ByPolygonVertex' ? pv : nrm.mapping === 'ByPolygon' ? polyIndex : v;
        const j = nrm.reference === 'IndexToDirect' && nrm.index ? nrm.index[k] : k;
        n = xformDir(W, nrm.data[j * 3], nrm.data[j * 3 + 1], nrm.data[j * 3 + 2]);
      }
      const mi = mat ? (mat.mapping === 'AllSame' ? mat.data[0] : mat.data[polyIndex]) : 0;
      const c = mats[mi] || mats[0] || [0.8, 0.8, 0.8];
      corner.push(positions.length / 3);
      positions.push(p[0] * toMetres, p[1] * toMetres, p[2] * toMetres);
      normals.push(n[0], n[1], n[2]);
      colors.push(c[0], c[1], c[2]);
      pv++;
      if (end) {
        for (let k = 1; k + 1 < corner.length; k++) indices.push(corner[0], corner[k], corner[k + 1]);
        corner = [];
        polyIndex++;
      }
    }
    // a mirrored transform flips the winding
    const det = W[0] * (W[5] * W[10] - W[6] * W[9]) - W[4] * (W[1] * W[10] - W[2] * W[9]) + W[8] * (W[1] * W[6] - W[2] * W[5]);
    if (det < 0) for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
    out.push({ name: String(model.props[1]).replace(/^Model::/, ''), positions, normals, colors, indices });
  }
  return out;
}
