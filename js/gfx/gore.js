// Blood, oil and ichor: splats on floors and walls where someone died, marks that stay on bodies where
// they were hit (on Rook until a dressing is used), and the blood that creeps in from the screen edges.
// Everything is presentation: the sim never knows. Textures are drawn once on canvases.

const MAX_DECALS = 90, MAX_MARKS = 10;

/** What leaks out of a kind of body. */
export const FLUIDS = {
  blood: { color: '#7a0d0a', mark: '#5c0806', glow: false },
  oil: { color: '#141110', mark: '#1d1914', glow: false },
  ichor: { color: '#7a4cff', mark: '#5a36c8', glow: true },
};

/** A few splat shapes in one canvas each: a core blob, satellite drops and a couple of streaks. */
function splatCanvas(seed, streak) {
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  c.fillStyle = '#fff';
  const blob = (x, y, r) => {
    c.beginPath();
    const k = 9 + Math.floor(rnd() * 5);
    for (let i = 0; i <= k; i++) {
      const a = (i / k) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5);
      i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  };
  blob(N / 2, N / 2, N * 0.2);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = N * (0.18 + rnd() * 0.28);
    blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, N * (0.015 + rnd() * 0.05));
  }
  if (streak) {
    // thrown in one direction (+x): a fan of streaks
    for (let i = 0; i < 5; i++) {
      const y = N / 2 + (rnd() - 0.5) * N * 0.3, len = N * (0.25 + rnd() * 0.2);
      c.beginPath(); c.moveTo(N / 2, y); c.lineTo(N / 2 + len, y + (rnd() - 0.5) * 10);
      c.lineWidth = 3 + rnd() * 5; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.stroke();
      blob(N / 2 + len, y, 3 + rnd() * 3);
    }
  }
  return cv;
}

/** The blood at the screen's edge: a ragged red band with drips, drawn for the left edge. */
export function edgeBlood(h = 512) {
  const w = Math.round(h * 0.42), cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  let s = 777;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(110,6,4,0.95)'); g.addColorStop(0.35, 'rgba(120,8,6,0.55)'); g.addColorStop(1, 'rgba(120,8,6,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(95,4,3,0.9)';
  for (let i = 0; i < 26; i++) {
    const y = rnd() * h, r = 8 + rnd() * 30, x = rnd() * w * 0.35;
    c.beginPath(); c.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 12; i++) {
    const x = rnd() * w * 0.5, y = rnd() * h * 0.6, len = 40 + rnd() * 160, wd = 3 + rnd() * 6;
    c.fillRect(x, y, wd, len);
    c.beginPath(); c.arc(x + wd / 2, y + len, wd * 0.9, 0, Math.PI * 2); c.fill();
  }
  return cv;
}

export function createGore(THREE, scene) {
  const group = new THREE.Group();
  scene.add(group);
  const textures = [0, 1, 2, 3].map((k) => { const t = new THREE.CanvasTexture(splatCanvas(k + 1, k >= 2)); t.anisotropy = 4; return t; });
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.userData.shared = true;
  const mats = new Map();
  /** One material per fluid and shape; lit, so blood darkens with the room; ichor glows. */
  const matFor = (fluid, k, forMark = false) => {
    const key = `${fluid}:${k}:${forMark}`;
    if (!mats.has(key)) {
      const F = FLUIDS[fluid] || FLUIDS.blood;
      const opts = { map: textures[k], color: new THREE.Color(forMark ? F.mark : F.color), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide };
      const m = F.glow ? new THREE.MeshBasicMaterial(opts) : new THREE.MeshLambertMaterial(opts);
      m.userData.shared = true;
      mats.set(key, m);
    }
    return mats.get(key);
  };
  const decals = [];
  const add = (mesh) => {
    group.add(mesh);
    decals.push(mesh);
    if (decals.length > MAX_DECALS) group.remove(decals.shift());
  };

  /** A splat on the floor at (x, z) metres, thrown toward `angle` (world radians, x/z plane). */
  function floor(fluid, x, z, size, angle, streak = false) {
    const m = new THREE.Mesh(plane, matFor(fluid, streak ? 2 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 2)));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = streak ? -angle : Math.random() * Math.PI * 2;
    m.position.set(x, 0.015 + decals.length * 0.00002, z);
    m.scale.set(size, size, 1);
    m.renderOrder = 1;
    add(m);
  }

  /** A splat on a wall at (x, y, z), facing back along -angle. */
  function wall(fluid, x, y, z, size, angle) {
    const m = new THREE.Mesh(plane, matFor(fluid, Math.floor(Math.random() * 4)));
    m.position.set(x, y, z);
    m.rotation.y = Math.PI / 2 - angle;
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.set(size, size, 1);
    m.renderOrder = 1;
    add(m);
  }

  /**
   * A mark on a body where it was hit, stuck to the nearest torso bone so it moves with the body (and
   * stays on the corpse). `fromAngle` is the world direction the shot came from.
   */
  function mark(actor, fluid, fromAngle, height = 1.0 + Math.random() * 0.5) {
    if (!actor || !actor.bones) return;
    actor.marks = actor.marks || [];
    if (actor.marks.length >= MAX_MARKS) { const old = actor.marks.shift(); old.parent?.remove(old); }
    const boneName = height > 1.5 ? 'Chest' : height > 1.15 ? 'Torso' : 'Abdomen';
    const i = actor.rig.findIndex((b) => b.name === boneName || b.name === 'Chest');
    const bone = i >= 0 ? actor.bones[i] : null;
    if (!bone) return;
    actor.root.updateWorldMatrix(true, true);
    const s = actor.scale || 1;
    const rad = 0.17 * s;
    const m = new THREE.Mesh(plane, matFor(fluid, Math.floor(Math.random() * 2), true));
    const base = actor.root.position;
    m.position.set(base.x + Math.cos(fromAngle) * rad, base.y + height * s, base.z + Math.sin(fromAngle) * rad);
    m.rotation.y = Math.PI / 2 - fromAngle;
    const sz = (0.12 + Math.random() * 0.12) * s;
    m.scale.set(sz, sz, 1);
    scene.add(m);
    m.updateWorldMatrix(true, false);
    bone.attach(m);
    actor.marks.push(m);
  }

  /** Wash a body clean (a dressing). */
  function clean(actor) {
    for (const m of actor?.marks || []) m.parent?.remove(m);
    if (actor) actor.marks = [];
  }

  function clear() {
    for (const d of decals) group.remove(d);
    decals.length = 0;
  }

  return { floor, wall, mark, clean, clear };
}
