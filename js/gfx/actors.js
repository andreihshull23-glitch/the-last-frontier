// Characters: Quaternius people, robots and zombies on their own skeletons,
// playing the animations that ship with each pack. Hats, masks and badges are
// built in code and ride the head bone; guns ride the right hand.
import { MODEL_BOX } from '../data/models.js';
import { Merger, colorAttribute, remap, multiply, chain } from './assets.js';

const T = () => window.THREE;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dark = (c, k = 0.72) => c.map((v) => v * k);

// which of a family's clips plays each part. [name, fraction] freezes a clip at that point.
const HUMAN = {
  idle: 'Idle', walk: 'Walk', run: 'Run', aim: 'Idle_Gun_Pointing', shoot: 'Idle_Gun_Shoot', runAim: 'Run_Shoot',
  back: 'Run_Back', left: 'Run_Left', right: 'Run_Right', roll: 'Roll', death: 'Death', hit: 'HitRecieve',
  interact: 'Interact', punch: 'Punch_Right', wave: 'Wave', hand: 'Wrist.R',
};
// The cyberpunk kit: the runner shares the human clip names; each machine chassis has its own short set.
const MACHINE = { idle: 'Idle', walk: 'Walk', run: 'Run', aim: ['Shoot', 0.15], shoot: 'Shoot', death: 'Death', punch: 'Attack', hand: null };
const MODEL_CLIPS = {
  Character: { ...HUMAN, idle: 'Idle_Neutral', hand: 'Hand.R' },
  Enemy_Flying: { ...MACHINE, death: 'Dead' }, Enemy_Flying_Gun: { ...MACHINE, death: 'Dead' },
};
const FAMILY = {
  // the Hollow's creatures: one idle clip each; walking, striking and dying are done by hand (see update)
  alien: { idle: 'Alien_Idle', walk: 'Walk', run: 'Walk', aim: ['Attack', 0.2], shoot: 'Attack', punch: 'Attack', death: 'Death', hand: null },
  cyber: MACHINE,
  man: HUMAN,
  woman: HUMAN,
  robot: {
    idle: 'Idle', walk: 'Walk', run: 'Run', aim: ['Shoot', 0.12], shoot: 'Shoot', runAim: 'Run_Holding', death: 'Death', hit: 'HitRecieve_1',
    interact: 'Pickup', punch: 'Punch', wave: 'Hello', hand: 'LowerArm.R',
  },
  toon: {
    idle: 'Idle', walk: 'Walk', run: 'Run', aim: ['Shoot_OneHanded', 0.3], shoot: 'Shoot_OneHanded', roll: 'Roll', death: 'Death', hit: 'RecieveHit',
    interact: 'PickUp', punch: 'Punch', wave: 'Victory', sit: ['SitDown', 1], hand: 'Fist.R',
  },
};

// ---- looks -----------------------------------------------------------------
const cowboy = (c, band = '#2e241c') => ({ type: 'cowboy', c, band });
// Only models that suit a sci-fi western are used: adventurers, farmers, cowboys, old-west townsfolk,
// company troopers in armour and space suits, robots, and the Hollow's dead. Clothes are recoloured for variety.
// Space cowboys: one set of realistic bodies, dressed with modelled hats from the western kit and
// recoloured clothes. Machines are the Meridian Company's; the Hollow's dead are the same people, gone grey.
const hat = (model, c = null) => ({ type: 'model', model: 'west/hat-' + model, c });
export const LOOKS = {
  // the Rust Saints: gangers in dark leathers with one loud colour each
  bandit: { fam: 'man', model: 'Adventurer', tint: 'cloth_black', gun: 'qg/Shotgun_SawedOff' },
  gunman: { fam: 'woman', model: 'SciFi', tint: 'cloth_red', gun: 'qg/Revolver_3' },
  dynamiter: { fam: 'man', model: 'Adventurer', tint: 'cloth_pink' },
  brute: { fam: 'man', model: 'Swat', tint: 'saint', scale: 1.34 },
  bounty: { fam: 'woman', model: 'Soldier', tint: 'cloth_black', gun: 'qg/Revolver_5', scale: 1.06 },
  // Meridian: the machines WARDEN took, and the shells and troopers it still pays
  guard: { fam: 'cyber', model: 'Enemy_2Legs_Gun', tint: 'meridian' },
  scout: { fam: 'cyber', model: 'Enemy_Flying_Gun', tint: 'meridian', scale: 0.9 },
  enforcer: { fam: 'cyber', model: 'Character', tint: 'shell', gun: 'gun/blaster-h', scale: 1.18 },
  crusher: { fam: 'cyber', model: 'Enemy_Large', tint: 'meridian_heavy', scale: 0.6 },
  trooper: { fam: 'man', model: 'Spacesuit', tint: 'trooper', gun: 'gun/blaster-d' },
  overseer: { fam: 'cyber', model: 'Enemy_Large_Gun', tint: 'overseer', scale: 0.85 },
  foreman: { fam: 'robot', model: 'Mike', tint: 'iron', gun: 'qg/Shotgun_4', scale: 1.5 },
  warden: { fam: 'robot', model: 'Mike', tint: 'warden', gun: 'gun/blaster-e', scale: 1.6 },
  turret: { fam: 'cyber', model: 'Enemy_Flying', tint: 'turret', scale: 1.1 },
  // the Hollow: people from the intake list, still walking
  walker: { fam: 'man', model: 'Adventurer', tint: 'hollow_dead' },
  mite: { fam: 'alien', model: 'Alien_Scolitex', tint: 'hollow_mite' },
  seer: { fam: 'alien', model: 'Alien_Oculichrysalis', tint: 'hollow_seer', hover: 0.55 },
  gazer: { fam: 'alien', model: 'Alien_Cyclop', tint: 'hollow_gazer' },
  husk: { fam: 'woman', model: 'Adventurer', tint: 'husk_dead', scale: 0.86 },
  // Mercy Deck
  deputy: { fam: 'robot', model: 'Stan', gun: 'gun/blaster-n', scale: 0.86, tint: 'deputy' },
  grunt: { fam: 'robot', model: 'Stan', gun: 'gun/blaster-c', scale: 1.02, tint: 'grunt' },
  keeper_store: { fam: 'woman', model: 'Adventurer', tint: 'cloth_blue' },
  keeper_gunsmith: { fam: 'woman', model: 'SciFi', tint: 'cloth_rust' },
  keeper_outfitter: { fam: 'woman', model: 'SciFi', tint: 'cloth_violet' },
  keeper_clinic: { fam: 'man', model: 'Adventurer', tint: 'cloth_white' },
  keeper_telegraph: { fam: 'robot', model: 'George', tint: 'brass', scale: 0.85 },
  keeper_saloon: { fam: 'woman', model: 'Adventurer', tint: 'cloth_pink' },
  keeper_stable: { fam: 'man', model: 'Spacesuit', tint: 'cloth_teal' },
  clerk: { fam: 'man', model: 'Adventurer', tint: 'cloth_teal' },
  marshal: { fam: 'woman', model: 'Soldier', tint: 'cloth_rust' },
  rider: { fam: 'woman', model: 'Soldier', tint: 'cloth_violet' },
  agent: { fam: 'cyber', model: 'Character', tint: 'suit' },
  undertaker: { fam: 'woman', model: 'Adventurer', tint: 'cloth_black' },
  townsman: { fam: 'man', model: 'Adventurer', tint: 'cloth_violet' },
  townswoman: { fam: 'woman', model: 'Adventurer', tint: 'cloth_teal' },
  towns2: { fam: 'man', model: 'Spacesuit', tint: 'cloth_green' },
  towns3: { fam: 'woman', model: 'SciFi', tint: 'cloth_pink' },
  towns5: { fam: 'woman', model: 'Soldier', tint: 'cloth_teal' },
  towns6: { fam: 'man', model: 'Adventurer', tint: 'cloth_blue' },
  towns7: { fam: 'woman', model: 'Adventurer', tint: 'cloth_rust' },
};
// One runner. The index is kept for old saves; everybody is Rook now.
const DRIFTER_BODIES = [['man', 'Swat', null, null]];
export function drifterLook(index, gear = [], plugin = null) {
  const n = DRIFTER_BODIES.length;
  const i = ((index % n) + n) % n;
  const [fam, model, tint, h] = DRIFTER_BODIES[i];
  return { fam, model, tint, hat: h ? hat(h) : null, plugin, key: 'drifter' + i + (plugin ? '|' + plugin : '') };
}

function registerCharacterTints(assets) {
  const R = (name, fn) => assets.registerTint(name, fn);
  R('outlaw', multiply(0.8, 0.72, 0.72));
  R('brute', remap([{ sat: [0.25, 1], lit: [0.2, 0.75], hue: [0.4, 0.8], h: 0.0, s: 0.5, lMul: 0.8 }]));
  R('hollowskin', remap([{ hue: [0.15, 0.5], h: 0.74, s: 0.2, lMul: 1.1 }, { sat: [0, 1], sMul: 0.6, lMul: 0.75 }]));
  R('husk', remap([{ hue: [0.15, 0.5], h: 0.1, s: 0.14, lMul: 1.3 }, { sat: [0, 1], sMul: 0.4, lMul: 0.6 }]));
  R('iron', chain(remap([{ sat: [0.3, 1], h: 0.02, s: 0.7, lMul: 0.8 }]), multiply(0.62, 0.6, 0.62)));
  R('deputy', remap([{ sat: [0.3, 1], hue: [0.9, 0.1], h: 0.11, s: 0.75, lMul: 1.05 }]));
  R('grunt', chain(remap([{ sat: [0.3, 1], h: 0.55, s: 0.45, lMul: 0.9 }]), multiply(0.78, 0.82, 0.9)));   // Meridian's grey-blue, TIN's frame
  R('brass', remap([{ sat: [0.15, 1], hue: [0.25, 0.55], h: 0.1, s: 0.55, lMul: 0.95 }]));
  // clothes only: greens and blues are cloth on these models, while skin, leather and hair sit in the oranges
  const cloth = (h, sat, lMul = 1) => remap([{ hue: [0.125, 0.78], sat: [0.12, 1], h, s: sat, lMul }]);
  R('cloth_black', remap([{ hue: [0.125, 0.78], sat: [0.12, 1], s: 0.06, lMul: 0.6 }]));
  R('cloth_red', cloth(0.01, 0.55, 0.95));
  R('cloth_blue', cloth(0.6, 0.4, 1.0));
  R('cloth_green', cloth(0.3, 0.35, 0.95));
  R('cloth_rust', cloth(0.06, 0.6, 1.0));
  R('saint', remap([{ sat: [0, 1], lit: [0, 0.45], h: 0.03, s: 0.55, lMul: 0.9 }]));
  R('cloth_violet', cloth(0.75, 0.5, 1.0));
  R('cloth_teal', cloth(0.5, 0.55, 0.95));
  R('cloth_pink', cloth(0.9, 0.65, 1.05));
  R('trooper', chain(remap([{ hue: [0.125, 0.78], sat: [0.12, 1], h: 0.0, s: 0.5, lMul: 0.6 }]), multiply(0.6, 0.6, 0.66)));
  // the kit's machines ship white and orange: Meridian paints them gunmetal with a red eye
  R('meridian', remap([{ sat: [0, 0.3], h: 0.63, s: 0.14, lMul: 0.52 }, { sat: [0.3, 1], h: 0.0, s: 0.85, lMul: 1.0 }]));
  R('meridian_heavy', remap([{ sat: [0, 0.3], h: 0.08, s: 0.2, lMul: 0.5 }, { sat: [0.3, 1], h: 0.09, s: 0.9, lMul: 1.0 }]));
  R('shell', remap([{ sat: [0, 0.3], h: 0.6, s: 0.1, lMul: 0.95 }, { sat: [0.3, 1], h: 0.0, s: 0.8, lMul: 0.95 }]));
  R('suit', remap([{ sat: [0, 0.3], h: 0.6, s: 0.06, lMul: 1.15 }, { sat: [0.3, 1], h: 0.58, s: 0.5, lMul: 1.0 }]));
  R('crusher', chain(remap([{ sat: [0.3, 1], h: 0.09, s: 0.8, lMul: 1.0 }]), multiply(0.85, 0.82, 0.8)));
  R('overseer', remap([{ sat: [0, 0.3], h: 0.76, s: 0.2, lMul: 0.42 }, { sat: [0.3, 1], h: 0.82, s: 0.85, lMul: 1.0 }]));
  R('warden', chain(remap([{ sat: [0.3, 1], h: 0.52, s: 0.75, lMul: 0.95 }]), multiply(0.5, 0.62, 0.78)));
  R('turret', remap([{ sat: [0, 0.3], h: 0.6, s: 0.1, lMul: 0.45 }, { sat: [0.3, 1], h: 0.03, s: 0.9, lMul: 1.0 }]));
  R('cloth_white', remap([{ hue: [0.125, 0.78], sat: [0.12, 1], s: 0.08, lMul: 1.7 }]));
  // the dead: everything drained toward grey-violet, skin included
  R('hollow_dead', chain(remap([{ sat: [0, 1], h: 0.72, s: 0.16, lMul: 0.82 }]), multiply(0.86, 0.9, 1.0)));
  R('husk_dead', chain(remap([{ sat: [0, 1], h: 0.1, s: 0.1, lMul: 0.95 }]), multiply(0.9, 0.9, 0.86)));
  // the Hollow's creatures, pulled toward its violet; the eyes are left to glow in update
  R('hollow_mite', remap([{ sat: [0.3, 1], hue: [0.0, 0.2], h: 0.8, s: 0.4, lMul: 0.5 }, { sat: [0.3, 1], hue: [0.3, 0.6], h: 0.86, s: 0.45, lMul: 0.75 }]));
  R('hollow_seer', remap([{ sat: [0.3, 1], hue: [0.0, 0.2], h: 0.76, s: 0.35, lMul: 0.7 }]));
  R('hollow_gazer', remap([{ sat: [0.3, 1], hue: [0.5, 0.7], h: 0.72, s: 0.35, lMul: 0.7 }]));
  R('ghost', chain(remap([{ sat: [0, 1], h: 0.54, s: 0.45, lMul: 1.2 }]), multiply(0.8, 1, 1.1)));
}

// ---- the factory -----------------------------------------------------------
export function createActors(assets) {
  const THREE = T();
  const geoCache = new Map();
  const gunGeo = new Map();
  const restCache = new Map();
  registerCharacterTints(assets);
  const m4 = new THREE.Matrix4(), recoilT = new THREE.Matrix4(), v3 = new THREE.Vector3(), n3 = new THREE.Vector3();

  /** Rest-pose matrix (bone world x inverse bind) of every bone: bind space -> character space. */
  const rigOf = (look) => { const j = assets.people.get(look.fam).json; return j.rigs?.[look.model] || j.rig; };
  const clipsOf = (look) => { const j = assets.people.get(look.fam).json; return j.clipsets?.[look.model] || j.clips; };
  function restMatrices(look) {
    const fam = look.fam + '/' + look.model;
    if (restCache.has(fam)) return restCache.get(fam);
    const rig = rigOf(look);
    const world = [];
    const loc = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    rig.forEach((b, i) => {
      loc.compose(p.fromArray(b.t), q.fromArray(b.r), s.fromArray(b.s));
      const w = new THREE.Matrix4();
      if (b.parent >= 0) w.multiplyMatrices(world[b.parent], loc);
      else if (b.pre) w.multiplyMatrices(new THREE.Matrix4().fromArray(b.pre), loc);
      else w.copy(loc);
      world.push(w);
    });
    const out = rig.map((b, i) => new THREE.Matrix4().multiplyMatrices(world[i], new THREE.Matrix4().fromArray(b.inv)));
    restCache.set(fam, out);
    return out;
  }

  function buildGeometry(look, ghost) {
    const pk = assets.people.get(look.fam);
    const m = pk.json.models[look.model];
    if (!m) throw new Error('Unknown character ' + look.fam + '/' + look.model);
    const rig = rigOf(look);
    const head = rig.findIndex((b) => b.name === 'Head');
    const M = restMatrices(look);
    const n0 = m.vc;
    const tint = ghost ? assets.tint('ghost') : look.tint ? assets.tint(look.tint) : null;
    // extras are modelled in metres around the head, then carried back into the head's bind space
    const acc = new Merger(assets);
    const sc = m.scale;
    let hx0 = 1e9, hx1 = -1e9, hy0 = 1e9, hy1 = -1e9, hz1 = -1e9, hz0 = 1e9;
    for (let i = 0; i < n0; i++) {
      if (pk.skin[(m.vo + i) * 3] !== head || pk.skin[(m.vo + i) * 3 + 2] < 200) continue;
      v3.set(pk.pos[(m.vo + i) * 3] / m.q, pk.pos[(m.vo + i) * 3 + 1] / m.q, pk.pos[(m.vo + i) * 3 + 2] / m.q).applyMatrix4(M[head]);
      const x = v3.x * sc, y = (v3.y - m.base) * sc, z = v3.z * sc;
      hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y); hz0 = Math.min(hz0, z); hz1 = Math.max(hz1, z);
    }
    const cx = (hx0 + hx1) / 2, hw = Math.min((hx1 - hx0) / 2, 0.19 * (look.fam === 'toon' ? 2 : 1)), cz = (hz0 + hz1) / 2, top = hy1, hh = hy1 - hy0;
    if (look.hat && look.hat.type === 'model') {
      const box = MODEL_BOX[look.hat.model];
      // the kit's hats are a little small for these heads: fit the crown to the skull
      const sc = (hw * 2.25) / (box[3] - box[0]) * 1.9;
      acc.add(look.hat.model, cx, top - hh * 0.3 - box[1] * sc, cz, 0, sc);
    } else if (look.hat) {
      const c = hex(look.hat.c), y = top - hh * 0.2;
      if (look.hat.type === 'cowboy') {
        acc.addCyl(cx, y, cz, hw * 1.9, 0.02, hw * 2.0, c, dark(c, 0.8), 12);
        acc.addCyl(cx, y + 0.02, cz, hw * 1.08, 0.035, hw * 1.08, hex(look.hat.band || '#2e241c'), null, 10);
        acc.addCyl(cx, y + 0.055, cz, hw * 1.05, hw * 0.75, hw * 0.85, c, dark(c, 0.85), 10);
      } else {
        const tall = look.hat.type === 'top' ? 1.25 : 0.72;
        acc.addCyl(cx, y, cz, hw * 1.45, 0.02, hw * 1.5, c, null, 12);
        acc.addCyl(cx, y + 0.02, cz, hw * 1.02, hw * tall, hw * (look.hat.type === 'top' ? 1.0 : 0.8), c, dark(c, 0.85), 10);
      }
    }
    const na = acc.n, n = n0 + na;
    const pos = new Float32Array(n * 3), nrm = new Int8Array(n * 3), col = new Uint8Array(n * 4);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const memo = new Map();
    for (let i = 0; i < n0; i++) {
      const o = (m.vo + i) * 3, c4 = (m.vo + i) * 4;
      pos[i * 3] = pk.pos[o] / m.q; pos[i * 3 + 1] = pk.pos[o + 1] / m.q; pos[i * 3 + 2] = pk.pos[o + 2] / m.q;
      nrm[i * 3] = pk.nrm[o]; nrm[i * 3 + 1] = pk.nrm[o + 1]; nrm[i * 3 + 2] = pk.nrm[o + 2];
      let r = pk.col[c4], g = pk.col[c4 + 1], b = pk.col[c4 + 2];
      if (tint) {
        const k = (r << 16) | (g << 8) | b;
        let t = memo.get(k);
        if (!t) { t = tint(r, g, b); memo.set(k, t); }
        [r, g, b] = t;
      }
      col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = 255;
      const w = pk.skin[o + 2] / 255;
      si[i * 4] = pk.skin[o]; si[i * 4 + 1] = pk.skin[o + 1]; sw[i * 4] = w; sw[i * 4 + 1] = 1 - w;
    }
    if (na) {
      const inv = m4.copy(M[head]).invert();
      for (let i = 0; i < na; i++) {
        v3.set(acc.pos[i * 3] / sc, acc.pos[i * 3 + 1] / sc + m.base, acc.pos[i * 3 + 2] / sc).applyMatrix4(inv);
        n3.set(acc.nrm[i * 3], acc.nrm[i * 3 + 1], acc.nrm[i * 3 + 2]).transformDirection(inv);
        const k = n0 + i;
        pos[k * 3] = v3.x; pos[k * 3 + 1] = v3.y; pos[k * 3 + 2] = v3.z;
        nrm[k * 3] = n3.x * 127; nrm[k * 3 + 1] = n3.y * 127; nrm[k * 3 + 2] = n3.z * 127;
        col[k * 4] = acc.col[i * 4]; col[k * 4 + 1] = acc.col[i * 4 + 1]; col[k * 4 + 2] = acc.col[i * 4 + 2]; col[k * 4 + 3] = 255;
        si[k * 4] = head; sw[k * 4] = 1;
      }
    }
    const idx = new Uint32Array(m.ic + acc.ni);
    idx.set(pk.idx.subarray(m.io, m.io + m.ic));
    for (let i = 0; i < acc.ni; i++) idx[m.ic + i] = acc.idx[i] + n0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    g.setAttribute('color', colorAttribute(col));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? idx : new Uint16Array(idx), 1));
    return g;
  }

  function geometryFor(look, ghost) {
    const key = (look.key || JSON.stringify(look)) + (ghost ? '|ghost' : '');
    let g = geoCache.get(key);
    if (!g) { g = buildGeometry(look, ghost); geoCache.set(key, g); }
    return g;
  }

  function clipOf(a, part) {
    const spec = a.map[part];
    if (!spec) return null;
    const name = Array.isArray(spec) ? spec[0] : spec;
    const clip = a.clips[name];
    return clip ? { clip, hold: Array.isArray(spec) ? spec[1] : null } : null;
  }

  /** Write a clip at time t into the pose buffer (rest pose first). */
  function sample(a, clip, t, loop, out) {
    out.set(a.rest);
    if (!clip) return;
    const f = clip.frames - 1;
    let u = clip.dur > 0 ? t / clip.dur : 0;
    u = loop ? u - Math.floor(u) : Math.min(1, Math.max(0, u));
    const x = u * f, i0 = Math.min(f, Math.floor(x)), i1 = Math.min(f, i0 + 1), k = x - i0;
    for (const tr of clip.tracks) {
      const w = tr.p === 't' ? 3 : 4, v = tr.v, o = tr.b * 7 + (w === 3 ? 0 : 3);
      if (v.length === w) { for (let i = 0; i < w; i++) out[o + i] = v[i]; continue; }
      const p0 = i0 * w, p1 = i1 * w;
      if (w === 3) for (let i = 0; i < 3; i++) out[o + i] = v[p0 + i] + (v[p1 + i] - v[p0 + i]) * k;
      else {
        const s = v[p0] * v[p1] + v[p0 + 1] * v[p1 + 1] + v[p0 + 2] * v[p1 + 2] + v[p0 + 3] * v[p1 + 3] < 0 ? -1 : 1;
        let l = 0;
        for (let i = 0; i < 4; i++) { const q = v[p0 + i] + (v[p1 + i] * s - v[p0 + i]) * k; out[o + i] = q; l += q * q; }
        l = Math.sqrt(l) || 1;
        for (let i = 0; i < 4; i++) out[o + i] /= l;
      }
    }
  }

  function applyPose(a, pose) {
    for (let b = 0; b < a.bones.length; b++) {
      const o = b * 7, bn = a.bones[b];
      bn.position.set(pose[o], pose[o + 1], pose[o + 2]);
      bn.quaternion.set(pose[o + 3], pose[o + 4], pose[o + 5], pose[o + 6]);
    }
  }

  /** A figure in the scene. `look` is an entry of LOOKS or a drifterLook(). */
  function make(look, opts = {}) {
    const pk = assets.people.get(look.fam);
    const model = pk.json.models[look.model];
    const rig = rigOf(look);
    const root = new THREE.Group();          // position + facing
    const inner = new THREE.Group();         // size
    const scale = model.scale * (look.scale || 1);
    inner.scale.setScalar(scale);
    inner.position.y = -model.base * scale;
    root.add(inner);
    const bones = rig.map((b) => { const bn = new THREE.Bone(); bn.name = b.name; bn.position.fromArray(b.t); bn.quaternion.fromArray(b.r); bn.scale.fromArray(b.s); return bn; });
    rig.forEach((b, i) => {
      if (b.parent >= 0) bones[b.parent].add(bones[i]);
      else if (b.pre) { const h = new THREE.Group(); h.matrixAutoUpdate = false; h.matrix.fromArray(b.pre); inner.add(h); h.add(bones[i]); }
      else inner.add(bones[i]);
    });
    const material = opts.ghost
      ? assets.makeMaterial({ skinning: true, transparent: true, opacity: 0.42, depthWrite: false, emissive: new THREE.Color(0.1, 0.3, 0.45) })
      : assets.makeMaterial({ skinning: true }, true);
    const mesh = new THREE.SkinnedMesh(geometryFor(look, opts.ghost), material);
    mesh.castShadow = !opts.ghost;
    mesh.frustumCulled = false;
    inner.add(mesh);
    mesh.bind(new THREE.Skeleton(bones, rig.map((b) => new THREE.Matrix4().fromArray(b.inv))), new THREE.Matrix4());
    const rest = new Float32Array(rig.length * 7);
    rig.forEach((b, i) => { rest.set(b.t, i * 7); rest.set(b.r, i * 7 + 3); });
    const clips = clipsOf(look);
    const map = {};
    for (const [k, v] of Object.entries(MODEL_CLIPS[look.model] || FAMILY[look.fam])) if (k === 'hand' || clips[Array.isArray(v) ? v[0] : v]) map[k] = v;
    const handIdx = rig.findIndex((b) => b.name === map.hand);
    const armIdx = rig.map((b, i) => (/Shoulder|UpperArm|LowerArm|Wrist|Palm|Fist|Hand/.test(b.name) ? i : -1)).filter((i) => i >= 0);
    const a = {
      root, inner, bones, mesh, material, look, scale: look.scale || 1, rig, rest, map, clips,
      hand: handIdx >= 0 ? bones[handIdx] : null, armIdx, aimPose: null, gunBase: null,
      pose: new Float32Array(rest), from: new Float32Array(rest), target: new Float32Array(rest),
      part: 'idle', t: Math.random() * 2, fade: 1,
      gun: null, gunKind: null, speed: 0, shootT: 9, meleeT: 9, oneShot: null, oneT: 0,
      dead: false, deadT: 0, roll: 0, flash: 0, face: undefined,
    };
    if (look.plugin && !opts.ghost) addPlugin(a, look.plugin);
    if (look.gun) setGun(a, look.gun);
    return a;
  }

  // Guns held in one hand. Everything longer is shouldered and steadied with the left hand.
  const ONE_HAND = /^(qg\/(Revolver|Pistol)|gun\/blaster-[bikow])/;
  const twoHanded = (kind) => !ONE_HAND.test(kind);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vd = new THREE.Vector3(), ve = new THREE.Vector3();
  /** Turn a bone by a rotation given in world space. */
  function rotateWorld(bone, q) {
    bone.getWorldQuaternion(qa);
    bone.parent.getWorldQuaternion(qb);
    bone.quaternion.copy(qb.invert().multiply(q.clone().multiply(qa)));
    bone.updateMatrixWorld(true);
  }
  /**
   * Two-bone reach: bend upper and lower so that `end` lands on `target`, the elbow bending toward
   * `pole`. All positions are in the figure's space (the figure stands at the origin).
   */
  function reach(upper, lower, end, target, pole) {
    const A = upper.getWorldPosition(new THREE.Vector3()), B = lower.getWorldPosition(new THREE.Vector3()), C = end.getWorldPosition(new THREE.Vector3());
    const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
    const toT = vd.copy(target).sub(A);
    const d = Math.min(toT.length(), (l1 + l2) * 0.999), dir = toT.normalize();
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const u = ve.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = A.clone().addScaledVector(dir, l1 * cosA).addScaledVector(u, l1 * Math.sqrt(1 - cosA * cosA));
    rotateWorld(upper, qc.setFromUnitVectors(va.copy(B).sub(A).normalize(), vb.copy(elbow).sub(A).normalize()));
    const B2 = lower.getWorldPosition(new THREE.Vector3()), C2 = end.getWorldPosition(new THREE.Vector3());
    const goal = A.clone().addScaledVector(dir, d);
    rotateWorld(lower, qc.setFromUnitVectors(va.copy(C2).sub(B2).normalize(), vb.copy(goal).sub(B2).normalize()));
  }
  const boneOf = (a, name) => { const i = a.rig.findIndex((b) => b.name === name); return i >= 0 ? a.bones[i] : null; };
  /** Shoulder the gun: both arms reach for it. Returns false when this rig has no left arm to use. */
  function shoulder(a, kind) {
    const fam = a.look.fam;
    if (fam !== 'man' && fam !== 'woman' && !(fam === 'cyber' && a.look.model === 'Character')) return false;
    const uR = boneOf(a, 'UpperArm.R'), lR = boneOf(a, 'LowerArm.R'), uL = boneOf(a, 'UpperArm.L'), lL = boneOf(a, 'LowerArm.L');
    const eL = boneOf(a, 'Wrist.L') || boneOf(a, 'Hand.L');
    if (!uR || !lR || !uL || !lL || !eL) return false;
    const sR = uR.getWorldPosition(new THREE.Vector3()), sL = uL.getWorldPosition(new THREE.Vector3());
    const span = sR.distanceTo(sL), side = Math.sign(sR.x - sL.x) || -1, s = a.scale;
    // the grip sits in front of the right shoulder, a little in toward the chest and below it
    const grip = new THREE.Vector3(sR.x - side * span * 0.3, sR.y - 0.1 * s, sR.z + 0.2 * s);
    reach(uR, lR, a.hand, grip, new THREE.Vector3(side * 0.7, -1, -0.2));
    const blaster = kind.startsWith('gun/');
    const box = blaster ? MODEL_BOX[kind] : assets.raw(kind).bb;
    const sz = blaster ? 0.66 : 1;
    const front = Math.max(0.12, box[5] * sz * s);
    // the support hand goes as far up the gun as this arm will reach
    const armLen = uL.getWorldPosition(va).distanceTo(lL.getWorldPosition(vb)) + lL.getWorldPosition(vb).distanceTo(eL.getWorldPosition(vc));
    const fore = new THREE.Vector3(grip.x, grip.y + (blaster ? 0.02 : 0.0) * s, grip.z);
    for (let t = Math.min(0.42 * s, front * 0.62); t >= 0.08 * s; t -= 0.01 * s) {
      fore.z = grip.z + t;
      if (fore.distanceTo(sL) <= armLen * 0.97) break;
    }
    reach(uL, lL, eL, fore, new THREE.Vector3(-side * 0.6, -1, -0.3));
    return true;
  }
  /** Copy the arm bones' current rotations into a pose. */
  function readArms(a, pose) {
    for (const b of a.armIdx) { const q = a.bones[b].quaternion, o = b * 7 + 3; pose[o] = q.x; pose[o + 1] = q.y; pose[o + 2] = q.z; pose[o + 3] = q.w; }
  }

  // ---- plug-ins you can see ---------------------------------------------------
  // Each fitted plug-in shows as hardware on the body: lit parts drawn unshaded, plate drawn shaded.
  // Parts are laid out on the rest pose in the figure's own space (metres, facing +z, right hand at -x),
  // then parented to a bone so they move with it.
  const glowMat = new Map(), plateMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x2a2c38).convertSRGBToLinear() });
  const glowOf = (c) => { if (!glowMat.has(c)) glowMat.set(c, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).convertSRGBToLinear() })); return glowMat.get(c); };
  const UP = new THREE.Vector3(0, 1, 0);
  function partOn(a, boneName, geo, mat, at, q = null) {
    const bone = boneOf(a, boneName);
    if (!bone) return;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    const want = new THREE.Matrix4().compose(at, q || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    mesh.matrix.copy(bone.matrixWorld).invert().multiply(want);
    mesh.castShadow = mat === plateMat;
    bone.add(mesh);
    (a.parts = a.parts || []).push(mesh);
  }
  /** A bar laid along a limb, from t0 to t1 of the way between two bones, pushed out by `off`. */
  function along(a, from, to, t0, t1, w, mat, off = new THREE.Vector3()) {
    const A = boneOf(a, from), B = boneOf(a, to);
    if (!A || !B) return;
    const pa = A.getWorldPosition(new THREE.Vector3()), pb = B.getWorldPosition(new THREE.Vector3());
    const d = pb.clone().sub(pa), len = d.length() * (t1 - t0);
    const mid = pa.clone().addScaledVector(d, (t0 + t1) / 2).add(off);
    partOn(a, from, new THREE.BoxGeometry(w, len, w), mat, mid, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  }
  function ring(a, from, to, t, r, c) {
    const A = boneOf(a, from), B = boneOf(a, to);
    if (!A || !B) return;
    const pa = A.getWorldPosition(new THREE.Vector3()), pb = B.getWorldPosition(new THREE.Vector3());
    const d = pb.clone().sub(pa);
    partOn(a, from, new THREE.CylinderGeometry(r, r, 0.018, 12, 1, true), glowOf(c), pa.clone().addScaledVector(d, t), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  }
  function boxAt(a, boneName, ref, off, size, mat) {
    const R = boneOf(a, ref);
    if (!R) return;
    partOn(a, boneName, new THREE.BoxGeometry(size[0], size[1], size[2]), mat, R.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...off)));
  }
  const PLUGIN_PARTS = {
    backdoor(a) { // a data spine down the back of the neck, lit cyan
      boxAt(a, 'Neck', 'Neck', [0, 0.04, -0.075], [0.07, 0.1, 0.035], plateMat);
      boxAt(a, 'Neck', 'Neck', [0, 0.04, -0.095], [0.03, 0.08, 0.01], glowOf(0x3fe0ff));
      boxAt(a, 'Chest', 'Chest', [0, 0.12, -0.13], [0.05, 0.16, 0.03], glowOf(0x3fe0ff));
    },
    nighteyes(a) { // a visor across the eyes
      // over the helmet's own visor: a lit slit, and a lens unit at each temple
      boxAt(a, 'Head', 'Head', [0, 0.115, 0.17], [0.2, 0.022, 0.012], glowOf(0x3fe0ff));
      for (const x of [-0.13, 0.13]) boxAt(a, 'Head', 'Head', [x, 0.115, 0.1], [0.04, 0.06, 0.08], plateMat);
    },
    steady(a) { // a targeting eyepiece and its aerial
      boxAt(a, 'Head', 'Head', [-0.055, 0.115, 0.172], [0.05, 0.05, 0.012], glowOf(0xff3a3a));
      boxAt(a, 'Head', 'Head', [-0.135, 0.13, 0.04], [0.04, 0.08, 0.09], plateMat);
      boxAt(a, 'Head', 'Head', [-0.14, 0.21, 0.03], [0.012, 0.1, 0.012], glowOf(0xff3a3a));
    },
    fleet(a) { // servo struts down the backs of the calves
      for (const s of ['L', 'R']) {
        along(a, 'LowerLeg.' + s, 'Foot.' + s, 0.1, 0.85, 0.04, plateMat, new THREE.Vector3(0, 0, -0.07));
        along(a, 'LowerLeg.' + s, 'Foot.' + s, 0.15, 0.8, 0.016, glowOf(0xffb43f), new THREE.Vector3(0, 0, -0.095));
      }
    },
    leather(a) { // plates on the shoulders and chest, with lit seams
      for (const s of ['L', 'R']) {
        along(a, 'UpperArm.' + s, 'LowerArm.' + s, 0.05, 0.6, 0.15, plateMat);
        ring(a, 'UpperArm.' + s, 'LowerArm.' + s, 0.72, 0.075, 0x3fe0ff);
      }
      boxAt(a, 'Chest', 'Chest', [0, 0.06, 0.115], [0.22, 0.14, 0.03], plateMat);
      boxAt(a, 'Chest', 'Chest', [0, 0.06, 0.132], [0.18, 0.012, 0.006], glowOf(0x3fe0ff));
    },
    scavenger(a) { // a scanner on the left forearm
      along(a, 'LowerArm.L', 'Wrist.L', 0.3, 0.92, 0.13, plateMat);
      const A = boneOf(a, 'LowerArm.L'), B = boneOf(a, 'Wrist.L');
      if (A && B) { const pa = A.getWorldPosition(new THREE.Vector3()), pb = B.getWorldPosition(new THREE.Vector3()); partOn(a, 'LowerArm.L', new THREE.BoxGeometry(0.11, 0.014, 0.08), glowOf(0x5dff9a), pa.lerp(pb, 0.62).add(new THREE.Vector3(0, 0.068, 0))); }
    },
    loader(a) { // coils round the right forearm
      for (const t of [0.35, 0.55, 0.75]) ring(a, 'LowerArm.R', 'Wrist.R', t, 0.072, 0xff3fa4);
    },
    coolhead(a) { // a cooling pack on the back, piped to the neck
      boxAt(a, 'Chest', 'Chest', [0, 0.02, -0.13], [0.17, 0.2, 0.07], plateMat);
      for (const x of [-0.05, 0.05]) boxAt(a, 'Chest', 'Chest', [x, 0.02, -0.168], [0.02, 0.16, 0.008], glowOf(0x6fa8ff));
      boxAt(a, 'Neck', 'Neck', [0, 0.0, -0.08], [0.06, 0.08, 0.03], plateMat);
    },
    powder(a) { // charges racked across the chest
      for (const x of [-0.07, 0, 0.07]) {
        boxAt(a, 'Chest', 'Chest', [x, -0.04, 0.125], [0.045, 0.09, 0.04], plateMat);
        boxAt(a, 'Chest', 'Chest', [x, 0.01, 0.135], [0.03, 0.012, 0.03], glowOf(0xffb43f));
      }
    },
  };
  function addPlugin(a, id) {
    a.root.updateMatrixWorld(true);
    // every runner carries the jack the plug-ins go into
    boxAt(a, 'Neck', 'Neck', [0, 0.01, -0.075], [0.035, 0.035, 0.02], glowOf(0x3fe0ff));
    PLUGIN_PARTS[id]?.(a);
  }

  /** Put a gun in the right hand so that it points straight ahead in the aiming pose. */
  function setGun(a, kind) {
    if (a.gunKind === kind) return;
    if (a.gun) { a.hand.remove(a.gun); a.gun = null; }
    a.gunKind = kind;
    if (!kind || !a.hand) return;
    let g = gunGeo.get(kind);
    if (!g) { g = assets.geometry(kind); gunGeo.set(kind, g); }
    const mesh = new THREE.Mesh(g, assets.worldMaterial());
    mesh.castShadow = true;
    // pose the skeleton as if aiming, with the figure at the origin, and read where the hand ends up
    const keepPos = a.root.position.clone(), keepRot = a.root.rotation.y;
    a.root.position.set(0, 0, 0); a.root.rotation.y = 0;
    const aim = clipOf(a, 'aim') || clipOf(a, 'idle');
    sample(a, aim.clip, aim.hold !== null ? aim.hold * aim.clip.dur : 0, false, a.target);
    applyPose(a, a.target);
    a.root.updateMatrixWorld(true);
    a.twoHands = twoHanded(kind) && shoulder(a, kind);
    if (a.twoHands) { readArms(a, a.target); a.root.updateMatrixWorld(true); }
    const handW = a.hand.matrixWorld;
    const p = new THREE.Vector3().setFromMatrixPosition(handW);
    const s = a.scale;
    const blaster = kind.startsWith('gun/');
    const box = blaster ? MODEL_BOX[kind] : null;
    const sz = blaster ? (a.look.fam === 'robot' ? 0.95 : 0.66) : (a.look.fam === 'robot' ? 1.25 : 1); // blasters are oversized for people; machines have big hands
    const fwd = blaster ? (box[5] - box[2]) * 0.2 * sz : 0.07;
    const want = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y + (blaster ? 0.05 : 0.02) * s, p.z + fwd * s),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), blaster ? Math.PI : 0),
      new THREE.Vector3(s * sz, s * sz, s * sz));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(handW).invert().multiply(want);
    a.gunBase = mesh.matrix.clone();
    a.aimPose = new Float32Array(a.target);
    a.hand.add(mesh);
    a.gun = mesh;
    applyPose(a, a.pose);
    a.root.position.copy(keepPos); a.root.rotation.y = keepRot;
  }

  /**
   * Advance a figure's pose.
   * st: { speed (m/s), armed, moveAngle (sim radians, for strafing), facing, sit, reach }
   */
  function update(a, dt, st) {
    a.speed += ((st.speed || 0) - a.speed) * Math.min(1, dt * 10);
    a.shootT += dt; a.meleeT += dt;
    let part = 'idle', loop = true, rate = 1, time = null;
    if (a.dead) { part = 'death'; loop = false; a.deadT += dt; time = a.deadT; }
    else if (a.roll > 0 && a.map.roll) { a.roll = Math.max(0, a.roll - dt / 0.3); part = 'roll'; loop = false; time = (1 - a.roll) * (clipOf(a, 'roll')?.clip.dur ?? 1) * 0.8; }
    else if (a.oneShot && a.map[a.oneShot]) {
      a.oneT += dt; part = a.oneShot; loop = false; time = a.oneT;
      if (a.oneT >= (clipOf(a, part)?.clip.dur ?? 0)) a.oneShot = null;
    } else if (a.meleeT < (clipOf(a, 'punch')?.clip.dur ?? 0) * 0.8) { part = 'punch'; loop = false; time = a.meleeT * 1.3; }
    else if (st.sit && a.map.sit) { part = 'sit'; }
    else if (st.armed || st.reach) {
      if (a.speed > 0.7) {
        part = a.map.runAim ? 'runAim' : 'run';
        if (st.moveAngle !== undefined && a.map.left) {
          let d = (st.moveAngle - st.facing) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) > 2.3) part = 'back'; else if (d > 0.9) part = 'right'; else if (d < -0.9) part = 'left';
        }
        rate = Math.max(0.5, a.speed / 4.6);
      } else part = st.reach && !a.gun ? 'idle' : 'aim';
    } else if (a.speed > 3.6) { part = 'run'; rate = Math.max(0.6, a.speed / 5.2); }
    else if (a.speed > 0.4) { part = 'walk'; rate = Math.max(0.6, a.speed / 1.7); }
    if (a.oneT > 0 && !a.oneShot) a.oneT = 0;
    a.partT = (a.partT ?? 1) + dt;
    const urgent = part === 'death' || part === 'roll' || part === 'hit' || part === 'punch' || part === 'interact' || a.part === 'roll' || a.part === 'punch';
    if (part !== a.part && !urgent && a.partT < 0.16) part = a.part; // hold the pose: no twitching between two states
    if (part !== a.part) { a.from.set(a.pose); a.fade = 0; a.part = part; a.t = 0; a.partT = 0; }
    a.t += dt * rate;
    const c = clipOf(a, part) || clipOf(a, 'idle');
    const tt = c.hold !== null ? c.hold * c.clip.dur : time !== null ? time : a.t;
    sample(a, c.clip, tt, loop && c.hold === null, a.target);
    if (a.fade < 1) {
      a.fade = Math.min(1, a.fade + dt / 0.14);
      const k = a.fade, P = a.pose, F = a.from, G = a.target;
      for (let b = 0; b < a.bones.length; b++) {
        const o = b * 7;
        for (let i = 0; i < 3; i++) P[o + i] = F[o + i] + (G[o + i] - F[o + i]) * k;
        const s = F[o + 3] * G[o + 3] + F[o + 4] * G[o + 4] + F[o + 5] * G[o + 5] + F[o + 6] * G[o + 6] < 0 ? -1 : 1;
        let l = 0;
        for (let i = 3; i < 7; i++) { const q = F[o + i] + (G[o + i] * s - F[o + i]) * k; P[o + i] = q; l += q * q; }
        l = Math.sqrt(l) || 1;
        for (let i = 3; i < 7; i++) P[o + i] /= l;
      }
    } else a.pose.set(a.target);
    const holding = a.gun && a.gun.visible && a.aimPose && !a.dead && part !== 'roll' && part !== 'punch' && part !== 'interact' && part !== 'hit' && part !== 'wave' && part !== 'sit';
    if (holding) {
      // Arms stay in the aiming pose whatever the legs are doing, so the gun always points where the figure faces.
      const P = a.pose, A = a.aimPose;
      for (const b of a.armIdx) { const o = b * 7 + 3; P[o] = A[o]; P[o + 1] = A[o + 1]; P[o + 2] = A[o + 2]; P[o + 3] = A[o + 3]; }
    }
    applyPose(a, a.pose);
    if (a.look.fam === 'alien') creature(a, dt);
    if (a.gun && a.gunBase) {
      // recoil: the gun kicks back and up, then settles
      // `kickK` is set per shot: a shotgun or rifle kicks harder than an SMG
      const kk = a.kickK ?? 1, dur = 0.12 + 0.06 * Math.min(2, kk);
      const k = a.shootT < dur ? Math.sin((a.shootT / dur) * Math.PI) * (1 - a.shootT / dur) : 0;
      if (k > 0.001 || a.kicked) {
        a.gun.matrix.copy(a.gunBase).multiply(m4.makeRotationX(-k * 0.42 * kk)).multiply(recoilT.makeTranslation(0, 0, -k * 0.12 * kk));
        a.kicked = k > 0.001;
      }
    }
    if (a.flash > 0) {
      a.flash = Math.max(0, a.flash - dt * 8);
      // a white-hot flash that cools through orange
      const f = a.flash, f2 = f * f;
      a.material.emissive.setRGB(1.1 * f, 0.55 * f + 0.45 * f2, 0.25 * f + 0.6 * f2);
    }
  }

  /** Creatures have no walk, strike or death clips: bob, lean, lunge and collapse instead. */
  function creature(a, dt) {
    if (a.baseY === undefined) { a.baseY = a.inner.position.y; a.baseS = a.inner.scale.x; a.ct = Math.random() * 6; }
    a.ct += dt * (1 + a.speed * 0.6);
    const hover = a.look.hover || 0, s = a.scale;
    let y = a.baseY + hover * s, k = 1, lean = 0;
    if (hover) y += Math.sin(a.ct * 2.2) * 0.08 * s;
    else if (a.speed > 0.4) y += Math.abs(Math.sin(a.ct * 7)) * 0.06 * s;   // a scuttle
    // walking, striking and dying are clips now (tools/creature-clips.mjs); this adds hover and a little lean
    lean = Math.min(0.2, a.speed * 0.04);
    if (a.dead) {
      const d = Math.min(1, a.deadT / 1.1);
      y = a.baseY - d * 0.12 * s; lean = 0;
    }
    // scale and lean about the feet, not about the model's own origin (which sits well off the ground)
    const lift = y - a.baseY;
    a.inner.scale.setScalar(a.baseS * k);
    a.inner.rotation.x = lean;
    a.inner.position.y = a.baseY * k * Math.cos(lean) + lift;
    a.inner.position.z = a.baseY * k * Math.sin(lean);
  }

  function place(a, x, z, facing) {
    a.root.position.set(x, 0, z);
    a.root.rotation.y = Math.PI / 2 - facing;
  }
  function dispose(a) {
    a.material.dispose();
    if (a.root.parent) a.root.parent.remove(a.root);
  }
  return { make, update, place, setGun, dispose };
}
