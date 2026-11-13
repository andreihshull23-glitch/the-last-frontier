// Loads the baked model packs (see tools/bake-assets.mjs) and hands out
// geometry. Everything is vertex-coloured; there are no textures.
import { ASSET_PACKS } from '../data/models.js';

const T = () => window.THREE;

// Colours are stored rgb + one spare byte; expose them as a 3-component
// attribute (a 4-component one would switch three.js to vertex alpha).
export function colorAttribute(bytes) {
  const THREE = T();
  return new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(bytes, 4), 3, 0, true);
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- recolouring -----------------------------------------------------------
// A tint is a function (r, g, b) -> [r, g, b] on sRGB bytes, applied per vertex.
function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}
function rgb(h, s, l) {
  const f = (p, q, t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
export const color = { hsl, rgb };

// Replace a hue band with another colour family, keeping the light/dark ramp.
// from: [hueMin, hueMax] (0..1, may wrap), to: {h, s, l} multipliers/targets.
export function remap(rules) {
  return (r, g, b) => {
    const [h, s, l] = hsl(r, g, b);
    for (const rule of rules) {
      const inHue = rule.hue ? (rule.hue[0] <= rule.hue[1] ? h >= rule.hue[0] && h <= rule.hue[1] : h >= rule.hue[0] || h <= rule.hue[1]) : true;
      const inSat = rule.sat ? s >= rule.sat[0] && s <= rule.sat[1] : true;
      const inLit = rule.lit ? l >= rule.lit[0] && l <= rule.lit[1] : true;
      if (inHue && inSat && inLit) {
        const nh = rule.h !== undefined ? rule.h : h;
        const ns = rule.s !== undefined ? rule.s : Math.min(1, s * (rule.sMul ?? 1));
        const nl = Math.min(1, Math.max(0, (rule.l !== undefined ? rule.l : l) * (rule.lMul ?? 1) + (rule.lAdd ?? 0)));
        return rgb(nh, ns, nl);
      }
    }
    return [r, g, b];
  };
}
export function multiply(mr, mg, mb) {
  return (r, g, b) => [Math.min(255, r * mr), Math.min(255, g * mg), Math.min(255, b * mb)];
}
export function chain(...fns) {
  return (r, g, b) => { let c = [r, g, b]; for (const f of fns) if (f) c = f(c[0], c[1], c[2]); return c; };
}

export function createAssets() {
  const packs = new Map();
  const people = new Map();
  const rawCache = new Map();
  const geoCache = new Map();
  const tints = new Map();
  let material = null, skinned = null, glass = null;

  async function load(base = 'assets/', onProgress = () => {}) {
    let done = 0;
    const families = ['man', 'woman', 'robot'];
    // Packs that are baked but that no level uses yet are not downloaded.
    const NOT_YET = ['chr', 'station', 'factory', 'spacemod', 'scifi'];
    const packIds = [...ASSET_PACKS.filter((p) => !NOT_YET.includes(p)), 'qg']; // the old mini figures are no longer drawn
    const totalFiles = packIds.length + families.length;
    await Promise.all(families.map(async (id) => {
      const res = await fetch(base + 'people-' + id + '.json');
      if (!res.ok) throw new Error('Could not load people-' + id + ' (' + res.status + ')');
      const json = await res.json();
      const bytes = decodeBase64(json.bin);
      json.bin = null;
      const pb = json.verts * 6, ib = json.indices * 2;
      people.set(id, {
        json,
        pos: new Int16Array(bytes.buffer, 0, json.verts * 3),
        idx: new Uint16Array(bytes.buffer, pb, json.indices),
        nrm: new Int8Array(bytes.buffer, pb + ib, json.verts * 3),
        col: new Uint8Array(bytes.buffer, pb + ib + json.verts * 3, json.verts * 4),
        skin: new Uint8Array(bytes.buffer, pb + ib + json.verts * 7, json.verts * 3),
      });
      done++;
      onProgress(done / totalFiles);
    }));
    await Promise.all(packIds.map(async (id) => {
      const res = await fetch(base + id + '.json');
      if (!res.ok) throw new Error('Could not load ' + id + ' (' + res.status + ')');
      const json = await res.json();
      const bytes = decodeBase64(json.bin);
      json.bin = null;
      const posBytes = json.verts * 6, idxBytes = json.indices * 2;
      packs.set(id, {
        json,
        pos: new Int16Array(bytes.buffer, 0, json.verts * 3),
        idx: new Uint16Array(bytes.buffer, posBytes, json.indices),
        nrm: new Int8Array(bytes.buffer, posBytes + idxBytes, json.verts * 3),
        col: new Uint8Array(bytes.buffer, posBytes + idxBytes + json.verts * 3, json.verts * 4),
      });
      done++;
      onProgress(done / totalFiles);
    }));
  }

  function has(name) {
    const [id, key] = split(name);
    return packs.has(id) && !!packs.get(id).json.models[key];
  }
  function split(name) {
    const i = name.indexOf('/');
    return [name.slice(0, i), name.slice(i + 1)];
  }

  // Plain arrays for one model, positions in metres.
  function raw(name) {
    let r = rawCache.get(name);
    if (r) return r;
    const [id, key] = split(name);
    const pack = packs.get(id);
    const m = pack && pack.json.models[key];
    if (!m) throw new Error('Unknown model ' + name);
    const pos = new Float32Array(m.vc * 3);
    const src = pack.pos, inv = 1 / m.q;
    for (let i = 0; i < m.vc * 3; i++) pos[i] = src[m.vo * 3 + i] * inv;
    r = {
      name, vc: m.vc, ic: m.ic, pos,
      nrm: pack.nrm.subarray(m.vo * 3, m.vo * 3 + m.vc * 3),
      col: pack.col.subarray(m.vo * 4, m.vo * 4 + m.vc * 4),
      idx: pack.idx.subarray(m.io, m.io + m.ic),
      bb: m.bb, pivot: m.pivot || null,
    };
    rawCache.set(name, r);
    return r;
  }

  function registerTint(name, fn) { tints.set(name, fn); }
  // Vertex colours of a model after a named tint (cached).
  function colors(name, tint) {
    const r = raw(name);
    if (!tint) return r.col;
    const key = name + '|' + tint;
    let c = rawCache.get(key);
    if (c) return c;
    const fn = typeof tint === 'function' ? tint : tints.get(tint);
    if (!fn) throw new Error('Unknown tint ' + tint);
    c = new Uint8Array(r.col.length);
    const memo = new Map();
    for (let i = 0; i < r.vc; i++) {
      const k = (r.col[i * 4] << 16) | (r.col[i * 4 + 1] << 8) | r.col[i * 4 + 2];
      let v = memo.get(k);
      if (!v) { v = fn(r.col[i * 4], r.col[i * 4 + 1], r.col[i * 4 + 2]); memo.set(k, v); }
      c[i * 4] = v[0]; c[i * 4 + 1] = v[1]; c[i * 4 + 2] = v[2]; c[i * 4 + 3] = r.col[i * 4 + 3];
    }
    if (typeof tint !== 'function') rawCache.set(key, c);
    return c;
  }

  function geometry(name, tint) {
    const key = name + '|' + (typeof tint === 'string' ? tint : '');
    if (typeof tint !== 'function' && geoCache.has(key)) return geoCache.get(key);
    const THREE = T();
    const r = raw(name);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nrm, 3, true));
    g.setAttribute('color', colorAttribute(colors(name, tint)));
    g.setIndex(new THREE.BufferAttribute(r.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    if (typeof tint !== 'function') geoCache.set(key, g);
    return g;
  }

  // sRGB vertex colours -> linear, in the shader.
  function patch(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', [
        '#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )',
        '  vColor = vec3( 1.0 );',
        '#endif',
        '#ifdef USE_COLOR',
        '  vColor.xyz *= pow( color.xyz, vec3( 2.2 ) );',
        '#endif',
        '#ifdef USE_INSTANCING_COLOR',
        '  vColor.xyz *= instanceColor.xyz;',
        '#endif',
      ].join('\n'));
    };
    return mat;
  }
  function worldMaterial() {
    if (!material) material = patch(new (T().MeshLambertMaterial)({ vertexColors: true }));
    return material;
  }
  function skinnedMaterial() {
    if (!skinned) skinned = patch(new (T().MeshLambertMaterial)({ vertexColors: true, skinning: true }));
    return skinned;
  }
  function glassMaterial() {
    if (!glass) glass = patch(new (T().MeshLambertMaterial)({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false }));
    return glass;
  }
  function makeMaterial(opts) { return patch(new (T().MeshLambertMaterial)({ vertexColors: true, ...opts })); }

  function mesh(name, tint) {
    const m = new (T().Mesh)(geometry(name, tint), name.endsWith('#glass') ? glassMaterial() : worldMaterial());
    return m;
  }

  function rig() { return packs.get('chr').json.rig; }
  function clips() { return packs.get('chr').json.clips; }
  function names(id) { return Object.keys(packs.get(id).json.models).map((k) => id + '/' + k); }

  return { load, has, raw, people, tint: (name) => tints.get(name), colors, geometry, mesh, registerTint, worldMaterial, skinnedMaterial, glassMaterial, makeMaterial, rig, clips, names, packs };
}

// ---- merging ---------------------------------------------------------------
// Collects many placed models into one geometry (one draw call).
export class Merger {
  constructor(assets) {
    this.assets = assets;
    this.cap = 4096; this.icap = 8192;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Int8Array(this.cap * 3);
    this.col = new Uint8Array(this.cap * 4);
    this.idx = new Uint32Array(this.icap);
    this.n = 0; this.ni = 0;
  }
  _grow(v, i) {
    if (this.n + v > this.cap) {
      while (this.n + v > this.cap) this.cap *= 2;
      const p = new Float32Array(this.cap * 3); p.set(this.pos.subarray(0, this.n * 3)); this.pos = p;
      const nn = new Int8Array(this.cap * 3); nn.set(this.nrm.subarray(0, this.n * 3)); this.nrm = nn;
      const c = new Uint8Array(this.cap * 4); c.set(this.col.subarray(0, this.n * 4)); this.col = c;
    }
    if (this.ni + i > this.icap) {
      while (this.ni + i > this.icap) this.icap *= 2;
      const x = new Uint32Array(this.icap); x.set(this.idx.subarray(0, this.ni)); this.idx = x;
    }
  }
  // Place a model: position (x, y, z), rotation about Y (radians), scale (number or [sx, sy, sz]).
  add(name, x, y, z, ry = 0, scale = 1, tint = null, shade = 1) {
    const r = this.assets.raw(name);
    const col = this.assets.colors(name, tint);
    this._grow(r.vc, r.ic);
    const c = Math.cos(ry), s = Math.sin(ry);
    const sx = typeof scale === 'number' ? scale : scale[0], sy = typeof scale === 'number' ? scale : scale[1], sz = typeof scale === 'number' ? scale : scale[2];
    const base = this.n;
    const P = this.pos, N = this.nrm, C = this.col;
    for (let i = 0; i < r.vc; i++) {
      const px = r.pos[i * 3] * sx, py = r.pos[i * 3 + 1] * sy, pz = r.pos[i * 3 + 2] * sz;
      const o = (base + i) * 3;
      P[o] = x + px * c + pz * s; P[o + 1] = y + py; P[o + 2] = z - px * s + pz * c;
      const nx = r.nrm[i * 3], nz = r.nrm[i * 3 + 2];
      N[o] = nx * c + nz * s; N[o + 1] = r.nrm[i * 3 + 1]; N[o + 2] = -nx * s + nz * c;
      const k = (base + i) * 4;
      if (shade === 1) { C[k] = col[i * 4]; C[k + 1] = col[i * 4 + 1]; C[k + 2] = col[i * 4 + 2]; }
      else { C[k] = Math.min(255, col[i * 4] * shade); C[k + 1] = Math.min(255, col[i * 4 + 1] * shade); C[k + 2] = Math.min(255, col[i * 4 + 2] * shade); }
      C[k + 3] = 255;
    }
    const flip = (sx * sy * sz) < 0;
    for (let i = 0; i < r.ic; i += 3) {
      this.idx[this.ni + i] = r.idx[i] + base;
      this.idx[this.ni + i + 1] = r.idx[i + (flip ? 2 : 1)] + base;
      this.idx[this.ni + i + 2] = r.idx[i + (flip ? 1 : 2)] + base;
    }
    this.n += r.vc; this.ni += r.ic;
  }
  // Raw triangles: positions [x,y,z...], one normal and colour per vertex.
  addQuad(p, normal, colors) {
    this._grow(4, 6);
    const base = this.n;
    for (let i = 0; i < 4; i++) {
      const o = (base + i) * 3, k = (base + i) * 4;
      this.pos[o] = p[i * 3]; this.pos[o + 1] = p[i * 3 + 1]; this.pos[o + 2] = p[i * 3 + 2];
      this.nrm[o] = normal[0] * 127; this.nrm[o + 1] = normal[1] * 127; this.nrm[o + 2] = normal[2] * 127;
      this.col[k] = colors[i * 3]; this.col[k + 1] = colors[i * 3 + 1]; this.col[k + 2] = colors[i * 3 + 2]; this.col[k + 3] = 255;
    }
    this.idx.set([base, base + 1, base + 2, base, base + 2, base + 3], this.ni);
    this.n += 4; this.ni += 6;
  }
  // A box centred on x/z, sitting on y. Colours are [r,g,b] bytes: top and (optional) bottom.
  addBox(x, y, z, sx, sy, sz, ry, cTop, cBot = null) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const hx = sx / 2, hz = sz / 2;
    const bot = cBot || [cTop[0] * 0.8, cTop[1] * 0.8, cTop[2] * 0.8];
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const N = (nx, ny, nz) => [nx * c + nz * s, ny, -nx * s + nz * c];
    const face = (a, b, d, e, n, top) => {
      const col = top === 2 ? [...cTop, ...cTop, ...cTop, ...cTop] : top === 0 ? [...bot, ...bot, ...bot, ...bot] : [...bot, ...bot, ...cTop, ...cTop];
      this.addQuad([...a, ...b, ...d, ...e], n, col);
    };
    const p000 = P(-hx, 0, -hz), p100 = P(hx, 0, -hz), p101 = P(hx, 0, hz), p001 = P(-hx, 0, hz);
    const p010 = P(-hx, sy, -hz), p110 = P(hx, sy, -hz), p111 = P(hx, sy, hz), p011 = P(-hx, sy, hz);
    face(p011, p111, p110, p010, N(0, 1, 0), 2);
    face(p000, p100, p101, p001, N(0, -1, 0), 0);
    face(p001, p101, p111, p011, N(0, 0, 1), 1);
    face(p100, p000, p010, p110, N(0, 0, -1), 1);
    face(p101, p100, p110, p111, N(1, 0, 0), 1);
    face(p000, p001, p011, p010, N(-1, 0, 0), 1);
  }
  // A tapered cylinder (radius r0 at the base, r1 at the top), flat shaded. With axis 'x' it lies on
  // its side, centred on (x, y, z), turned by ry: a wheel. Then cTop colours the faces, cBot the rim.
  addCyl(x, y, z, r0, h, r1, cTop, cBot = null, seg = 10, axis = 'y', ry = 0) {
    const bot = cBot || [cTop[0] * 0.8, cTop[1] * 0.8, cTop[2] * 0.8];
    if (axis === 'x') {
      const c = Math.cos(ry), s = Math.sin(ry);
      const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
      const N = (nx, ny, nz) => [nx * c + nz * s, ny, -nx * s + nz * c];
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
        const y0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0, y1 = Math.cos(a1) * r0, z1 = Math.sin(a1) * r0;
        this.addQuad([...P(-h / 2, y0, z0), ...P(-h / 2, y1, z1), ...P(h / 2, y1, z1), ...P(h / 2, y0, z0)], N(0, Math.cos(am), Math.sin(am)), [...bot, ...bot, ...bot, ...bot]);
        this.addQuad([...P(h / 2, 0, 0), ...P(h / 2, y0, z0), ...P(h / 2, y1, z1), ...P(h / 2, 0, 0)], N(1, 0, 0), [...cTop, ...cTop, ...cTop, ...cTop]);
        this.addQuad([...P(-h / 2, 0, 0), ...P(-h / 2, y1, z1), ...P(-h / 2, y0, z0), ...P(-h / 2, 0, 0)], N(-1, 0, 0), [...cTop, ...cTop, ...cTop, ...cTop]);
      }
      return;
    }
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.addQuad([x + c1 * r0, y, z + s1 * r0, x + c0 * r0, y, z + s0 * r0, x + c0 * r1, y + h, z + s0 * r1, x + c1 * r1, y + h, z + s1 * r1],
        [Math.cos(am), 0, Math.sin(am)], [...bot, ...bot, ...cTop, ...cTop]);
      if (r1 > 0.001) this.addQuad([x, y + h, z, x + c1 * r1, y + h, z + s1 * r1, x + c0 * r1, y + h, z + s0 * r1, x, y + h, z], [0, 1, 0], [...cTop, ...cTop, ...cTop, ...cTop]);
    }
  }
  get empty() { return this.ni === 0; }
  build() {
    const THREE = T();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, this.n * 3), 3, true));
    g.setAttribute('color', colorAttribute(this.col.slice(0, this.n * 4)));
    g.setIndex(new THREE.BufferAttribute(this.n > 65535 ? this.idx.slice(0, this.ni) : new Uint16Array(this.idx.subarray(0, this.ni)), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
