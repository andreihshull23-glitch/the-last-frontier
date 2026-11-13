// The third-person view: an over-the-shoulder camera on the 2D sim. The sim's
// plane is the ground (sim x -> world x, sim y -> world z, 32 units = 1 m).
// This module reads the sim and never writes it.
import { TILE as TS, PX, ENEMIES, WEAPONS, SOLID, OPAQUE, BLOCKS_SHOT, ITEMS } from '../content.js';
import { castRay, isVisible, visionRadius, nightFactor, darkness, clockTime, CLOCK, PLAYER, haunted, focusPrompt } from '../sim.js';
import { buildWorld } from './world.js';
import { createActors, LOOKS, drifterLook, GUN_FOR } from './actors.js';
import { Merger } from './assets.js';
import { registerTints } from './tints.js';
import { drawHUD, toast } from '../hud.js';

const U = 1 / PX;            // sim units -> metres
const TM = TS / PX;          // metres per tile
const TAU = Math.PI * 2;
const EYE = 1.5;
const GUN_Y = 1.08;
const PITCH_MIN = -0.34;
const PITCH_MAX = 0.6;
const QUALITY = [
  { dpr: 2, shadows: 2048, fx: 1 },
  { dpr: 1.5, shadows: 1024, fx: 0.7 },
  { dpr: 1, shadows: 0, fx: 0.4 },
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

export function createRenderer(glCanvas, hudCanvas, assets) {
  const THREE = window.THREE;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !coarse, powerPreference: 'high-performance' });
  gl.outputEncoding = THREE.sRGBEncoding;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 0.98;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  registerTints(assets);
  const actors = createActors(assets);

  const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  const hud = hudCanvas.getContext('2d');
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(), pos = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const r = {
    kind: '3d', view: { w: 1, h: 1, dpr: 1 }, insets: { top: 0, right: 0, bottom: 0, left: 0 },
    toasts: [], floaters: [], banner: null, touch: false, keyHints: true, kick: 0, hitMarker: 0, time: 0,
    yaw: 0, pitch: 0.14, camScale: 1, camReady: false, pivot: new THREE.Vector3(), shake: 0, hitDirs: [], marks: new Map(),
    deathFade: 0, quality: coarse ? 1 : 0, frameAvg: 1 / 60, slowT: 0, warmup: 0, world: null, envT: 0, vignette: null,
    sens: 1, shakeOn: true, mapOpen: false, sim: null,
  };

  // ---------------------------------------------------------------- lights and sky
  scene.fog = new THREE.Fog(0xe6d0b2, 45, 150);
  const hemi = new THREE.HemisphereLight(0xbcd4f2, 0x8a6a48, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e2, 1.2);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const lantern = new THREE.PointLight(0xffc98a, 0, 16, 1.4);
  scene.add(lantern);
  const worldLights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xff9a4a, 0, 12, 1.6); scene.add(l); return l; });
  const flashes = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffd9a0, 0, 9, 1.5); scene.add(l); return { light: l, t: 0 }; });

  const skyGeo = new THREE.SphereGeometry(600, 24, 14);
  const skyColors = new Float32Array(skyGeo.attributes.position.count * 3);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 20), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false, depthWrite: false, toneMapped: false }));
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 20), new THREE.MeshBasicMaterial({ color: 0xcfd6ee, fog: false, depthWrite: false, toneMapped: false }));
  sunDisc.renderOrder = moonDisc.renderOrder = -9;
  scene.add(sunDisc, moonDisc);
  const stars = (() => {
    const n = 500, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, e = Math.acos(Math.random() * 0.95);
      p[i * 3] = Math.cos(a) * Math.sin(e) * 560; p[i * 3 + 1] = Math.cos(e) * 560; p[i * 3 + 2] = Math.sin(a) * Math.sin(e) * 560;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    pts.renderOrder = -8;
    scene.add(pts);
    return pts;
  })();
  // far mesas: a ring of flat-topped blocks on the horizon
  const mesaMat = new THREE.MeshLambertMaterial({ color: 0x8a5a44 });
  const mesas = (() => {
    const g = new THREE.Group();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + rnd() * 0.2, d = 250 + rnd() * 120;
      const w = 40 + rnd() * 90, h = 16 + rnd() * 34, dp = 30 + rnd() * 50;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mesaMat);
      m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
      m.rotation.y = -a + Math.PI / 2 + (rnd() - 0.5) * 0.5;
      g.add(m);
      if (rnd() < 0.5) { const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.4, dp * 0.6), mesaMat); t.position.set(m.position.x, h + h * 0.2 - 2, m.position.z); t.rotation.y = m.rotation.y; g.add(t); }
    }
    scene.add(g);
    return g;
  })();
  const outerGround = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: col('#c99a6a') }));
  outerGround.position.y = -0.6;
  scene.add(outerGround);

  // ---------------------------------------------------------------- particles
  const VERT = `
    attribute vec3 pcolor; attribute float psize; attribute float palpha;
    uniform float uScale; varying vec3 vColor; varying float vAlpha;
    void main() {
      vColor = pcolor; vAlpha = palpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = psize * uScale / max(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
    void main() {
      float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor, a);
    }`;
  function makeSystem(capacity, additive) {
    const geo = new THREE.BufferGeometry();
    const P = new Float32Array(capacity * 3), C = new Float32Array(capacity * 3), S = new Float32Array(capacity), A = new Float32Array(capacity);
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(P, 3)); geo.setAttribute('pcolor', attr(C, 3)); geo.setAttribute('psize', attr(S, 1)); geo.setAttribute('palpha', attr(A, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uMap: { value: dotTex } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
    return { pts, geo, P, C, S, A, list: [], capacity };
  }
  const sparks = makeSystem(900, true);
  const dust = makeSystem(600, false);
  const glows = makeSystem(160, true);     // lamp and fire halos, rebuilt per level
  const cTmp = new THREE.Color();
  function emit(sys, p) {
    if (sys.list.length >= sys.capacity * QUALITY[r.quality].fx) sys.list.shift();
    cTmp.set(p.color ?? '#ffffff');
    sys.list.push({ vx: 0, vy: 0, vz: 0, drag: 2, grav: 0, a: 1, size: 0.1, ...p, r: cTmp.r, g: cTmp.g, b: cTmp.b, max: p.life });
  }
  function stepSystem(sys, dt) {
    let n = 0;
    const keep = [];
    for (const q of sys.list) {
      q.life -= dt;
      if (q.life <= 0) continue;
      const k = Math.max(0, 1 - q.drag * dt);
      q.vx *= k; q.vz *= k;
      q.vy = q.vy * k - q.grav * dt;
      q.x += q.vx * dt; q.y = Math.max(0.02, q.y + q.vy * dt); q.z += q.vz * dt;
      const fade = clamp(q.life / q.max, 0, 1);
      sys.P[n * 3] = q.x; sys.P[n * 3 + 1] = q.y; sys.P[n * 3 + 2] = q.z;
      sys.C[n * 3] = q.r; sys.C[n * 3 + 1] = q.g; sys.C[n * 3 + 2] = q.b;
      sys.S[n] = q.size * (q.grow ? 1 + (1 - fade) * q.grow : 1);
      sys.A[n] = q.a * fade;
      n += 1;
      keep.push(q);
    }
    sys.list = keep;
    sys.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize', 'palpha']) sys.geo.attributes[k].needsUpdate = true;
  }

  // shared bits
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    boxX: new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0),
    sphere: new THREE.SphereGeometry(1, 10, 8),
    ring: new THREE.RingGeometry(0.94, 1, 40).rotateX(-Math.PI / 2),
    disc: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
    stick: new THREE.CylinderGeometry(0.045, 0.045, 0.34, 6),
    coin: new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10),
    crystal: new THREE.OctahedronGeometry(0.3, 0),
  };
  const basic = (hex, opts = {}) => new THREE.MeshBasicMaterial({ color: col(hex), transparent: true, depthWrite: false, toneMapped: false, ...opts });
  const tracerMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const tracers = new THREE.InstancedMesh(G.box, tracerMat, 96);
  tracers.frustumCulled = false;
  tracers.count = 0;
  tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);
  scene.add(tracers);
  const decalMat = new THREE.MeshBasicMaterial({ color: col('#3a120d'), transparent: true, opacity: 0.55, depthWrite: false });

  // ---------------------------------------------------------------- world
  function disposeWorld() {
    const W = r.world;
    if (!W) return;
    scene.remove(W.group);
    W.built.dispose();
    for (const a of W.actors.values()) actors.dispose(a);
    for (const a of W.npcs.values()) actors.dispose(a);
    for (const c of W.corpses) actors.dispose(c.a);
    if (W.player) actors.dispose(W.player);
    if (W.echo) actors.dispose(W.echo);
    if (W.buddy) actors.dispose(W.buddy);
    W.group.traverse((o) => { if (o.userData.own) { o.geometry?.dispose?.(); } });
    r.world = null;
  }

  function procMesh(build, opts = {}) {
    const m = new Merger(assets);
    build(m);
    const mesh = new THREE.Mesh(m.build(), opts.material || assets.worldMaterial());
    mesh.userData.own = true;
    mesh.castShadow = opts.shadow !== false;
    return mesh;
  }
  const C = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  function makeProp(it) {
    const g = new THREE.Group();
    g.position.set(it.x * U, 0, it.y * U);
    const o = { group: g, it, lid: null, spin: null, open: 0 };
    if (it.kind === 'cache') {
      const tint = it.tier === 2 ? 'crate_meridian' : it.tier === 1 ? 'crate_gold' : 'crate';
      const body = assets.mesh('gun/crate-small', tint);
      const lid = assets.mesh('gun/crate-small#lid', tint);
      const pv = assets.raw('gun/crate-small#lid').pivot;
      lid.position.set(pv[0], pv[1], pv[2]);
      body.castShadow = lid.castShadow = true;
      const inner = new THREE.Group();
      inner.add(body, lid);
      inner.scale.setScalar(1.15);
      inner.rotation.y = it.a || 0;
      g.add(inner);
      o.lid = lid;
    } else if (it.kind === 'objective') {
      const k = it.item;
      if (k === 'strongbox' || k === 'payroll') {
        const tint = k === 'strongbox' ? 'crate_meridian' : 'crate_gold';
        const body = assets.mesh('gun/crate-wide', tint), lid = assets.mesh('gun/crate-wide#lid', tint);
        const pv = assets.raw('gun/crate-wide#lid').pivot; lid.position.set(pv[0], pv[1], pv[2]);
        body.castShadow = true;
        const inner = new THREE.Group(); inner.add(body, lid); inner.scale.setScalar(1.25); inner.rotation.y = 0.5; g.add(inner);
      } else if (k === 'satchel') {
        g.add(procMesh((m) => { m.addBox(0, 0, 0, 0.5, 0.34, 0.24, 0.3, C('#8a5a36'), C('#5c3e2a')); m.addBox(0, 0.3, 0.02, 0.52, 0.1, 0.27, 0.3, C('#6e4a30')); m.addBox(0.02, 0.14, 0.13, 0.1, 0.1, 0.03, 0.3, C('#d9a83a')); }));
      } else if (k === 'ledger') {
        g.add(procMesh((m) => { m.addBox(0, 0, 0, 0.8, 0.85, 0.6, 0, C('#6e4a30'), C('#4a3220')); m.addBox(0, 0.85, 0, 0.42, 0.08, 0.3, 0.3, C('#8e3428'), C('#6a2219')); m.addBox(0, 0.93, 0, 0.36, 0.01, 0.26, 0.3, C('#ece2c8')); }));
      } else if (k === 'medicine') {
        g.add(procMesh((m) => { m.addBox(0, 0, 0, 0.6, 0.42, 0.44, 0.2, C('#ece6d8'), C('#c4bcaa')); m.addBox(0, 0.43, 0, 0.36, 0.01, 0.1, 0.2, C('#b5483a')); m.addBox(0, 0.43, 0, 0.1, 0.012, 0.36, 0.2, C('#b5483a')); }));
      } else if (k === 'stake') {
        g.add(procMesh((m) => { m.addBox(0, 0, 0, 0.1, 1.5, 0.1, 0, C('#a9794b'), C('#5c3e2a')); m.addBox(0.2, 1.1, 0, 0.36, 0.26, 0.03, 0, C('#b5483a'), C('#8e3428')); }));
      } else if (k === 'borekey') {
        const mesh = procMesh((m) => { m.addBox(0, 0, 0, 0.12, 0.5, 0.12, 0, C('#2e2e36')); m.addBox(0, 0.5, 0, 0.34, 0.12, 0.12, 0, C('#3a3a46')); for (const dx of [-0.11, 0, 0.11]) m.addBox(dx, 0.62, 0, 0.07, 0.2, 0.08, 0, C('#2e2e36')); }, { shadow: false });
        mesh.position.y = 0.95;
        g.add(mesh);
        o.spin = mesh;
      } else if (k === 'shard') {
        const mesh = new THREE.Mesh(G.crystal, new THREE.MeshBasicMaterial({ color: col('#b9a8ff'), toneMapped: false }));
        mesh.scale.set(1, 1.9, 1);
        mesh.position.y = 1.55;
        g.add(mesh);
        o.spin = mesh;
      }
    } else if (it.kind === 'exit') {
      const ring = new THREE.Mesh(G.ring, basic('#a9c98f', { opacity: 0.5, side: THREE.DoubleSide }));
      ring.scale.setScalar(PLAYER.extractRadius * U);
      ring.position.y = 0.05;
      g.add(ring);
      const fill = new THREE.Mesh(G.disc, basic('#a9c98f', { opacity: 0.0, side: THREE.DoubleSide }));
      fill.position.y = 0.04;
      g.add(fill);
      o.ring = ring; o.fill = fill;
    } else return null;
    return o;
  }

  function buildLevel(sim) {
    disposeWorld();
    const L = sim.level;
    const built = buildWorld(assets, L, { seed: (L.seed || 1) & 0xffff });
    const group = new THREE.Group();
    group.add(built.group);
    scene.add(group);
    const W = {
      built, group, level: L, actors: new Map(), npcs: new Map(), corpses: [], props: new Map(), pickups: new Map(), bombs: new Map(),
      telegraphs: new Map(), targets: new Map(), player: null, echo: null, decals: [], decalNext: 0, fires: [],
    };
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(G.disc, decalMat);
      d.visible = false;
      group.add(d);
      W.decals.push(d);
    }
    for (const it of sim.state.interactables) {
      const pr = makeProp(it);
      if (pr) { group.add(pr.group); W.props.set(it.id, pr); }
    }
    // halos for every lamp, fire and window
    glows.list = [];
    W.glowSrc = L.lights.map((l) => ({ x: l.x, y: l.y, z: l.z, c: l.c, r: l.r, kind: l.kind }));
    W.fires = L.lights.filter((l) => l.kind === 'fire');
    r.world = W;
  }

  function ensurePlayer(sim) {
    const W = r.world, s = sim.state;
    const ch = s.config.character;
    const key = `${ch.look}|${ch.gear.join(',')}`;
    if (!W.player || W.player.key !== key) {
      if (W.player) actors.dispose(W.player);
      W.player = actors.make(drifterLook(ch.look ?? 0, ch.gear), { player: true });
      W.player.key = key;
      W.group.add(W.player.root);
    }
    return W.player;
  }

  // ---------------------------------------------------------------- telegraphs
  function telegraph(e, key, build) {
    const W = r.world;
    let t = W.telegraphs.get(key);
    if (!t) { t = build(); W.group.add(t.group); W.telegraphs.set(key, t); }
    t.seen = true;
    t.group.visible = true;
    t.group.position.set(e.x * U, 0, e.y * U);
    return t;
  }
  function updateTelegraphs(sim) {
    const W = r.world;
    for (const t of W.telegraphs.values()) t.seen = false;
    for (const e of sim.state.enemies) {
      if (e.dead) continue;
      if (e.state === 'flare') {
        const t = telegraph(e, `${e.id}:flare`, () => {
          const group = new THREE.Group();
          const ball = new THREE.Mesh(G.sphere, basic('#ff5a3a', { depthWrite: true }));
          group.add(ball);
          return { group, ball };
        });
        const prog = clamp(1 - e.atk.t / 1.3, 0, 1);
        t.ball.position.set(Math.cos(e.facing) * 0.3, 2.2 + prog * 0.4, Math.sin(e.facing) * 0.3);
        t.ball.scale.setScalar(0.07 + prog * 0.14);
        continue;
      }
      if (e.atk.phase !== 'windup') continue;
      const kind = e.atk.w || WEAPONS[ENEMIES[e.kind].weapon]?.kind;
      const w = kind === 'claw' ? WEAPONS.claw : ENEMIES[e.kind].boss ? { shotgun: { range: 300, spread: 0.3, windup: 0.62 }, charge: { range: 420, windup: 0.8 }, dynamite: { windup: 0.7 } }[kind] : WEAPONS[ENEMIES[e.kind].weapon];
      if (!w || kind === 'dynamite') continue;
      const prog = clamp(1 - e.atk.t / w.windup, 0, 1);
      if (kind === 'shotgun') {
        const t = telegraph(e, `${e.id}:cone`, () => {
          const group = new THREE.Group();
          const geo = new THREE.CircleGeometry(w.range * U * 1.05, 18, -(w.spread + 0.04), 2 * (w.spread + 0.04)).rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geo, basic('#e2735c', { side: THREE.DoubleSide }));
          mesh.position.y = 0.06;
          mesh.userData.own = true;
          group.add(mesh);
          return { group, mesh, geo };
        });
        t.group.rotation.y = -e.atk.angle;
        t.mesh.material.opacity = 0.14 + prog * 0.34;
      } else if (kind === 'claw') {
        const t = telegraph(e, `${e.id}:claw`, () => {
          const group = new THREE.Group();
          const geo = new THREE.RingGeometry(w.reach * U * 0.6, w.reach * U * 1.25, 16, 1, -w.arc, 2 * w.arc).rotateX(-Math.PI / 2);
          const mesh = new THREE.Mesh(geo, basic(ENEMIES[e.kind].ai === 'swarm' ? '#c9bfff' : '#e2735c', { side: THREE.DoubleSide }));
          mesh.position.y = 0.07;
          group.add(mesh);
          return { group, mesh, geo };
        });
        t.group.rotation.y = -e.atk.angle;
        t.mesh.material.opacity = 0.25 + prog * 0.6;
      } else {
        const charge = kind === 'charge';
        const t = telegraph(e, `${e.id}:line`, () => {
          const group = new THREE.Group();
          const mesh = new THREE.Mesh(G.boxX, basic('#ff5a3c'));
          group.add(mesh);
          return { group, mesh };
        });
        const locked = e.atk.t <= (w.lock ?? 0.12);
        const len = castRay(sim, e.x, e.y, Math.cos(e.atk.angle), Math.sin(e.atk.angle), charge ? 260 : w.range, BLOCKS_SHOT) * U;
        t.group.rotation.y = -e.atk.angle;
        const thick = charge ? 0.7 : locked ? 0.05 : 0.025;
        t.mesh.position.y = charge ? 0.06 : GUN_Y * (ENEMIES[e.kind].boss ? 1.5 : 1);
        t.mesh.scale.set(Math.max(0.1, len), charge ? 0.02 : thick, thick);
        t.mesh.material.opacity = charge ? 0.2 + prog * 0.4 : locked ? 0.95 : 0.3 + prog * 0.4;
      }
    }
    for (const [key, t] of W.telegraphs) {
      if (t.seen) continue;
      t.group.visible = false;
      const id = Number(key.split(':')[0]);
      if (!sim.state.enemies.some((e) => e.id === id)) {
        W.group.remove(t.group);
        t.geo?.dispose();
        for (const o of [t.mesh, t.ball]) o?.material.dispose();
        W.telegraphs.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------- camera and aim
  function cameraBasis() {
    const cy = Math.cos(r.yaw), sy = Math.sin(r.yaw), cp = Math.cos(r.pitch), sp = Math.sin(r.pitch);
    return { fx: cy * cp, fy: -sp, fz: sy * cp, rx: -sy, rz: cy };
  }
  r.look = (dYaw, dPitch) => {
    r.yaw += dYaw;
    if (r.yaw > Math.PI) r.yaw -= TAU;
    if (r.yaw < -Math.PI) r.yaw += TAU;
    r.pitch = clamp(r.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  };
  /** Move axes (forward/right, -1..1) to a world-space move vector for the sim. */
  r.moveToWorld = (fwd, right) => {
    const cy = Math.cos(r.yaw), sy = Math.sin(r.yaw);
    return { mx: fwd * cy - right * sy, my: fwd * sy + right * cy };
  };
  r.updateCamera = (sim, dt) => {
    const p = r.playerPos || sim.state.player;
    const px = p.x * U, pz = p.y * U;
    // The pivot rides the (interpolated) drifter exactly: no lag for the camera to catch up on.
    r.pivot.set(px, EYE, pz);
    r.camReady = true;
    const b = cameraBasis();
    // Shoulder offset, shortened if a wall is right beside the drifter.
    const sideFree = castRay(sim, r.pivot.x / U, r.pivot.z / U, b.rx, b.rz, 1.2 / U, OPAQUE) * U;
    const sideWant = Math.min(0.92, Math.max(0, sideFree - 0.22));
    r.side = r.side === undefined ? sideWant : lerp(r.side, sideWant, 1 - Math.exp(-dt * 14));
    const side = Math.min(r.side, sideWant + 0.25);
    const sx = r.pivot.x + b.rx * side, sz = r.pivot.z + b.rz * side;
    const dist = (r.view.w < r.view.h ? 5.4 : 4.9) * (sim.state.player.sprinting ? 1.07 : 1);
    const dx = -b.fx * dist, dz = -b.fz * dist;
    const hd = Math.hypot(dx, dz) || 1;
    const free = castRay(sim, sx / U, sz / U, dx / hd, dz / hd, (hd + 0.4) / U, OPAQUE) * U;
    const want = free < hd + 0.3 ? clamp((free - 0.3) / hd, 0.08, 1) : 1;
    // pull in quickly but not in one frame, ease back out slowly
    r.camScale = want < r.camScale ? Math.max(want, lerp(r.camScale, want, 1 - Math.exp(-dt * 30)) - 0.0) : lerp(r.camScale, want, 1 - Math.exp(-dt * 4));
    // Squeezed by a wall: rise over it and tip down toward the drifter (roofs hide while you are inside).
    const crane = (1 - r.camScale) * 2.2;
    const shake = reduced || !r.shakeOn ? 0 : r.shake * 0.012;
    camera.position.set(
      sx + dx * r.camScale + (Math.random() - 0.5) * shake,
      EYE + 0.62 - b.fy * dist * r.camScale + crane + (Math.random() - 0.5) * shake,
      sz + dz * r.camScale + (Math.random() - 0.5) * shake,
    );
    camera.lookAt(camera.position.x + b.fx, camera.position.y + b.fy - crane * 0.42, camera.position.z + b.fz);
    camera.updateMatrixWorld();
  };

  /** Title screen: a slow drift down Main Street instead of the shoulder camera. */
  r.cinematic = (sim, t) => {
    const x = 20 + (Math.sin(t * 0.05 - 1.2) * 0.5 + 0.5) * 44, z = 40 + Math.sin(t * 0.08) * 2;
    camera.position.set(x, 4.6 + Math.sin(t * 0.06) * 0.7, z + 1.2);
    camera.lookAt(x + 30, 2.4, 38.6);
    camera.updateMatrixWorld();
    r.camReady = false;
  };

  /** Walk a 3D ray through the tile grid (with heights) and the enemies; returns the hit distance in metres. */
  function traceWorld(sim, O, D, maxT) {
    const s = sim.state, L = sim.level;
    const flags = sim.cache.flags, hgt = L.hgt, w = L.w, h = L.h;
    let best = maxT;
    if (D.y < -1e-4) best = Math.min(best, -O.y / D.y);
    const dxz = Math.hypot(D.x, D.z);
    if (dxz > 1e-6) {
      const ux = D.x / dxz, uz = D.z / dxz;
      const ox = O.x / TM, oz = O.z / TM;        // tile units
      let tx = Math.floor(ox), tz = Math.floor(oz);
      const stepX = ux > 0 ? 1 : -1, stepZ = uz > 0 ? 1 : -1;
      const tdx = Math.abs(ux) > 1e-9 ? 1 / Math.abs(ux) : Infinity;
      const tdz = Math.abs(uz) > 1e-9 ? 1 / Math.abs(uz) : Infinity;
      let nx = Math.abs(ux) > 1e-9 ? (ux > 0 ? tx + 1 - ox : ox - tx) / Math.abs(ux) : Infinity;
      let nz = Math.abs(uz) > 1e-9 ? (uz > 0 ? tz + 1 - oz : oz - tz) / Math.abs(uz) : Infinity;
      let along = 0;
      for (let guard = 0; guard < 700; guard++) {
        const enter = along, exit = Math.min(nx, nz);
        if (tx >= 0 && tz >= 0 && tx < w && tz < h) {
          const i = tz * w + tx;
          if (flags[i] & BLOCKS_SHOT) {
            const top = hgt[i] / 10;
            const t0 = (enter * TM) / dxz, t1 = (exit * TM) / dxz;
            const y0 = O.y + D.y * t0, y1 = O.y + D.y * t1;
            if (y0 <= top) { best = Math.min(best, t0); break; }
            if (y1 <= top) { best = Math.min(best, (top - O.y) / D.y); break; }
          }
        }
        if ((exit * TM) / dxz > best) break;
        along = exit;
        if (nx < nz) { nx += tdx; tx += stepX; } else { nz += tdz; tz += stepZ; }
      }
    }
    for (const e of s.enemies) {
      if (e.dead) continue;
      const cx = e.x * U, cz = e.y * U, rad = e.r * U + 0.1;
      const ox = O.x - cx, oz = O.z - cz;
      const a = D.x * D.x + D.z * D.z, b2 = ox * D.x + oz * D.z, c = ox * ox + oz * oz - rad * rad;
      const disc = b2 * b2 - a * c;
      if (disc < 0 || a < 1e-9) continue;
      const t = (-b2 - Math.sqrt(disc)) / a;
      if (t <= 0 || t >= best) continue;
      const y = O.y + D.y * t;
      if (y >= 0 && y <= 1.9 * (LOOKS[ENEMIES[e.kind].look]?.scale || 1)) best = t;
    }
    return best;
  }

  /** Where the crosshair (or the free cursor) points, in sim units. */
  r.aimPoint = (sim, cursor) => {
    const p = sim.state.player;
    let O, D;
    if (cursor) {
      ndc.set((cursor.x / r.view.w) * 2 - 1, -(cursor.y / r.view.h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      O = raycaster.ray.origin; D = raycaster.ray.direction;
    } else { O = camera.position; D = camera.getWorldDirection(tmp2); }
    const toPlayer = (p.x * U - O.x) * D.x + (EYE - O.y) * D.y + (p.y * U - O.z) * D.z;
    const minT = Math.max(0.5, toPlayer + 0.7);
    let t = traceWorld(sim, O, D, 110);
    if (t < minT) t = Math.max(minT, 6);
    return { x: (O.x + D.x * t) / U, y: (O.z + D.z * t) / U };
  };

  /** Touch aim assist: the visible enemy nearest the crosshair, if any is close enough. */
  r.assistTarget = (sim) => {
    let best = null, bestD = Math.min(r.view.w, r.view.h) * 0.17;
    for (const e of sim.state.enemies) {
      if (e.dead || !isVisible(sim, e.x, e.y)) continue;
      const q = project(e.x * U, 1.1, e.y * U);
      if (!q.front) continue;
      const d = Math.hypot(q.x - r.view.w / 2, q.y - r.view.h / 2);
      if (d < bestD) { bestD = d; best = { x: e.x, y: e.y }; }
    }
    return best;
  };

  function project(x, y, z) {
    tmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const front = tmp.z < -0.15;
    const depth = -tmp.z;
    tmp.applyMatrix4(camera.projectionMatrix);
    return { x: (tmp.x * 0.5 + 0.5) * r.view.w, y: (-tmp.y * 0.5 + 0.5) * r.view.h, front, depth };
  }
  r.project = project;
  /** Screen position of a sim point, or (off screen) the direction to it for an edge arrow. */
  r.locate = (x, y, height = 1.2) => {
    const q = project(x * U, height, y * U);
    if (q.front) return q;
    tmp.set(x * U, height, y * U).applyMatrix4(camera.matrixWorldInverse);
    return { front: false, dx: tmp.x, dy: Math.abs(tmp.y) + Math.abs(tmp.z), depth: q.depth };
  };

  // ---------------------------------------------------------------- lifecycle
  r.resize = () => {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dprHud = Math.min(window.devicePixelRatio || 1, 2);
    r.view = { w, h, dpr: dprHud };
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[r.quality].dpr));
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 74 : 60;
    camera.updateProjectionMatrix();
    hudCanvas.width = Math.round(w * dprHud);
    hudCanvas.height = Math.round(h * dprHud);
    const scale = gl.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const sys of [sparks, dust, glows]) sys.pts.material.uniforms.uScale.value = scale;
    const v = document.createElement('canvas');
    v.width = Math.ceil(w / 2); v.height = Math.ceil(h / 2);
    const g = v.getContext('2d');
    const grad = g.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.4, v.width / 2, v.height / 2, Math.hypot(v.width, v.height) * 0.62);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = grad; g.fillRect(0, 0, v.width, v.height);
    r.vignette = v;
  };

  function setQuality(q) {
    r.quality = clamp(q, 0, QUALITY.length - 1);
    const Q = QUALITY[r.quality];
    gl.shadowMap.enabled = Q.shadows > 0;
    if (Q.shadows) {
      sun.shadow.mapSize.set(Q.shadows, Q.shadows);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    scene.traverse((o) => { if (o.material) for (const mt of [].concat(o.material)) mt.needsUpdate = true; });
    r.resize();
  }
  r.setQuality = setQuality;
  r.autoQuality = true;

  r.prepare = (sim) => {
    buildLevel(sim);
    r.sim = sim;
    r.toasts = []; r.floaters = []; r.banner = null;
    r.marks.clear(); r.hitDirs = [];
    r.deathFade = 0; r.camReady = false; r.camScale = 1;
    r.yaw = sim.state.player.aim; r.pitch = 0.14;
    r.warmup = 3; r.envT = 0; r.miniKey = null;
    sparks.list = []; dust.list = [];
    setQuality(r.quality);
  };
  r.dispose = () => disposeWorld();
  r.camera = camera; r.scene = scene; r.gl = gl;

  // ---------------------------------------------------------------- events
  function decal(x, z, size) {
    const W = r.world;
    const d = W.decals[W.decalNext];
    W.decalNext = (W.decalNext + 1) % W.decals.length;
    d.visible = true;
    d.position.set(x, 0.02 + W.decalNext * 0.0004, z);
    d.scale.setScalar(size);
  }
  function flashAt(x, y, z, intensity = 3, color = '#ffd9a0', time = 0.07) {
    const f = flashes.reduce((a, b) => (a.t < b.t ? a : b));
    f.t = time;
    f.light.position.set(x, y, z);
    f.light.color.copy(col(color));
    f.light.intensity = intensity;
  }
  function floatText(x, y, text, color, size = 14, z = 2.0) {
    r.floaters.push({ x, y, z, text, color, size, life: 1.1, max: 1.1 });
    if (r.floaters.length > 40) r.floaters.shift();
  }
  const actorOf = (id) => r.world?.actors.get(id);

  r.consume = (events, sim) => {
    const W = r.world;
    if (!W) return;
    const p = sim.state.player;
    for (const e of events) {
      const X = Number.isFinite(e.x) ? e.x * U : 0, Z = Number.isFinite(e.y) ? e.y * U : 0;
      switch (e.type) {
        case 'shot': {
          const heavy = e.kind === 'shotgun' ? 1.8 : e.kind === 'rifle' ? 1.4 : 1;
          r.kick = Math.min(1.6, heavy);
          r.shake = Math.max(r.shake, 2.4 * heavy);
          flashAt(X, GUN_Y, Z, 3.5 * heavy);
          for (let i = 0; i < 8 * heavy; i++) {
            const a = e.angle + (Math.random() - 0.5) * (e.kind === 'shotgun' ? 1.1 : 0.7);
            const sp = 4 + Math.random() * 7;
            emit(sparks, { x: X, y: GUN_Y, z: Z, vx: Math.cos(a) * sp, vy: (Math.random() - 0.3) * 2, vz: Math.sin(a) * sp, life: 0.1 + Math.random() * 0.08, size: 0.07, color: '#ffe3a0', drag: 6 });
          }
          emit(sparks, { x: X, y: GUN_Y, z: Z, life: 0.06, size: 0.6 * heavy, color: '#fff3c4' });
          emit(dust, { x: X, y: GUN_Y, z: Z, vx: Math.cos(e.angle) * 1.5, vy: 0.4, vz: Math.sin(e.angle) * 1.5, life: 0.7, size: 0.35, grow: 2, a: 0.3, color: '#b8a898', drag: 2 });
          if (W.player) W.player.shootT = 0;
          break;
        }
        case 'enemy_shot': {
          const a = actorOf(e.id);
          if (a) a.shootT = 0;
          flashAt(X + Math.cos(e.angle) * 0.6, GUN_Y, Z + Math.sin(e.angle) * 0.6, 3, '#ffc27a');
          emit(sparks, { x: X + Math.cos(e.angle) * 0.6, y: GUN_Y, z: Z + Math.sin(e.angle) * 0.6, life: 0.06, size: e.weapon === 'shotgun' ? 0.8 : 0.5, color: '#ffd29a' });
          if (isVisible(sim, e.x, e.y)) r.shake = Math.max(r.shake, 1);
          break;
        }
        case 'buddy_shot': { const a = r.world?.buddy; if (a) a.shootT = 0; break; }
        case 'echo_shot':
          flashAt(X, GUN_Y, Z, 2, '#9fe8ff');
          emit(sparks, { x: X, y: GUN_Y, z: Z, life: 0.08, size: 0.5, color: '#9fe8ff' });
          break;
        case 'impact':
          for (let i = 0; i < 5; i++) {
            const a = e.angle + Math.PI + (Math.random() - 0.5) * 2;
            emit(sparks, { x: X, y: GUN_Y, z: Z, vx: Math.cos(a) * (1 + Math.random() * 3), vy: Math.random() * 3, vz: Math.sin(a) * (1 + Math.random() * 3), grav: 9, life: 0.25 + Math.random() * 0.2, size: 0.05, color: e.owner === 'echo' ? '#9fe8ff' : '#f7d79a', drag: 2 });
          }
          emit(dust, { x: X, y: GUN_Y, z: Z, vy: 0.3, life: 0.8, size: 0.3, grow: 2.5, a: 0.4, color: '#b08660', drag: 3 });
          break;
        case 'enemy_hit': {
          r.hitMarker = 0.14;
          const a = actorOf(e.id);
          if (a) a.flash = 1;
          const hollow = e.kind === 'walker' || e.kind === 'husk';
          for (let i = 0; i < 6; i++) {
            const an = e.angle + (Math.random() - 0.5) * 1.3;
            emit(dust, { x: X, y: 1.0, z: Z, vx: Math.cos(an) * (1 + Math.random() * 2.5), vy: Math.random() * 1.5, vz: Math.sin(an) * (1 + Math.random() * 2.5), grav: 9, life: 0.4, size: 0.07, a: 0.9, color: hollow ? '#b9a8ff' : '#8a2a1e', drag: 3 });
          }
          floatText(e.x + (Math.random() - 0.5) * 14, e.y, String(e.amount), e.amount >= 50 ? '#ffd27a' : '#fff3e0', e.amount >= 50 ? 17 : 13, 1.9 + Math.random() * 0.3);
          break;
        }
        case 'enemy_killed': {
          r.shake = Math.max(r.shake, e.boss ? 9 : 3);
          const a = W.actors.get(e.id);
          if (a) {
            W.actors.delete(e.id);
            a.dead = true;
            a.deadT = 0;
            a.root.rotation.y = Math.PI / 2 - (e.angle + Math.PI);
            W.corpses.push({ a, t: 0 });
            if (W.corpses.length > 18) { const old = W.corpses.shift(); actors.dispose(old.a); }
          }
          if (e.kind !== 'walker' && e.kind !== 'husk') decal(X + Math.cos(e.angle) * 0.4, Z + Math.sin(e.angle) * 0.4, 0.5 + Math.random() * 0.3);
          else for (let i = 0; i < 18; i++) emit(sparks, { x: X, y: 0.3 + Math.random() * 1.5, z: Z, vx: (Math.random() - 0.5) * 2, vy: 0.5 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 0.9, size: 0.08, color: '#b9a8ff', drag: 1 });
          break;
        }
        case 'target_hit':
          r.hitMarker = 0.14;
          for (let i = 0; i < 10; i++) { const an = Math.random() * TAU; emit(sparks, { x: X, y: 1.0, z: Z, vx: Math.cos(an) * 2, vy: 1 + Math.random() * 2, vz: Math.sin(an) * 2, grav: 9, life: 0.4, size: 0.06, color: '#ffd27a', drag: 2 }); }
          floatText(e.x, e.y, 'HIT', '#ffd27a', 13);
          break;
        case 'player_hit':
          r.shake = Math.max(r.shake, 7);
          if (e.fromAngle !== null && e.fromAngle !== undefined) r.hitDirs.push({ a: e.fromAngle, t: 1.1 });
          if (W.player) W.player.flash = 1;
          break;
        case 'dodge':
          if (W.player) W.player.roll = 1;
          for (let i = 0; i < 8; i++) emit(dust, { x: X + (Math.random() - 0.5) * 0.4, y: 0.1, z: Z + (Math.random() - 0.5) * 0.4, vx: -Math.cos(e.angle) * 1.2 + (Math.random() - 0.5), vy: 0.4, vz: -Math.sin(e.angle) * 1.2 + (Math.random() - 0.5), life: 0.7, size: 0.4, grow: 1.5, a: 0.4, color: '#c4a076', drag: 2.5 });
          break;
        case 'dodged':
          floatText(e.x, e.y, 'close', '#ece1cb', 11);
          break;
        case 'alert':
          r.marks.set(e.id, { kind: '!', t: 1.4 });
          break;
        case 'heard':
          if (r.marks.get(e.id)?.kind !== '!') r.marks.set(e.id, { kind: '?', t: 1.6 });
          break;
        case 'wake':
          r.marks.set(e.id, { kind: '!', t: 1.2 });
          for (let i = 0; i < 10; i++) emit(sparks, { x: X, y: 0.6 + Math.random(), z: Z, vx: (Math.random() - 0.5) * 2, vy: 1, vz: (Math.random() - 0.5) * 2, life: 0.6, size: 0.07, color: '#b9a8ff', drag: 1 });
          break;
        case 'windup': {
          const a = actorOf(e.id);
          if (a && e.weapon === 'claw') a.meleeT = 0;
          break;
        }
        case 'throw': {
          const a = e.enemy ? null : W.player;
          if (a) a.meleeT = 0.1;
          break;
        }
        case 'charge':
          for (let i = 0; i < 10; i++) emit(dust, { x: X + (Math.random() - 0.5) * 0.6, y: 0.1, z: Z + (Math.random() - 0.5) * 0.6, vx: -Math.cos(e.angle) * 2, vy: 0.5, vz: -Math.sin(e.angle) * 2, life: 0.8, size: 0.5, grow: 1.6, a: 0.45, color: '#c4a076', drag: 2 });
          break;
        case 'claw':
          for (let i = 0; i < 5; i++) { const an = e.angle + (Math.random() - 0.5) * 1.6; emit(sparks, { x: X + Math.cos(an) * 0.9, y: 1.0, z: Z + Math.sin(an) * 0.9, life: 0.14, size: 0.12, color: '#e8dcff' }); }
          break;
        case 'bomb_land':
          emit(dust, { x: X, y: 0.1, z: Z, vy: 0.4, life: 0.5, size: 0.4, grow: 1.5, a: 0.4, color: '#c4a076', drag: 2 });
          break;
        case 'explosion': {
          const d = Math.hypot(p.x - e.x, p.y - e.y) * U;
          r.shake = Math.max(r.shake, clamp(16 - d * 0.7, 2, 14));
          flashAt(X, 1.2, Z, 9, '#ffb060', 0.16);
          decal(X, Z, e.r * U * 0.7);
          emit(sparks, { x: X, y: 0.8, z: Z, life: 0.16, size: e.r * U * 1.6, color: '#ffe0a0' });
          for (let i = 0; i < 26; i++) {
            const an = Math.random() * TAU, sp = 3 + Math.random() * 9;
            emit(sparks, { x: X, y: 0.5, z: Z, vx: Math.cos(an) * sp, vy: 2 + Math.random() * 6, vz: Math.sin(an) * sp, grav: 12, life: 0.4 + Math.random() * 0.5, size: 0.09, color: '#ffb35c', drag: 1.5 });
          }
          for (let i = 0; i < 14; i++) {
            const an = Math.random() * TAU, sp = 1 + Math.random() * 3;
            emit(dust, { x: X + Math.cos(an) * 0.5, y: 0.4 + Math.random(), z: Z + Math.sin(an) * 0.5, vx: Math.cos(an) * sp, vy: 1 + Math.random() * 2, vz: Math.sin(an) * sp, life: 1.2 + Math.random() * 0.8, size: 0.9, grow: 2.2, a: 0.5, color: i % 3 ? '#6a5a4c' : '#b08660', drag: 1.5 });
          }
          break;
        }
        case 'boss_phase':
          r.shake = Math.max(r.shake, 8);
          break;
        case 'flare':
          for (let i = 0; i < 30; i++) {
            const a = Math.random() * TAU;
            emit(sparks, { x: X, y: 2.4, z: Z, vx: Math.cos(a) * 3, vy: 3 + Math.random() * 3, vz: Math.sin(a) * 3, grav: 2, life: 1.2 + Math.random() * 0.8, size: 0.09, color: '#ff8a5c', drag: 1 });
          }
          break;
        case 'loot':
          floatText(e.x, e.y, `+$${e.value}`, '#e8a33d', 15, 1.4);
          if (e.text) toast(r, `Found ${e.text}.`, 'good');
          break;
        case 'pickup':
          floatText(e.x, e.y, e.text, e.what === 'cash' ? '#e8a33d' : '#ece1cb', 12, 1.2);
          break;
        case 'healed':
          floatText(e.x, e.y, `+${e.amount}`, '#a9c98f');
          break;
        case 'bandage':
          if (W.player) { W.player.oneShot = 'interact-right'; W.player.oneT = 0; }
          break;
        case 'extract_start':
          for (let i = 0; i < 36; i++) {
            const a = (i / 36) * TAU;
            emit(sparks, { x: X + Math.cos(a) * 2.6, y: 0.1, z: Z + Math.sin(a) * 2.6, vy: 1.5, life: 0.8, size: 0.1, color: '#a9c98f', drag: 1 });
          }
          break;
        case 'extract_cancel':
          toast(r, e.reason, 'warn');
          break;
        case 'interact_done':
          if (e.item === 'stake') for (let i = 0; i < 16; i++) emit(sparks, { x: X, y: 0.4, z: Z, vx: (Math.random() - 0.5), vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5), life: 1, size: 0.08, color: '#ffb35c', drag: 1 });
          if (W.player && e.kind !== 'cache') { W.player.oneShot = 'pick-up'; W.player.oneT = 0; }
          break;
        case 'toast':
          toast(r, e.text, e.tone, e.long);
          break;
        case 'enter_zone':
          if (e.name) r.banner = { text: e.name.toUpperCase(), life: 2.6, max: 2.6 };
          break;
        case 'player_died':
          r.shake = 10;
          if (W.player) { W.player.dead = true; W.player.deadT = 0; }
          break;
        default:
          break;
      }
    }
  };

  // ---------------------------------------------------------------- per-frame sync
  function turn(a, b, max) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return Math.abs(d) <= max ? b : a + Math.sign(d) * max;
  }

  function syncPlayer(sim, dt) {
    const s = sim.state, p = s.player;
    const a = ensurePlayer(sim);
    actors.setGun(a, GUN_FOR[p.gun], false);
    const speed = Math.hypot(p.vx, p.vy) * U;
    const town = s.mode === 'town';
    const armed = !a.dead && !p.sprinting && p.healT <= 0 && p.dodgeT <= 0 && (!town || s.t - p.shotT < 2.5);
    const want = p.sprinting && speed > 2 ? Math.atan2(p.vy, p.vx) : town && !armed && speed > 0.6 ? Math.atan2(p.vy, p.vx) : p.aim;
    a.face = a.face === undefined ? want : turn(a.face, want, dt * 24);
    const pp = r.playerPos || p;
    actors.place(a, pp.x * U, pp.y * U, a.face);
    actors.update(a, dt, { speed, armed, facing: a.face, moveAngle: speed > 0.5 ? Math.atan2(p.vy, p.vx) : undefined });
    if (a.gun) a.gun.visible = !town || armed;
    a.root.visible = true;
  }

  function syncEnemies(sim, dt) {
    const s = sim.state, p = s.player, W = r.world;
    const seen = new Set();
    for (const e of s.enemies) {
      if (e.dead) continue;
      seen.add(e.id);
      const def = ENEMIES[e.kind];
      if (def.ai === 'none') {
        let t = W.targets.get(e.id);
        if (!t) {
          t = assets.mesh('forest/target');
          t.castShadow = true;
          t.position.set(e.x * U, 0.9, e.y * U);
          t.rotation.y = 0;
          W.group.add(t);
          W.targets.set(e.id, t);
        }
        continue;
      }
      let a = W.actors.get(e.id);
      if (!a) {
        a = actors.make(LOOKS[def.look] || LOOKS.bandit, { enemy: true });
        a.face = e.facing;
        W.group.add(a.root);
        W.actors.set(e.id, a);
      }
      const far = (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > 2600 * 2600;
      const hot = e.state === 'engage' || e.state === 'flare' || e.state === 'retreat' || e.state === 'dash';
      const want = e.atk.phase === 'windup' || e.state === 'dash' ? e.atk.angle : e.facing;
      a.face = turn(a.face, want, dt * 12);
      actors.place(a, e.x * U, e.y * U, a.face);
      if (!far || (r.frame & 3) === 0) {
        actors.update(a, far ? dt * 4 : dt, {
          speed: Math.hypot(e.vx, e.vy) * U, armed: hot || e.atk.phase === 'windup',
          reach: def.ai === 'swarm' || def.ai === 'charger', sit: e.state === 'dormant',
        });
      }
    }
    for (const [id, a] of W.actors) if (!seen.has(id)) { actors.dispose(a); W.actors.delete(id); }
    for (const [id, t] of W.targets) if (!seen.has(id)) { W.group.remove(t); W.targets.delete(id); }
    // the fallen lie where they fell for a while, then sink away
    W.corpses = W.corpses.filter((c) => {
      c.t += dt;
      if (c.t < 1.2) actors.update(c.a, dt, {});
      if (c.t > 11) c.a.root.position.y -= dt * 0.35;
      if (c.t > 14) { actors.dispose(c.a); return false; }
      return true;
    });
    // Deputy Tin
    const B = s.buddy;
    if (B) {
      if (!W.buddy) { W.buddy = actors.make(LOOKS.deputy, {}); W.group.add(W.buddy.root); W.buddy.face = B.facing; }
      const a = W.buddy;
      a.dead = B.downT > 0;
      if (!a.dead) a.deadT = 0;
      a.face = turn(a.face, B.facing, dt * 12);
      actors.place(a, B.x * U, B.y * U, a.face);
      actors.update(a, dt, { speed: B.moving ? 4.5 : 0, armed: s.mode !== 'town' });
    }
    // the echo
    const E = s.echo;
    if (E.visible) {
      if (!W.echo) { W.echo = actors.make(drifterLook(s.config.character.look ?? 0, []), { ghost: true }); actors.setGun(W.echo, 'Revolver_1'); W.group.add(W.echo.root); }
      W.echo.root.visible = true;
      actors.place(W.echo, E.x * U, E.y * U, E.a);
      actors.update(W.echo, dt, { speed: 2, armed: true });
    } else if (W.echo) W.echo.root.visible = false;
  }

  function syncNpcs(sim, dt) {
    const s = sim.state, W = r.world;
    for (const n of s.npcs) {
      let a = W.npcs.get(n.id);
      if (!a) {
        a = actors.make(LOOKS[n.look] || LOOKS.townsman, { enemy: false });
        W.group.add(a.root);
        W.npcs.set(n.id, a);
        a.face = n.facing;
      }
      a.face = turn(a.face, n.facing, dt * 8);
      actors.place(a, n.x * U, n.y * U, a.face);
      actors.update(a, dt, { speed: n.moving ? 1.8 : 0, armed: false });
    }
  }

  function syncBullets(sim) {
    const s = sim.state;
    let n = 0;
    const colors = tracers.instanceColor.array;
    for (const b of s.bullets) {
      if (n >= 96) break;
      const ang = Math.atan2(b.vy, b.vx);
      const len = Math.min(2.4, Math.max(0.5, Math.hypot(b.x - b.px, b.y - b.py) * U * 1.4));
      pos.set(b.x * U - Math.cos(ang) * len / 2, GUN_Y, b.y * U - Math.sin(ang) * len / 2);
      quat.setFromAxisAngle(yAxis, -ang);
      scl.set(len, 0.035, 0.035);
      m4.compose(pos, quat, scl);
      tracers.setMatrixAt(n, m4);
      const c = b.owner === 'player' ? [1, 0.88, 0.55] : b.owner === 'echo' ? [0.45, 0.85, 1] : [1, 0.42, 0.22];
      colors[n * 3] = c[0]; colors[n * 3 + 1] = c[1]; colors[n * 3 + 2] = c[2];
      n++;
    }
    tracers.count = n;
    tracers.instanceMatrix.needsUpdate = true;
    tracers.instanceColor.needsUpdate = true;
  }

  function syncBombs(sim, dt) {
    const s = sim.state, W = r.world;
    const seen = new Set();
    for (const b of s.bombs) {
      seen.add(b.id);
      let o = W.bombs.get(b.id);
      if (!o) {
        const stick = new THREE.Mesh(G.stick, new THREE.MeshLambertMaterial({ color: col('#b5483a') }));
        stick.castShadow = true;
        const ring = new THREE.Mesh(G.ring, basic(b.owner === 'player' ? '#e8a33d' : '#ff5a3c', { opacity: 0.6, side: THREE.DoubleSide }));
        const fill = new THREE.Mesh(G.disc, basic(b.owner === 'player' ? '#e8a33d' : '#ff5a3c', { opacity: 0.12, side: THREE.DoubleSide }));
        ring.position.set(b.x * U, 0.07, b.y * U); fill.position.set(b.x * U, 0.06, b.y * U);
        ring.scale.setScalar(b.r * U); fill.scale.setScalar(b.r * U);
        W.group.add(stick, ring, fill);
        o = { stick, ring, fill };
        W.bombs.set(b.id, o);
      }
      const u = clamp(b.t / b.flight, 0, 1);
      const d = Math.hypot(b.x - b.x0, b.y - b.y0) * U;
      const y = b.landed ? 0.1 : 1.2 * (1 - u) + 4 * u * (1 - u) * (1.6 + d * 0.12) + 0.1;
      const x = lerp(b.x0, b.x, u) * U, z = lerp(b.y0, b.y, u) * U;
      o.stick.position.set(x, y, z);
      o.stick.rotation.set(b.landed ? Math.PI / 2 : r.time * 14, 0, b.landed ? 0.6 : r.time * 9);
      const left = b.flight + b.fuse - b.t;
      o.fill.material.opacity = 0.1 + (1 - clamp(left / (b.flight + b.fuse), 0, 1)) * 0.28 + (left < 0.5 ? Math.sin(r.time * 40) * 0.08 : 0);
      if (Math.random() < 0.6) emit(sparks, { x, y: y + 0.18, z, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 1.5, grav: 6, life: 0.25, size: 0.06, color: '#ffe3a0', drag: 1 });
    }
    for (const [id, o] of W.bombs) {
      if (seen.has(id)) continue;
      W.group.remove(o.stick, o.ring, o.fill);
      o.stick.material.dispose(); o.ring.material.dispose(); o.fill.material.dispose();
      W.bombs.delete(id);
    }
  }

  function syncProps(sim, dt) {
    const s = sim.state, W = r.world;
    for (const it of s.interactables) {
      const o = W.props.get(it.id);
      if (!o) continue;
      if (it.kind === 'cache') {
        const target = it.done ? 1 : 0;
        if (o.open !== target) { o.open += Math.sign(target - o.open) * Math.min(Math.abs(target - o.open), dt * 3); o.lid.rotation.z = o.open * 2.2; }
      } else if (it.kind === 'objective') {
        if (it.item === 'stake') {
          if (it.done && Math.random() < 0.5) emit(sparks, { x: it.x * U + (Math.random() - 0.5) * 0.2, y: 0.9 + Math.random() * 0.6, z: it.y * U + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.4, vy: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 0.9, size: 0.12, color: '#ffb35c', drag: 0.5 });
          if (it.done && Math.random() < 0.15) emit(dust, { x: it.x * U, y: 1.6, z: it.y * U, vx: 0.4, vy: 1.6, vz: 0.1, life: 3, size: 0.8, grow: 3, a: 0.35, color: '#4a4038', drag: 0.2 });
        } else o.group.visible = !it.done;
        if (o.spin) { o.spin.rotation.y += dt * 1.2; o.spin.position.y += Math.sin(r.time * 2) * dt * 0.08; }
      } else if (it.kind === 'exit') {
        const active = s.extract.active && s.extract.id === it.id;
        o.ring.material.opacity = active ? 0.9 : 0.35 + Math.sin(r.time * 2) * 0.1;
        o.fill.material.opacity = active ? 0.12 + (s.extract.t / PLAYER.extractTime) * 0.3 : 0;
        o.fill.scale.setScalar(active ? PLAYER.extractRadius * U * (s.extract.t / PLAYER.extractTime) : 0.01);
      }
    }
    // pickups
    const seen = new Set();
    for (const k of s.pickups) {
      seen.add(k.id);
      let m = W.pickups.get(k.id);
      if (!m) {
        if (k.kind === 'cash') m = new THREE.Mesh(G.coin, new THREE.MeshLambertMaterial({ color: col('#e8b84a'), emissive: col('#5a3a08') }));
        else if (k.kind === 'ammo') { m = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: col(k.ammo === 'shells' ? '#b5483a' : '#c9a05a'), emissive: col('#3a2408') })); m.scale.set(0.26, 0.16, 0.18); }
        else { m = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: col('#8a5a36'), emissive: col('#3a2408') })); m.scale.set(0.4, 0.28, 0.2); }
        m.castShadow = true;
        W.group.add(m);
        W.pickups.set(k.id, m);
      }
      m.position.set(k.x * U, 0.32 + Math.sin(r.time * 3 + k.id) * 0.07, k.y * U);
      m.rotation.y = r.time * 2 + k.id;
      if (k.kind === 'cash') m.rotation.x = Math.PI / 2;
    }
    for (const [id, m] of W.pickups) if (!seen.has(id)) { W.group.remove(m); m.material.dispose(); W.pickups.delete(id); }
  }

  function syncLights(sim, dt) {
    const s = sim.state, p = s.player, W = r.world;
    const dark = darkness(sim);
    for (const f of flashes) { f.t = Math.max(0, f.t - dt); if (f.t <= 0) f.light.intensity = 0; }
    const px = p.x * U, pz = p.y * U;
    const sources = [];
    for (const l of s.lights) {
      const flick = l.kind === 'flare' ? 1 : 0.85 + Math.sin(r.time * 11 + l.x) * 0.08 + Math.random() * 0.07;
      const fade = l.t > 0 && l.t < 1.5 ? l.t / 1.5 : 1;
      const blast = l.kind === 'blast';
      sources.push({ x: l.x * U, y: l.kind === 'flare' ? 3 : 0.8, z: l.y * U, color: l.kind === 'flare' ? '#ff5a3a' : '#ff9a4a', i: (l.kind === 'flare' ? 4 : blast ? 5 : 1.4 + dark * 1.2) * flick * fade, d: l.r * U * 1.7, pri: 1 });
    }
    if (dark > 0.12) {
      for (const l of W.glowSrc) {
        if (l.kind === 'fire') continue;
        const d2 = (l.x - px) ** 2 + (l.z - pz) ** 2;
        if (d2 > 34 * 34) continue;
        sources.push({ x: l.x, y: l.y, z: l.z, rgb: l.c, i: (l.kind === 'window' ? 0.9 : l.kind === 'glow' ? 1.6 : l.kind === 'shaft' ? 2.2 : 1.7) * dark, d: l.r * 1.25, pri: 0, d2 });
      }
    }
    for (const it of s.interactables) {
      if (it.kind === 'objective' && it.item === 'shard' && !it.done) sources.push({ x: it.x * U, y: 2, z: it.y * U, color: '#9b8cff', i: 2.2 + Math.sin(r.time * 2) * 0.4, d: 11, pri: 1 });
      if (it.kind === 'exit' && s.extract.active && s.extract.id === it.id) sources.push({ x: it.x * U, y: 2.2, z: it.y * U, color: '#ffb35c', i: 1.2 + dark * 1.4, d: 9, pri: 1 });
    }
    sources.sort((a, b) => (b.pri - a.pri) || (((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2)));
    worldLights.forEach((light, i) => {
      const src = sources[i];
      if (!src) { light.intensity = 0; return; }
      light.position.set(src.x, src.y, src.z);
      if (src.rgb) light.color.setRGB(src.rgb[0], src.rgb[1], src.rgb[2]).convertSRGBToLinear();
      else light.color.copy(col(src.color));
      light.intensity = src.i;
      light.distance = src.d;
    });
    // halos
    let n = 0;
    for (const l of W.glowSrc) {
      if (n >= glows.capacity) break;
      if ((l.x - px) ** 2 + (l.z - pz) ** 2 > 70 * 70) continue;
      const fire = l.kind === 'fire';
      const flick = fire ? 0.8 + Math.sin(r.time * 13 + l.x) * 0.12 + Math.random() * 0.1 : 1;
      glows.P[n * 3] = l.x; glows.P[n * 3 + 1] = l.y; glows.P[n * 3 + 2] = l.z;
      glows.C[n * 3] = l.c[0]; glows.C[n * 3 + 1] = l.c[1] * 0.8; glows.C[n * 3 + 2] = l.c[2] * 0.6;
      glows.S[n] = (fire ? 1.5 : l.kind === 'window' ? 1.3 : l.kind === 'shaft' ? 3.2 : 0.9) * flick;
      glows.A[n] = (fire ? 0.5 : 0.16) + dark * (fire ? 0.3 : 0.5);
      n++;
      if (fire && Math.random() < 0.3) emit(sparks, { x: l.x + (Math.random() - 0.5) * 0.3, y: 0.4, z: l.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.3, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 0.3, life: 1, size: 0.07, color: '#ffb35c', drag: 0.5 });
    }
    glows.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize', 'palpha']) glows.geo.attributes[k].needsUpdate = true;
  }

  function setSky(top, horizon, bottom) {
    const pa = skyGeo.attributes.position;
    const ct = col(top), ch = col(horizon), cb = col(bottom);
    const c = new THREE.Color();
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i) / 600;
      if (y >= 0) c.copy(ch).lerp(ct, Math.pow(y, 0.55));
      else c.copy(ch).lerp(cb, Math.min(1, -y * 5));
      skyColors[i * 3] = c.r; skyColors[i * 3 + 1] = c.g; skyColors[i * 3 + 2] = c.b;
    }
    skyGeo.attributes.color.needsUpdate = true;
  }

  function updateEnvironment(sim, dt) {
    const s = sim.state, p = s.player, L = sim.level;
    const town = s.mode === 'town';
    const mine = L.dark;
    const hollow = L.theme === 'hollow';
    const n = hollow ? 1 : mine ? 1 : nightFactor(s);
    const bonus = s.config.sundownBonus ?? 0;
    const pre = town ? 0.55 : s.noClock ? 0.2 : clamp(clockTime(s) / (CLOCK.dusk + bonus), 0, 1);
    const R = visionRadius(sim) * U;
    const a = clamp(n * 2, 0, 1), b = clamp(n * 2 - 1, 0, 1);
    let sunCol, sunI, hemiSky, hemiGround, hemiI, fogCol, fogNear, fogFar, skyTop, skyHor, elev;
    if (n <= 0) {
      sunCol = mix('#fff4e2', '#ffd29a', pre * pre);
      sunI = lerp(1.08, 0.92, pre);
      hemiSky = mix('#bcd4f2', '#e8c09a', pre);
      hemiGround = new THREE.Color('#9a7450');
      hemiI = 0.56;
      fogCol = mix('#e9d6ba', '#ecc096', pre);
      fogNear = 55; fogFar = 170;
      skyTop = mix('#4f86c6', '#6a7fb0', pre);
      skyHor = mix('#f2e2c8', '#f6c690', pre);
      elev = lerp(1.0, 0.42, pre);
    } else {
      sunCol = b > 0 ? mix('#ff8a4a', '#8fa6ff', b) : mix('#ffd29a', '#ff8a4a', a);
      sunI = lerp(lerp(0.92, 0.62, a), 0.2, b);
      hemiSky = mix(mix('#e8c09a', '#d07a6a', a), '#222c52', b);
      hemiGround = mix('#6a4a38', '#0d0d16', b);
      hemiI = lerp(0.5, 0.32, b);
      fogCol = mix(mix('#ecc096', '#c97a5e', a), '#0a0e1a', b);
      fogNear = lerp(34, 3, n);
      fogFar = lerp(120, R * 1.8 + 6, n);
      skyTop = mix(mix('#6a7fb0', '#3a3f78', a), '#05070f', b);
      skyHor = mix(mix('#f6c690', '#ff8a5a', a), '#141a30', b);
      elev = b > 0 ? 0.9 : lerp(0.42, 0.05, a);
    }
    if (hollow) {
      fogCol = fogCol.clone().lerp(new THREE.Color('#2a2040'), 0.85);
      fogNear = 4; fogFar = Math.max(22, R * 2.1);
      hemiSky = new THREE.Color('#6a58a8'); hemiGround = new THREE.Color('#1a1428'); hemiI = 0.42;
      sunCol = new THREE.Color('#a48cff'); sunI = 0.28;
      skyTop = new THREE.Color('#0c0818'); skyHor = new THREE.Color('#3a2a5a');
    }
    if (mine) {
      fogCol = new THREE.Color('#070605'); fogNear = 2.5; fogFar = Math.max(17, R * 1.7 + 4);
      hemiSky = new THREE.Color('#6a5a4a'); hemiGround = new THREE.Color('#141010'); hemiI = 0.2;
      sunI = 0;
      skyTop = new THREE.Color('#000000'); skyHor = new THREE.Color('#070605');
    }
    const lin = (c) => c.clone().convertSRGBToLinear();
    scene.fog.color.copy(lin(fogCol));
    scene.fog.near = fogNear; scene.fog.far = fogFar;
    scene.background = scene.fog.color;
    hemi.color.copy(lin(hemiSky)); hemi.groundColor.copy(lin(hemiGround)); hemi.intensity = hemiI;
    sun.color.copy(lin(sunCol)); sun.intensity = sunI;
    const az = b > 0 ? 2.2 : -2.3;
    const dir = tmp2.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();
    const px = p.x * U, pz = p.y * U;
    sun.position.set(px + dir.x * 70, dir.y * 70, pz + dir.z * 70);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();
    sun.castShadow = QUALITY[r.quality].shadows > 0 && !mine && sunI > 0.24;
    sunDisc.visible = b < 0.5 && !mine && !hollow;
    sunDisc.position.copy(camera.position).addScaledVector(dir, 520);
    sunDisc.lookAt(camera.position);
    sunDisc.material.color.copy(lin(sunCol)).multiplyScalar(1.5);
    moonDisc.visible = b >= 0.5 && !mine;
    moonDisc.position.copy(camera.position).addScaledVector(dir, 520);
    moonDisc.lookAt(camera.position);
    stars.material.opacity = mine ? 0 : b * 0.95;
    stars.position.copy(camera.position);
    sky.position.copy(camera.position);
    mesas.position.set(camera.position.x, 0, camera.position.z);
    mesas.visible = !mine;
    mesaMat.color.copy(lin(mix(mix('#a8705a', '#6a3a48', a), '#0c0e18', b)));
    if (hollow) mesaMat.color.copy(col('#1c1430'));
    outerGround.material.color.copy(lin(mix(mix('#c99a6a', '#8a5a44', a), '#0a0c14', b)));
    outerGround.visible = !mine;
    r.envT -= dt;
    if (r.envT <= 0) {
      r.envT = 0.5;
      setSky(`#${skyTop.getHexString()}`, `#${skyHor.getHexString()}`, `#${fogCol.getHexString()}`);
    }
    // The drifter's own light in the dark. It hangs above and a little behind them, so the camera
    // sees them lit rather than as a silhouette.
    lantern.intensity = mine ? 2.3 : n * 1.9 + (hollow ? 0.5 : 0);
    lantern.distance = R * 1.35 + 3;
    lantern.color.copy(col(hollow ? '#cdbcff' : '#ffc98a'));
    lantern.position.set(px - Math.cos(r.yaw) * 0.7, 2.3, pz - Math.sin(r.yaw) * 0.7);
  }

  // ---------------------------------------------------------------- frame
  r.frame = 0;
  r.draw = (sim, dt, ui = {}) => {
    const W = r.world;
    if (!W) return;
    r.frame++;
    r.time += dt;
    r.touch = Boolean(ui.touch);
    r.kick = Math.max(0, r.kick - dt * 9);
    r.hitMarker = Math.max(0, r.hitMarker - dt);
    r.shake = Math.max(0, r.shake - dt * 30);
    if (!ui.cameraUpdated) r.updateCamera(sim, dt);
    syncPlayer(sim, dt);
    if (ui.noHud && W.player) W.player.root.visible = false;
    syncEnemies(sim, dt);
    syncNpcs(sim, dt);
    updateTelegraphs(sim);
    syncBullets(sim);
    syncBombs(sim, dt);
    syncProps(sim, dt);
    syncLights(sim, dt);
    const p = sim.state.player;
    const near = [{ x: p.x * U, z: p.y * U }];
    for (const n of sim.state.npcs) near.push({ x: n.x * U, z: n.y * U });
    W.built.update(dt, p.x * U, p.y * U, near);
    stepSystem(sparks, dt);
    stepSystem(dust, dt);
    updateEnvironment(sim, dt);
    gl.render(scene, camera);
    hud.setTransform(r.view.dpr, 0, 0, r.view.dpr, 0, 0);
    hud.clearRect(0, 0, r.view.w, r.view.h);
    if (!ui.noHud) drawHUD(r, hud, sim, dt, ui);
    // Drop to a cheaper tier if the frame rate stays low.
    if (r.warmup > 0) r.warmup -= dt;
    else if (dt > 0 && r.autoQuality) {
      r.frameAvg = lerp(r.frameAvg, dt, 0.05);
      if (r.frameAvg > 1 / 34 && r.quality < QUALITY.length - 1) {
        r.slowT += dt;
        if (r.slowT > 2.5) { setQuality(r.quality + 1); r.slowT = 0; r.warmup = 1.5; }
      } else r.slowT = Math.max(0, r.slowT - dt);
    }
  };

  r.resize();
  return r;
}
