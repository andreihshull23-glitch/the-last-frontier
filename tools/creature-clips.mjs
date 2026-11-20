// Writes walk, attack and death clips for the Hollow's creatures into assets/people-alien.json.
// The kit ships them with an idle only. Each clip is built from the idle's first frame (or the rest
// pose) with rotations layered on per bone: a ripple down the spine, strides on the claws, a coil and
// strike, a curl and collapse. Run after tools/bake-characters.mjs; it replaces its own clips if present.
//   node tools/creature-clips.mjs [assets/people-alien.json]
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'assets/people-alien.json';
const j = JSON.parse(readFileSync(path, 'utf8'));
const FPS = 15;

// quaternions as [x, y, z, w]
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const axisAngle = (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };
const euler = (x, z) => mul(axisAngle([1, 0, 0], x), axisAngle([0, 0, 1], z));   // bend about a bone's local X, then sway about Z

/** Base pose of every bone: the idle's first frame where it has one, else rest. */
function basePose(rig, idle) {
  const pose = rig.map((b) => ({ t: [...b.t], r: [...b.r] }));
  for (const tr of idle?.tracks || []) {
    if (tr.p === 'r') pose[tr.b].r = tr.v.slice(0, 4);
    else pose[tr.b].t = tr.v.slice(0, 3);
  }
  return pose;
}

/** Build a clip: `fn(name, u)` returns [bendX, swayZ] in radians for a bone at phase u (0..1), or null. */
function makeClip(rig, idle, dur, fn, extraT = null) {
  const base = basePose(rig, idle);
  const frames = Math.max(2, Math.round(dur * FPS) + 1);
  const tracks = [];
  rig.forEach((b, i) => {
    const v = [];
    let moving = false;
    for (let f = 0; f < frames; f++) {
      const u = f / (frames - 1);
      const off = fn(b.name, u, i);
      const q = off ? mul(base[i].r, euler(off[0], off[1])) : base[i].r;
      if (off && (Math.abs(off[0]) > 1e-4 || Math.abs(off[1]) > 1e-4)) moving = true;
      v.push(...q.map((x) => +x.toFixed(4)));
    }
    tracks.push({ b: i, p: 'r', v: moving ? v : v.slice(0, 4) });
    if (extraT) {
      const tv = [];
      for (let f = 0; f < frames; f++) {
        const d = extraT(b.name, f / (frames - 1), i);
        const t = d ? base[i].t.map((x, k) => x + d[k]) : base[i].t;
        tv.push(...t.map((x) => +x.toFixed(4)));
      }
      if (tv.some((x, k) => Math.abs(x - tv[k % 3]) > 1e-4)) tracks.push({ b: i, p: 't', v: tv });
    }
  });
  return { dur, frames, tracks };
}

const TAU = Math.PI * 2;
const spineIndex = (name) => { const m = /^Spine_(\d)/.exec(name); return m ? +m[1] : -1; };

function clipsFor(rig, idle, legged) {
  const out = {};
  // walk: the spine ripples, legs stride in alternating pairs
  out.Walk = makeClip(rig, idle, legged ? 0.8 : 1.4, (name, u) => {
    const s = spineIndex(name);
    if (s >= 0) return [Math.sin(TAU * u - s * 0.8) * (legged ? 0.06 : 0.12), Math.sin(TAU * u - s * 0.6) * (legged ? 0.12 : 0.08)];
    const claw = /^Claw(Big2?|Small2?)_(\d)\.(L|R)/.exec(name);
    if (claw) {
      const pair = (claw[1].endsWith('2') ? 1 : 0) ^ (claw[3] === 'L' ? 1 : 0);
      const ph = TAU * u + pair * Math.PI;
      const big = claw[1].startsWith('Big');
      if (claw[2] === '1') return [Math.max(0, Math.sin(ph)) * (big ? 0.5 : 0.25), Math.cos(ph) * (big ? 0.45 : 0.3)];
      return [Math.sin(ph) * 0.25, 0];
    }
    if (name === 'Head' || name === 'Neck') return [Math.sin(TAU * u * 2) * 0.05, Math.sin(TAU * u) * 0.08];
    return null;
  });
  // attack: coil back for the first 40%, strike through, recover
  const strike = (u) => (u < 0.4 ? -Math.sin((u / 0.4) * Math.PI / 2) : u < 0.6 ? -1 + 2.4 * ((u - 0.4) / 0.2) : 1.4 * (1 - (u - 0.6) / 0.4));
  out.Attack = makeClip(rig, idle, 0.7, (name, u) => {
    const s = spineIndex(name), k = strike(u);
    if (s >= 0) return [k * 0.16 * (s / 6 + 0.4), 0];
    const claw = /^Claw(Big2?|Small2?)_(\d)/.exec(name);
    if (claw && claw[2] === '1') return [-k * 0.5, 0];
    if (claw) return [k * 0.4, 0];
    if (name === 'Head' || /^Eye/.test(name)) return [k * 0.25, 0];
    return null;
  });
  // death: everything curls in and twists over
  out.Death = makeClip(rig, idle, 1.1, (name, u) => {
    const e = 1 - (1 - Math.min(1, u * 1.3)) ** 3;
    const s = spineIndex(name);
    if (s >= 0) return [e * 0.32, e * 0.12 * Math.sin(s)];
    const claw = /^Claw(Big2?|Small2?)_(\d)/.exec(name);
    if (claw) return [e * 0.9, 0];
    if (name === 'Head' || name === 'Neck') return [e * 0.5, e * 0.3];
    return null;
  });
  return out;
}

j.clips = { Alien_Idle: j.clips.Alien_Idle, ...clipsFor(j.rig, j.clips.Alien_Idle, true) };
for (const [model, rig] of Object.entries(j.rigs || {})) {
  const set = j.clipsets[model];
  j.clipsets[model] = { Alien_Idle: set.Alien_Idle, ...clipsFor(rig, set.Alien_Idle, false) };
}
writeFileSync(path, JSON.stringify(j));
console.log('creature clips:', Object.keys(j.clips).join(', '), '| per-rig:', Object.keys(j.clipsets || {}).join(', '));
