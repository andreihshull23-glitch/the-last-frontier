// The simulation: one ride (or one visit to town). No DOM, no wall clock, no
// Math.random. `sim.state` is plain JSON; the level is static and is rebuilt
// from its spec, so snapshot()/restoreSim() round-trip a ride through a reload.
// The sim talks to the outside world only by pushing events onto `sim.events`.

import {
  TILE as TS, PX, MACRO, ENEMIES, WEAPONS, GUNS, GUN_ORDER, gunStats, AMMO, CARRY, DYNAMITE, ITEMS, SOLID, OPAQUE, BLOCKS_SHOT, ROCK,
  RELICS, PULSE, JUMP, START_GUN,
} from './content.js';
import { makeRng } from './rng.js';
import { buildNav, nearestNav } from './level.js';

export const SNAPSHOT_VERSION = 3;

export const PLAYER = {
  radius: 11,
  speed: 176,
  sprintMul: 1.46,
  sprintDrain: 11,
  sprintNoise: 170,
  accel: 14,
  dodgeSpeed: 470,
  dodgeTime: 0.24,
  dodgeIframes: 0.22,
  dodgeCost: 30,
  dodgeRecover: 0.12,
  stamina: 100,
  staminaRegen: 34,
  staminaDelay: 0.55,
  swapTime: 0.3,
  bandageHeal: 45,
  fieldKitHeal: 70,
  bandageTime: 2.0,
  fieldKitTime: 1.4,
  interactRange: 46,
  extractRadius: 84,
  extractTime: 6,
  heavySlow: 0.88,
  pickupRange: 40,
};

/** Seconds of in-world clock. */
export const CLOCK = { dusk: 420, night: 560, waveEvery: 35, maxWalkers: 10 };
export const ECHO = { delay: 2, shardDelay: 1.4, toPlayer: 12, toEnemy: 26, history: 3.5 };
const VISION = { day: 1500, night: 310, lantern: 150, nighteyes: 110 };
const TAU = Math.PI * 2;
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function turnToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}
function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = x0 + dx * t - cx, py = y0 + dy * t - cy;
  return px * px + py * py <= r * r;
}

// ------------------------------------------------------------------ setup

export function createSim(config, level) {
  const ch = config.character;
  const town = config.mode === 'town';
  // A ride starts with the sidearm; everything else is found. In town you may try every gun you have unlocked.
  const carry = config.carry || null;
  const pool = config.pool || [];
  const owned = carry ? Object.keys(carry.mags) : town ? GUN_ORDER.filter((g) => g === START_GUN || pool.includes(g)) : [START_GUN];
  const upgrades = config.armory?.upgrades || [];
  const relics = carry ? [...carry.relics] : [];
  const mods0 = runMods(relics);
  const mags = {};
  for (const g of owned) mags[g] = carry ? carry.mags[g] : Math.round(gunStats(g, upgrades).mag * mods0.mag);
  const clockStart = level.clock?.start || 'day';
  const state = {
    v: SNAPSHOT_VERSION,
    config,
    mode: town ? 'town' : 'ride',
    rngState: ((config.seed ?? 1) ^ 0x5bd1e995) | 0,
    t: 0,
    clockOffset: clockStart === 'night' ? CLOCK.night - 12 : 0,
    noClock: clockStart === 'none' || town,
    phase: 'playing',
    phaseT: 0,
    nextId: 1,
    player: {
      x: level.start.x, y: level.start.y, vx: 0, vy: 0, r: PLAYER.radius,
      hp: carry ? carry.hp : ch.hp, maxHp: ch.maxHp,
      stamina: PLAYER.stamina, staminaDelay: 0,
      aim: level.start.a || 0,
      dodgeT: 0, dodgeX: 0, dodgeY: 0, iframes: 0, recoverT: 0,
      sprinting: false, sprintLock: 0, stepT: 0,
      gun: carry?.gun && mags[carry.gun] !== undefined ? carry.gun : START_GUN, mags, rest: {},
      relics, pulses: carry ? carry.pulses + mods0.pulses : PULSE.start, jumpT: 0, jumpCd: 0, jumpX: level.start.x, jumpY: level.start.y, shotCount: 0, reviveUsed: false,
      ammo: carry ? { ...carry.ammo } : { cartridges: ch.cartridges ?? AMMO.cartridges.start, shells: ch.shells ?? 0 },
      dynamite: carry ? carry.dynamite : ch.dynamite ?? 0, bandages: carry ? carry.bandages : ch.bandages ?? 0,
      fireCd: 0, fireBuffer: 0, fanQueue: 0, fanT: 0, reloading: false, reloadT: 0, swapT: 0, throwCd: 0,
      healT: 0, hurtT: 0, lastHitBy: null, charmUsed: false, shotT: -9,
    },
    enemies: [], npcs: [], bullets: [], bombs: [], pickups: [], interactables: [], lights: [], corpses: [], respawns: [],
    focusId: 0,
    interact: { id: 0, t: 0 },
    extract: { active: false, t: 0, id: 0 },
    carried: { loot: [], items: [], effects: null },
    burned: 0,
    targetKilled: false,
    bountyKilled: false,
    explored: new Array(level.mw * level.mh).fill(0),
    zone: '',
    echo: { active: false, since: 0, delay: ECHO.delay, x: 0, y: 0, a: 0, visible: false, warned: false, history: [], shots: [] },
    nextWaveT: 0,
    buddy: config.companion ? { x: level.start.x + 26, y: level.start.y + 26, vx: 0, vy: 0, r: 11, facing: 0, cool: 1, downT: 0, hp: BUDDY.hp, path: null, pathGoal: -1, pathAge: 0, pathI: 0, moving: false } : null,
    warned: { dusk: clockStart !== 'day', night: false },
    sightT: 0,
    kills: carry ? carry.kills : 0,
    coin: carry ? carry.coin : 0,
    rooms: level.rooms ? level.rooms.map((r) => ({ id: r.id, state: r.waves.length ? 'idle' : 'cleared', wave: 0 })) : null,
    floor: config.floor || 0,
    boss: null,
    report: null,
  };

  const sim = wrap(state, level);
  for (const sp of level.spawns) {
    const e = addEnemy(sim, sp.kind, sp.x, sp.y, sp);
    if (sp.respawn) e.respawn = sp.respawn;
  }
  for (const n of level.npcs) {
    state.npcs.push({
      id: state.nextId++, role: n.role, name: n.name, shop: n.shop || null, look: n.look, x: n.x, y: n.y, vx: 0, vy: 0, r: 11,
      facing: n.a || 0, baseFacing: n.a || 0, fixed: Boolean(n.fixed), route: n.route || null, routeI: 0, waitT: 1 + (n.idx || 0) * 1.7,
      path: null, pathI: 0, pathGoal: -1, pathAge: 0, moving: false,
    });
  }
  for (const it of level.items) {
    const base = { id: state.nextId++, kind: it.kind, x: it.x, y: it.y, done: false, seen: false, known: false };
    if (it.kind === 'cache') Object.assign(base, { tier: it.tier, a: it.a, loot: it.loot, cartridges: it.cartridges, shells: it.shells, bandage: it.bandage, dynamite: it.dynamite, duration: 0.7 });
    else if (it.kind === 'objective') Object.assign(base, { item: it.item, role: it.role, zone: it.zone || '', duration: ITEMS[it.item].duration, known: true });
    else if (it.kind === 'exit') Object.assign(base, { variant: it.variant, duration: 0, seen: true, known: true, needsClear: Boolean(it.needsClear) });
    else if (it.kind === 'ware' || it.kind === 'gun' || it.kind === 'relic') Object.assign(base, { gun: it.gun || null, relic: it.relic || null, heal: it.heal || 0, price: it.price || 0, duration: 0, r: 54, seen: true, known: true });
    else Object.assign(base, { shop: it.shop || null, r: it.r || 60, text: it.text || '', duration: 0, seen: true, known: true });
    state.interactables.push(base);
  }
  for (const n of state.npcs) {
    if (n.role === 'keeper') continue;
    state.interactables.push({ id: state.nextId++, kind: 'talk', npc: n.id, role: n.role, name: n.name, x: n.x, y: n.y, r: 58, done: false, seen: true, known: true, duration: 0 });
  }
  for (const l of level.lights) if (l.kind === 'fire') state.lights.push({ x: l.x * PX, y: l.z * PX, kind: 'fire', r: 150, t: -1 });

  for (const e of state.enemies) if (e.target) e.known = true;
  const intel = config.intel ?? {};
  if (intel.fullMap || town) state.explored.fill(1);
  if (intel.riderIntel) {
    for (const it of state.interactables) if (it.kind === 'cache') it.known = true;
    for (const e of state.enemies) if (e.kind === 'bounty' || e.target) e.known = true;
  }
  if (!town) {
    emit(sim, 'toast', { text: config.intro || 'Go.', tone: 'story', long: true });
    if (clockStart === 'night') emit(sim, 'toast', { text: 'The district is already in lockdown. They will be moving soon.', tone: 'warn' });
    if (level.dark) emit(sim, 'toast', { text: 'No power down here. Watch the edges of the lamp.', tone: 'warn' });
  }
  markExplored(sim);
  return sim;
}

function wrap(state, level) {
  const sim = { state, level, events: [], rng: makeRng(0), cache: buildCache(level) };
  sim.rng.state = state.rngState;
  state.player.relics ||= [];
  rebuildGuns(sim);
  if (state.rooms) for (const st of state.rooms) if (st.state === 'active') seal(sim, level.rooms[st.id], true);
  return sim;
}

function buildCache(level) {
  const nav = buildNav(level);
  // Sealed rooms change what is solid, so those levels get their own copy to write on.
  return { w: level.w, h: level.h, flags: level.rooms ? level.flags.slice() : level.flags, hgt: level.hgt, nav, navBase: level.rooms ? nav.slice() : nav, flow: null, flowFrom: -1, flowAge: 99 };
}

export function snapshot(sim) {
  sim.state.rngState = sim.rng.state;
  return JSON.stringify(sim.state);
}

/** `level` must be the level rebuilt from data.config.level. */
export function restoreSim(data, level) {
  const state = typeof data === 'string' ? JSON.parse(data) : data;
  if (!state || state.v !== SNAPSHOT_VERSION || !state.player || !state.config) throw new Error('Unsupported snapshot');
  return wrap(state, level);
}

// ------------------------------------------------------------------ the run: relics, guns, drops

const BASE_MODS = { damage: 1, rate: 1, mag: 1, reload: 1, speed: 1, dodge: 1, armour: 1, coin: 1, luck: 1, robot: 1, berserk: 1, magnet: 0, lifesteal: 0, pierce: 0, bounce: 0, static: 0, pulses: 0, extra: 0, revive: 0 };
const MULTIPLY = new Set(['damage', 'rate', 'mag', 'reload', 'speed', 'dodge', 'armour', 'coin', 'luck', 'robot', 'berserk']);
/** What the relics carried add up to. */
export function runMods(relics) {
  const m = { ...BASE_MODS };
  for (const id of relics || []) {
    const r = RELICS[id];
    if (!r) continue;
    for (const [k, v] of Object.entries(r.mod)) { if (MULTIPLY.has(k)) m[k] *= v; else m[k] += v; }
  }
  return m;
}
/** Gun stats with gunsmith upgrades and this run's relics applied. */
function rebuildGuns(sim) {
  const s = sim.state;
  const upgrades = s.config.armory?.upgrades || [];
  const m = sim.cache.mods = runMods(s.player.relics);
  sim.cache.guns = {};
  for (const id of GUN_ORDER) {
    const g = gunStats(id, upgrades);
    g.mag = Math.max(1, Math.round(g.mag * m.mag));
    g.cooldown /= m.rate;
    if (g.reloadRound) g.reloadRound /= m.reload;
    if (g.magReload) g.magReload /= m.reload;
    if (g.recharge) g.recharge = { rate: g.recharge.rate * m.reload, delay: g.recharge.delay / m.reload };
    g.pierce = (g.pierce || 0) + m.pierce;
    g.bounce = (g.bounce || 0) + m.bounce;
    sim.cache.guns[id] = g;
  }
}
/** Put a gun in the drifter's hands (or top it up if they already have one). */
export function giveGun(sim, id, quiet = false) {
  const s = sim.state, p = s.player, g = sim.cache.guns[id];
  if (!g) return false;
  const had = p.mags[id] !== undefined;
  p.mags[id] = g.mag;
  if (g.ammo) addAmmo(sim, g.ammo, g.ammo === 'shells' ? 12 : 30);
  if (!had) swapTo(sim, id);
  if (!quiet) emit(sim, 'toast', { text: had ? `${g.name}: reloaded and topped up.` : `${g.name}. ${g.desc}`, tone: 'good', long: !had });
  return true;
}
export function giveRelic(sim, id, quiet = false) {
  const s = sim.state, p = s.player, r = RELICS[id];
  if (!r || p.relics.includes(id)) return false;
  p.relics.push(id);
  rebuildGuns(sim);
  if (r.mod.pulses) p.pulses += r.mod.pulses;
  if (!quiet) emit(sim, 'toast', { text: `${r.name}. ${r.desc}`, tone: 'good', long: true });
  return true;
}
function weighted(sim, list, weight) {
  let total = 0;
  for (const x of list) total += weight(x);
  if (total <= 0) return null;
  let roll = sim.rng.next() * total;
  for (const x of list) { roll -= weight(x); if (roll <= 0) return x; }
  return list[list.length - 1];
}
/** A gun the drifter does not have, from the ones this campaign can find. Higher tiers are rarer. */
function rollGun(sim, luck = 1) {
  const s = sim.state, p = s.player;
  const pool = (s.config.pool || []).filter((g) => GUNS[g] && p.mags[g] === undefined);
  return weighted(sim, pool, (g) => [0, 6, 3 * luck, 1.2 * luck][GUNS[g].tier || 1]);
}
function rollRelic(sim, luck = 1) {
  const p = sim.state.player;
  const pool = Object.keys(RELICS).filter((r) => !p.relics.includes(r));
  return weighted(sim, pool, (r) => [0, 6, 3 * luck, 1.2 * luck][RELICS[r].tier || 1]);
}
/** Leave a gun or a relic on the ground to be picked up with the use key. `price` makes it a shop ware. */
function dropItem(sim, x, y, what, price = 0) {
  const s = sim.state;
  const it = { id: s.nextId++, kind: price ? 'ware' : what.gun ? 'gun' : 'relic', x, y, done: false, seen: true, known: true, duration: 0, r: 54, gun: what.gun || null, relic: what.relic || null, heal: what.heal || 0, price };
  s.interactables.push(it);
  emit(sim, 'drop', { x, y, id: it.id });
  return it;
}
function rollDrop(sim, luck = 1) {
  const gun = sim.rng.chance(0.5) ? rollGun(sim, luck) : null;
  if (gun) return { gun };
  const relic = rollRelic(sim, luck);
  if (relic) return { relic };
  const g2 = rollGun(sim, luck);
  return g2 ? { gun: g2 } : null;
}
function takeItem(sim, it) {
  const s = sim.state, p = s.player;
  if (it.price > 0) {
    if (s.coin < it.price) { emit(sim, 'toast', { text: `That costs ${it.price} coin. You have ${s.coin}.`, tone: 'bad' }); return; }
    s.coin -= it.price;
  }
  if (it.gun) giveGun(sim, it.gun);
  else if (it.relic) giveRelic(sim, it.relic);
  else if (it.heal) { p.hp = Math.min(p.maxHp, p.hp + it.heal); emit(sim, 'healed', { amount: it.heal, x: p.x, y: p.y }); }
  it.done = true;
  emit(sim, 'item_taken', { x: it.x, y: it.y, id: it.id, bought: it.price > 0 });
}
const itemName = (it) => (it.gun ? GUNS[it.gun].name : it.relic ? RELICS[it.relic].name : 'Field dressing');
const itemBlurb = (it) => (it.gun ? GUNS[it.gun].role : it.relic ? RELICS[it.relic].desc : `Heals ${it.heal} health.`);

// ------------------------------------------------------------------ sealed rooms (the Descent)

function seal(sim, room, on) {
  const { w, flags, nav, navBase } = sim.cache, base = sim.level.flags;
  for (const [x0, y0, x1, y1] of room.seal) {
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const i = ty * w + tx;
      if (on) { flags[i] |= SOLID | BLOCKS_SHOT; nav[i] = 0; } else { flags[i] = base[i]; nav[i] = navBase[i]; }
    }
  }
  sim.cache.flowAge = 99;
}
function spawnWave(sim, room, st) {
  const s = sim.state, p = s.player;
  for (const sp of room.waves[st.wave]) {
    const e = addEnemy(sim, sp.kind, sp.x, sp.y, { target: Boolean(sp.target), facing: Math.atan2(p.y - sp.y, p.x - sp.x) });
    e.room = room.id;
    e.spawnT = 0.7 + sim.rng.next() * 0.25;
    if (sp.target) e.known = true;
    emit(sim, 'beam_in', { x: e.x, y: e.y, id: e.id });
  }
}
function updateRooms(sim) {
  const s = sim.state, p = s.player;
  if (!s.rooms) return;
  const L = sim.level, m = 44;
  for (const st of s.rooms) {
    const r = L.rooms[st.id];
    if (st.state === 'idle') {
      if (p.x > r.x0 + m && p.x < r.x1 - m && p.y > r.y0 + m && p.y < r.y1 - m) {
        st.state = 'active';
        st.wave = 0;
        seal(sim, r, true);
        spawnWave(sim, r, st);
        emit(sim, 'room_sealed', { id: r.id, boss: r.role === 'boss' });
        emit(sim, 'toast', { text: r.role === 'boss' ? 'The doors slam. Something big is coming up through the floor.' : 'The doors seal. Clear the room.', tone: 'bad' });
      }
    } else if (st.state === 'active') {
      if (s.enemies.some((e) => !e.dead && e.room === r.id)) continue;
      st.wave += 1;
      if (st.wave < r.waves.length) { spawnWave(sim, r, st); emit(sim, 'toast', { text: 'More of them.', tone: 'bad' }); continue; }
      st.state = 'cleared';
      seal(sim, r, false);
      emit(sim, 'room_cleared', { id: r.id, boss: r.role === 'boss' });
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
      const luck = sim.cache.mods.luck;
      if (r.role === 'boss') {
        const a = rollRelic(sim, 3), b = rollGun(sim, 3);
        if (a) dropItem(sim, cx - 46, cy, { relic: a });
        if (b) dropItem(sim, cx + 46, cy, { gun: b });
        p.pulses += 1;
        emit(sim, 'toast', { text: 'Floor cleared. Take what it dropped, then take the lift down.', tone: 'good', long: true });
      } else {
        for (let k = 0; k < 3; k++) s.pickups.push({ id: s.nextId++, kind: 'cash', x: cx + sim.rng.range(-30, 30), y: cy + sim.rng.range(-30, 30), amount: sim.rng.int(4, 9) });
        if (sim.rng.chance(Math.min(0.6, 0.22 * luck))) s.pickups.push({ id: s.nextId++, kind: 'heart', x: cx, y: cy + 24, amount: 20 });
        if (sim.rng.chance(Math.min(0.5, 0.12 * luck))) { const d = rollDrop(sim, luck); if (d) dropItem(sim, cx, cy - 30, d); }
        emit(sim, 'toast', { text: 'Room clear.', tone: 'good' });
      }
    }
  }
}

function emit(sim, type, data = {}) {
  sim.events.push({ type, ...data });
}

function addEnemy(sim, kind, x, y, extra = {}) {
  const s = sim.state;
  const def = ENEMIES[kind];
  let hp = def.hp;
  if (kind === 'bounty') hp += 40 * ((extra.notoriety ?? 1) - 1);
  if (extra.target && kind === 'brute') hp = Math.round(hp * 1.4);
  const facing = extra.facing ?? sim.rng.range(0, TAU);
  const e = {
    id: s.nextId++, kind, x, y, vx: 0, vy: 0, r: def.radius, hp, maxHp: hp,
    state: extra.dormant ? 'dormant' : def.ai === 'swarm' ? 'engage' : 'idle',
    stateT: 0, postX: x, postY: y, facing, baseFacing: facing,
    lookT: sim.rng.range(0.5, 2.5), suspicion: 0, seesPlayer: false, lastSeenT: -99,
    lastX: s.player.x, lastY: s.player.y, targetX: x, targetY: y, arrivedT: 0,
    path: null, pathI: 0, pathGoal: -1, pathAge: 0, perceiveT: sim.rng.range(0, 0.1),
    atk: { phase: 'ready', t: 0, angle: 0, shots: 0, move: 0 },
    strafe: sim.rng.chance(0.5) ? 1 : -1, strafeT: sim.rng.range(0.6, 1.6),
    flared: false, retreated: false, hitT: 0, stuckT: 0,
    route: extra.route || null, routeI: 0,
    name: extra.name ?? null, notoriety: extra.notoriety ?? 0, target: Boolean(extra.target),
    known: false, dead: false, summons: 0,
  };
  if (def.boss) s.boss = e.id;
  s.enemies.push(e);
  return e;
}

// ------------------------------------------------------------------ queries

export function clockTime(s) {
  return s.t + s.clockOffset;
}

export function nightFactor(s) {
  if (s.noClock) return 0;
  const tt = clockTime(s);
  const bonus = s.config.sundownBonus ?? 0;
  const dusk = CLOCK.dusk + bonus, night = CLOCK.night + bonus;
  if (tt <= dusk) return 0;
  if (tt >= night) return 1;
  return (tt - dusk) / (night - dusk);
}

/** 0 in daylight, 1 in the dark (night, or underground). */
export function darkness(sim) {
  return sim.level.dark ? 1 : nightFactor(sim.state);
}

export function visionRadius(sim) {
  const s = sim.state;
  const n = darkness(sim);
  const ch = s.config.character;
  const extra = (ch.gear.includes('lantern') ? VISION.lantern : 0) + (ch.trait === 'nighteyes' ? VISION.nighteyes : 0);
  return VISION.day + (VISION.night - VISION.day) * n + extra * n;
}

export function haunted(sim) {
  return sim.level.theme === 'hollow' || sim.state.carried.items.includes('shard');
}

const hasGear = (s, id) => s.config.character.gear.includes(id);
const isHeavy = (s) => s.carried.items.some((k) => ITEMS[k]?.heavy);

function solidAt(sim, tx, ty, air = false) {
  const { w, h, flags, hgt } = sim.cache;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
  const f = flags[ty * w + tx];
  if (!(f & SOLID)) return false;
  // in the air, anything low enough (a crate, a fence, a trough) can be cleared; rock and walls cannot
  if (air && !(f & (ROCK | OPAQUE)) && hgt[ty * w + tx] > 0 && hgt[ty * w + tx] <= JUMP.low) return false;
  return true;
}
const solidPx = (sim, x, y) => solidAt(sim, Math.floor(x / TS), Math.floor(y / TS));

function tileIdx(sim, x, y) {
  const { w, h } = sim.cache;
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -1;
  return ty * w + tx;
}

/** DDA ray march. Returns the distance to the first tile matching `mask`, capped at maxDist. */
export function castRay(sim, x, y, dx, dy, maxDist, mask = OPAQUE) {
  const { w, h, flags } = sim.cache;
  let tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const tDeltaX = adx > 1e-9 ? TS / adx : Infinity;
  const tDeltaY = ady > 1e-9 ? TS / ady : Infinity;
  let tMaxX = adx > 1e-9 ? (dx > 0 ? (tx + 1) * TS - x : x - tx * TS) / adx : Infinity;
  let tMaxY = ady > 1e-9 ? (dy > 0 ? (ty + 1) * TS - y : y - ty * TS) / ady : Infinity;
  let t = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; } else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
    if (t >= maxDist) return maxDist;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return t;
    if (flags[ty * w + tx] & mask) return t;
  }
  return maxDist;
}

export function hasLOS(sim, x0, y0, x1, y1, mask = OPAQUE) {
  const dx = x1 - x0, dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 1) return true;
  return castRay(sim, x0, y0, dx / d, dy / d, d, mask) >= d - 0.5;
}

export function isVisible(sim, x, y) {
  const p = sim.state.player;
  return Math.hypot(x - p.x, y - p.y) <= visionRadius(sim) && hasLOS(sim, p.x, p.y, x, y);
}

function bodyLineClear(sim, x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const nx = (-dy / len) * r * 0.9, ny = (dx / len) * r * 0.9;
  const steps = Math.ceil(len / 8);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t, y = y0 + dy * t;
    if (solidPx(sim, x, y) || solidPx(sim, x + nx, y + ny) || solidPx(sim, x - nx, y - ny)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ physics

function moveBody(sim, e, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  for (let i = 0; i < steps; i++) {
    e.x += dx / steps;
    collide(sim, e);
    e.y += dy / steps;
    collide(sim, e);
  }
}

function collide(sim, e) {
  const r = e.r;
  const x0 = Math.floor((e.x - r) / TS), x1 = Math.floor((e.x + r) / TS);
  const y0 = Math.floor((e.y - r) / TS), y1 = Math.floor((e.y + r) / TS);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!solidAt(sim, tx, ty, e.air === true)) continue;
      const left = tx * TS, top = ty * TS;
      const cx = clamp(e.x, left, left + TS), cy = clamp(e.y, top, top + TS);
      const ddx = e.x - cx, ddy = e.y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        e.x += (ddx / d) * (r - d);
        e.y += (ddy / d) * (r - d);
      } else {
        const l = e.x - left, rt = left + TS - e.x, u = e.y - top, dn = top + TS - e.y;
        const m = Math.min(l, rt, u, dn);
        if (m === l) e.x = left - r;
        else if (m === rt) e.x = left + TS + r;
        else if (m === u) e.y = top - r;
        else e.y = top + TS + r;
      }
    }
  }
}

// ------------------------------------------------------------------ pathing

function navIdx(sim, x, y) {
  return nearestNav(sim.level, sim.cache.nav, tileIdx(sim, x, y), 5);
}

function astar(sim, start, goal) {
  const { w, h, nav } = sim.cache;
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [goal];
  const n = w * h;
  const c = sim.cache;
  if (!c.g) {
    c.g = new Float32Array(n);
    c.came = new Int32Array(n);
    c.open = new Uint32Array(n);
    c.closed = new Uint32Array(n);
    c.run = 0;
  }
  c.run += 1;
  const run = c.run;
  const gx = goal % w, gy = Math.floor(goal / w);
  const heur = (i) => {
    const dx = Math.abs((i % w) - gx), dy = Math.abs(Math.floor(i / w) - gy);
    return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) * 1.001;
  };
  const hf = [], hi = [];
  const push = (f, i) => {
    let k = hf.length;
    hf.push(f); hi.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= hf[k]) break;
      [hf[p], hf[k]] = [hf[k], hf[p]];
      [hi[p], hi[k]] = [hi[k], hi[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = hi[0];
    const lf = hf.pop(), li = hi.pop();
    if (hf.length) {
      hf[0] = lf; hi[0] = li;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1, b = a + 1;
        let m = k;
        if (a < hf.length && hf[a] < hf[m]) m = a;
        if (b < hf.length && hf[b] < hf[m]) m = b;
        if (m === k) break;
        [hf[m], hf[k]] = [hf[k], hf[m]];
        [hi[m], hi[k]] = [hi[k], hi[m]];
        k = m;
      }
    }
    return top;
  };
  c.open[start] = run; c.g[start] = 0; c.came[start] = -1;
  push(heur(start), start);
  let expanded = 0;
  while (hf.length) {
    const cur = pop();
    if (c.closed[cur] === run) continue;
    c.closed[cur] = run;
    if (cur === goal) break;
    if (++expanded > 9000) return null;
    const cx = cur % w, cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!nav[ni]) continue;
      if (dx && dy && (!nav[cy * w + nx] || !nav[ny * w + cx])) continue;
      const ng = c.g[cur] + cost;
      if (c.open[ni] !== run || ng < c.g[ni]) {
        c.open[ni] = run; c.g[ni] = ng; c.came[ni] = cur;
        push(ng + heur(ni), ni);
      }
    }
  }
  if (c.closed[goal] !== run) return null;
  const path = [];
  for (let i = goal; i !== start && i !== -1; i = c.came[i]) path.push(i);
  return path.reverse();
}

function computeFlow(sim, from) {
  const { w, h, nav } = sim.cache;
  const n = w * h;
  const c = sim.cache;
  if (!c.flowBuf) { c.flowBuf = new Int32Array(n); c.flowQ = new Int32Array(n); }
  const dist = c.flowBuf;
  dist.fill(-1);
  if (from < 0) return null;
  const q = c.flowQ;
  let head = 0, tail = 0;
  q[tail++] = from;
  dist[from] = 0;
  while (head < tail) {
    const cur = q[head++];
    const cx = cur % w, cy = Math.floor(cur / w);
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] >= 0 || !nav[ni]) continue;
      if (dx && dy && (!nav[cy * w + nx] || !nav[ny * w + cx])) continue;
      dist[ni] = dist[cur] + 1;
      q[tail++] = ni;
    }
  }
  return dist;
}

function ensureFlow(sim) {
  const c = sim.cache, p = sim.state.player;
  const from = navIdx(sim, p.x, p.y);
  if (c.flow && c.flowFrom === from && c.flowAge < 2) return c.flow;
  if (c.flow && c.flowAge < 0.3) return c.flow;
  c.flow = computeFlow(sim, from);
  c.flowFrom = from;
  c.flowAge = 0;
  return c.flow;
}

function flowDir(sim, e) {
  const flow = ensureFlow(sim);
  if (!flow) return null;
  const { w, h, nav } = sim.cache;
  const here = navIdx(sim, e.x, e.y);
  if (here < 0) return null;
  const tx = here % w, ty = Math.floor(here / w);
  let best = flow[here] < 0 ? Infinity : flow[here];
  let bx = 0, by = 0;
  for (const [dx, dy] of DIRS8) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const d = flow[ny * w + nx];
    if (d < 0 || d >= best) continue;
    if (dx && dy && (!nav[ty * w + nx] || !nav[ny * w + tx])) continue;
    best = d; bx = dx; by = dy;
  }
  if (!bx && !by) return null;
  return { x: (tx + bx) * TS + TS / 2 - e.x, y: (ty + by) * TS + TS / 2 - e.y };
}

function navigate(sim, e, tx, ty) {
  if (bodyLineClear(sim, e.x, e.y, tx, ty, e.r)) {
    e.path = null;
    return { x: tx - e.x, y: ty - e.y };
  }
  const goal = navIdx(sim, tx, ty);
  if (goal < 0) return null;
  if (!e.path || e.pathGoal !== goal || e.pathAge > 1.6) {
    e.path = astar(sim, navIdx(sim, e.x, e.y), goal);
    e.pathGoal = goal;
    e.pathAge = 0;
    e.pathI = 0;
  }
  if (!e.path || !e.path.length) return null;
  const { w } = sim.cache;
  const centre = (i) => [(i % w) * TS + TS / 2, Math.floor(i / w) * TS + TS / 2];
  for (let k = 0; k < 6 && e.pathI < e.path.length - 1; k++) {
    const [nx, ny] = centre(e.path[e.pathI + 1]);
    if (!bodyLineClear(sim, e.x, e.y, nx, ny, e.r)) break;
    e.pathI++;
  }
  const [wx, wy] = centre(e.path[e.pathI]);
  if (Math.hypot(wx - e.x, wy - e.y) < 8 && e.pathI < e.path.length - 1) e.pathI++;
  return { x: wx - e.x, y: wy - e.y };
}

function findSpawn(sim, minD, maxD) {
  const s = sim.state, p = s.player;
  const { w, nav } = sim.cache;
  const flow = ensureFlow(sim);
  for (let i = 0; i < 90; i++) {
    const a = sim.rng.range(0, TAU), d = sim.rng.range(minD, maxD);
    const ti = tileIdx(sim, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    if (ti < 0 || !nav[ti]) continue;
    if (flow && flow[ti] < 0) continue;
    const x = (ti % w) * TS + TS / 2, y = Math.floor(ti / w) * TS + TS / 2;
    if (Math.hypot(x - p.x, y - p.y) < visionRadius(sim) * 1.05 && hasLOS(sim, p.x, p.y, x, y)) continue;
    return { x, y };
  }
  return null;
}

// ------------------------------------------------------------------ main step

/**
 * Advance one fixed step. `input`: mx/my (move, world space, -1..1), ax/ay (aim
 * point in world space), held flags fireHeld, sprint, interactHeld, and one-tick
 * presses fire, alt, dodge, reload, heal, throw, swap, slot (1..3), interactPressed.
 */
export function update(sim, dt, input = {}) {
  const s = sim.state;
  if (s.phase === 'ended') return;
  s.t += dt;
  sim.cache.flowAge += dt;
  if (s.phase === 'dying') {
    s.phaseT += dt;
    updateBullets(sim, dt);
    updateBombs(sim, dt);
    if (s.phaseT >= 1.8) endExpedition(sim, 'died');
    return;
  }
  updatePlayer(sim, dt, input);
  updateInteract(sim, dt, input);
  if (updateExtraction(sim, dt, input)) return;
  updateBuddy(sim, dt);
  if (s.mode === 'town') {
    updateNpcs(sim, dt);
    updateEnemies(sim, dt);
    updateBullets(sim, dt);
    updateRespawns(sim, dt);
    updateZone(sim);
    return;
  }
  updateRooms(sim);
  updateEcho(sim);
  updateEnemies(sim, dt);
  updateBullets(sim, dt);
  updateBombs(sim, dt);
  updatePickups(sim);
  updateNight(sim);
  updateZone(sim);
  updateSight(sim, dt);
  updateLights(s, dt);
  if (s.player.hp <= 0) {
    s.phase = 'dying';
    s.phaseT = 0;
    s.extract.active = false;
    emit(sim, 'player_died', { x: s.player.x, y: s.player.y });
  }
}

// ------------------------------------------------------------------ player

function updatePlayer(sim, dt, input) {
  const s = sim.state, p = s.player, trait = s.config.character.trait;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.recoverT = Math.max(0, p.recoverT - dt);
  p.fireBuffer = Math.max(0, p.fireBuffer - dt);
  p.swapT = Math.max(0, p.swapT - dt);
  p.throwCd = Math.max(0, p.throwCd - dt);
  p.sprintLock = Math.max(0, p.sprintLock - dt);
  if (Number.isFinite(input.ax) && Number.isFinite(input.ay)) {
    const dx = input.ax - p.x, dy = input.ay - p.y;
    if (dx * dx + dy * dy > 4) p.aim = Math.atan2(dy, dx);
  }

  let mx = input.mx || 0, my = input.my || 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const moving = ml > 0.15;

  // sprinting burns stamina and makes noise
  const canSprint = input.sprint && moving && p.dodgeT <= 0 && p.healT <= 0 && p.sprintLock <= 0 && !isHeavy(s) && (p.sprinting ? p.stamina > 0 : p.stamina > 12);
  p.sprinting = Boolean(canSprint);
  if (p.sprinting && s.mode !== 'town') {
    const drain = PLAYER.sprintDrain * (trait === 'fleet' ? 0.6 : 1) * (hasGear(s, 'boots') ? 0.6 : 1);
    p.stamina = Math.max(0, p.stamina - drain * dt);
    p.staminaDelay = 0.35;
    p.stepT -= dt;
    if (p.stepT <= 0) { p.stepT = 0.45; noise(sim, p.x, p.y, PLAYER.sprintNoise, 'player'); }
  } else if (p.staminaDelay > 0) p.staminaDelay -= dt;
  else p.stamina = Math.min(PLAYER.stamina, p.stamina + PLAYER.staminaRegen * (trait === 'fleet' ? 1.35 : 1) * dt);

  if (p.healT > 0) {
    p.healT -= dt;
    if (p.healT <= 0) {
      const amount = hasGear(s, 'field_kit') ? PLAYER.fieldKitHeal : PLAYER.bandageHeal;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      emit(sim, 'healed', { amount, x: p.x, y: p.y });
    }
  }

  if (input.dodge && p.dodgeT <= 0 && p.healT <= 0) {
    const md = sim.cache.mods;
    const cost = PLAYER.dodgeCost * (trait === 'fleet' ? 0.75 : 1) / (md.dodge > 1 ? 1.4 : 1);
    if (p.stamina >= cost) {
      let dx = mx, dy = my;
      if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
      const dl = Math.hypot(dx, dy) || 1;
      p.dodgeX = dx / dl; p.dodgeY = dy / dl;
      p.dodgeT = PLAYER.dodgeTime;
      p.iframes = PLAYER.dodgeIframes * md.dodge;
      p.jumpT = 0;
      p.stamina -= cost;
      p.staminaDelay = PLAYER.staminaDelay;
      emit(sim, 'dodge', { x: p.x, y: p.y, angle: Math.atan2(p.dodgeY, p.dodgeX) });
    } else emit(sim, 'tired');
  }

  if (p.dodgeT > 0) {
    p.dodgeT -= dt;
    p.vx = p.dodgeX * PLAYER.dodgeSpeed;
    p.vy = p.dodgeY * PLAYER.dodgeSpeed;
    if (p.dodgeT <= 0) { p.recoverT = PLAYER.dodgeRecover; p.vx *= 0.35; p.vy *= 0.35; }
  } else {
    let speed = PLAYER.speed * (hasGear(s, 'boots') ? 1.06 : 1) * sim.cache.mods.speed;
    if (p.sprinting) speed *= PLAYER.sprintMul;
    if (isHeavy(s)) speed *= PLAYER.heavySlow;
    if (p.healT > 0) speed *= 0.5;
    if (p.recoverT > 0) speed *= 0.6;
    const k = Math.min(1, PLAYER.accel * dt);
    p.vx += (mx * speed - p.vx) * k;
    p.vy += (my * speed - p.vy) * k;
  }
  // jump: a short hop that clears low cover and anything that travels along the ground
  p.jumpCd = Math.max(0, p.jumpCd - dt);
  if (input.jump && p.jumpT <= 0 && p.jumpCd <= 0 && p.dodgeT <= 0 && p.healT <= 0 && !isHeavy(s)) {
    p.jumpT = JUMP.time; p.jumpX = p.x; p.jumpY = p.y;
    emit(sim, 'jump', { x: p.x, y: p.y });
  }
  p.air = p.jumpT > 0;
  moveBody(sim, p, p.vx * dt, p.vy * dt);
  if (p.jumpT > 0) {
    p.jumpT -= dt;
    if (p.jumpT <= 0) {
      p.jumpT = 0; p.air = false; p.jumpCd = JUMP.cooldown;
      // come down on clear ground: slide off whatever is underfoot, or go back to where the jump began
      for (let k = 0; k < 4 && solidPx(sim, p.x, p.y); k++) collide(sim, p);
      collide(sim, p);
      if (solidPx(sim, p.x, p.y)) { p.x = p.jumpX; p.y = p.jumpY; }
      emit(sim, 'land', { x: p.x, y: p.y });
    }
  }

  // the pulse: wipes enemy fire off the screen, shoves what is close and locks machines up
  if (input.pulse && s.mode !== 'town') {
    if (p.pulses <= 0) emit(sim, 'toast', { text: 'No pulse charges.', tone: 'bad' });
    else {
      p.pulses -= 1;
      const R = PULSE.radius;
      s.bullets = s.bullets.filter((b) => b.owner === 'player' || Math.hypot(b.x - p.x, b.y - p.y) > R);
      s.bombs = s.bombs.filter((b) => b.owner === 'player' || Math.hypot(b.x - p.x, b.y - p.y) > R);
      for (const e of s.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > R * 0.6) continue;
        const def = ENEMIES[e.kind];
        if (e.atk.phase === 'windup' && !def.boss) { e.atk.phase = 'cooldown'; e.atk.t = 0.8; }
        if (def.robot && !def.boss) e.stunT = Math.max(e.stunT || 0, PULSE.stun);
        if (!def.boss && !def.rooted) { e.vx += ((e.x - p.x) / (d || 1)) * PULSE.knock; e.vy += ((e.y - p.y) / (d || 1)) * PULSE.knock; }
      }
      p.iframes = Math.max(p.iframes, 0.4);
      emit(sim, 'pulse', { x: p.x, y: p.y, r: R });
    }
  }

  updateWeapon(sim, dt, input);

  if (input.heal) {
    if (p.healT > 0 || p.dodgeT > 0) {
      // already busy
    } else if (p.bandages <= 0) emit(sim, 'toast', { text: 'No dressings left.', tone: 'bad' });
    else if (p.hp >= p.maxHp) emit(sim, 'toast', { text: 'You are not hurt.' });
    else {
      p.bandages -= 1;
      p.healT = hasGear(s, 'field_kit') ? PLAYER.fieldKitTime : PLAYER.bandageTime;
      p.reloading = false;
      p.fanQueue = 0;
      emit(sim, 'bandage', { x: p.x, y: p.y });
    }
  }
}

export function currentGun(sim) {
  return sim.cache.guns[sim.state.player.gun];
}

function reloadTime(sim) {
  const s = sim.state;
  const g = currentGun(sim);
  return Math.max(0.08, g.reloadRound || 0.3) * (s.config.character.trait === 'loader' ? 0.65 : 1) * (hasGear(s, 'bandolier') ? 0.8 : 1);
}

function reserveOf(sim) {
  const s = sim.state, g = currentGun(sim);
  if (!g.ammo) return 0; // energy cells refill by themselves
  return s.mode === 'town' ? 999 : s.player.ammo[g.ammo];
}

function startReload(sim) {
  const p = sim.state.player, g = currentGun(sim);
  if (g.recharge) return;
  if (p.reloading || reserveOf(sim) <= 0 || p.mags[p.gun] >= g.mag) return;
  p.reloading = true;
  p.reloadT = g.magReload ? g.magReload * (reloadTime(sim) / Math.max(0.08, g.reloadRound || 0.3)) : reloadTime(sim);
  emit(sim, 'reload_start', { gun: p.gun });
}

function swapTo(sim, id) {
  const p = sim.state.player;
  if (!id || id === p.gun || p.mags[id] === undefined) return;
  p.gun = id;
  p.swapT = PLAYER.swapTime;
  p.reloading = false;
  p.fanQueue = 0;
  p.fireBuffer = 0;
  emit(sim, 'swap', { gun: id });
  if (p.mags[id] <= 0) startReload(sim);
}

function updateWeapon(sim, dt, input) {
  const s = sim.state, p = s.player, trait = s.config.character.trait;
  const owned = GUN_ORDER.filter((g) => p.mags[g] !== undefined);
  if (input.slot) swapTo(sim, owned[input.slot - 1]);
  else if (input.swap) swapTo(sim, owned[(owned.indexOf(p.gun) + (input.swap > 0 ? 1 : owned.length - 1)) % owned.length]);
  const g = currentGun(sim);

  if (p.reloading) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      if (g.magReload) { // the whole magazine swaps at once
        const n = Math.min(g.mag - p.mags[p.gun], reserveOf(sim));
        p.mags[p.gun] += n;
        if (s.mode !== 'town') p.ammo[g.ammo] -= n;
        emit(sim, 'reload_round', { gun: p.gun });
      } else if (p.mags[p.gun] < g.mag && reserveOf(sim) > 0) {
        p.mags[p.gun] += 1;
        if (s.mode !== 'town') p.ammo[g.ammo] -= 1;
        emit(sim, 'reload_round', { gun: p.gun });
      }
      if (p.mags[p.gun] >= g.mag || reserveOf(sim) <= 0) {
        p.reloading = false;
        emit(sim, 'reload_done', { gun: p.gun });
      } else p.reloadT = reloadTime(sim);
    }
  }
  // energy cells refill on every gun that has one, drawn or holstered, once it has rested
  for (const id of owned) {
    const q = sim.cache.guns[id];
    if (!q.recharge) continue;
    p.rest[id] = (p.rest[id] ?? 9) + dt;
    if (p.rest[id] >= q.recharge.delay && p.mags[id] < q.mag) p.mags[id] = Math.min(q.mag, p.mags[id] + q.recharge.rate * dt);
  }
  if (p.fanQueue > 0) {
    p.fanT -= dt;
    while (p.fanT <= 0 && p.fanQueue > 0) {
      if (p.mags[p.gun] <= 0) { p.fanQueue = 0; break; }
      const spread = g.fanSpread * (trait === 'coolhead' ? 0.65 : 1);
      firePlayerShot(sim, g, p.aim + (sim.rng.next() * 2 - 1) * spread, g.fanDamage, 'fan');
      p.mags[p.gun] -= 1;
      p.fanQueue -= 1;
      p.fanT += g.fanInterval;
    }
    if (p.fanQueue === 0) {
      p.fireCd = g.fanRecover;
      if (p.mags[p.gun] === 0) startReload(sim);
    }
  }
  const busy = p.healT > 0 || p.dodgeT > 0 || p.fanQueue > 0 || p.swapT > 0;
  if (input.reload && !busy) startReload(sim);
  if (input.fire) p.fireBuffer = 0.14;
  else if (input.fireHeld && p.fireCd <= 0) p.fireBuffer = Math.max(p.fireBuffer, 0.03);
  if (p.fireBuffer > 0 && !busy && p.fireCd <= 0) {
    p.fireBuffer = 0;
    if (p.mags[p.gun] < 1) {
      if (input.fire) emit(sim, 'dry_fire');
      startReload(sim);
    } else {
      p.reloading = false;
      shoot(sim, g, 1);
      p.fireCd = g.cooldown;
      if (p.mags[p.gun] === 0) startReload(sim);
    }
  }
  if (input.alt && !busy && p.fireCd <= 0 && g.alt) {
    if (p.mags[p.gun] <= 0) {
      emit(sim, 'dry_fire');
      startReload(sim);
    } else if (g.alt === 'fan') {
      p.reloading = false;
      p.fanQueue = p.mags[p.gun];
      p.fanT = 0;
      emit(sim, 'fan_start');
    } else if (g.alt === 'overcharge') {
      // half the cell (at least 6 charges) in one heavy bolt that goes through things
      const n = Math.floor(Math.max(6, g.mag / 2));
      if (p.mags[p.gun] < n) emit(sim, 'dry_fire');
      else {
        p.mags[p.gun] -= n;
        p.rest[p.gun] = 0;
        firePlayerShot(sim, { ...g, pierce: 3, speed: g.speed * 1.2, range: g.range * 1.3, noise: g.noise * 1.5 }, p.aim, Math.round(g.damage * n * 0.75), 'overcharge', true);
        p.fireCd = 0.7;
        p.sprintLock = 0.3;
      }
    } else if (g.alt === 'double') {
      p.reloading = false;
      const shells = Math.min(2, p.mags[p.gun]);
      shoot(sim, g, shells);
      p.fireCd = g.cooldown * 1.5;
      if (p.mags[p.gun] === 0) startReload(sim);
    }
  }

  if (input.throw && p.throwCd <= 0 && p.healT <= 0 && p.dodgeT <= 0 && s.mode !== 'town') {
    if (p.dynamite <= 0) emit(sim, 'toast', { text: 'No charges.', tone: 'bad' });
    else {
      p.dynamite -= 1;
      p.throwCd = 0.8;
      let dx = (input.ax ?? p.x + Math.cos(p.aim) * 200) - p.x, dy = (input.ay ?? p.y + Math.sin(p.aim) * 200) - p.y;
      let d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      d = clamp(d, 70, DYNAMITE.range);
      d = Math.max(20, Math.min(d, castRay(sim, p.x, p.y, dx, dy, d, BLOCKS_SHOT) - 10));
      const dmg = DYNAMITE.damage * (trait === 'powder' ? 1.3 : 1);
      s.bombs.push({ id: s.nextId++, owner: 'player', x0: p.x, y0: p.y, x: p.x + dx * d, y: p.y + dy * d, t: 0, flight: 0.35 + d / 700, fuse: DYNAMITE.fuse, r: DYNAMITE.radius, damage: dmg, landed: false });
      emit(sim, 'throw', { x: p.x, y: p.y });
    }
  }
}

/** Fire `shells` rounds from the current gun at once (2 for the coach gun's double blast). */
function shoot(sim, g, shells) {
  const s = sim.state, p = s.player, trait = s.config.character.trait;
  const md = sim.cache.mods;
  const pellets = (g.pellets || 1) * shells + md.extra;
  p.shotCount += 1;
  // every fifth shot throws lightning, with the static field
  if (md.static && p.shotCount % 5 === 0 && !g.chain) g = { ...g, chain: 1, chainRange: 230 };
  const steady = trait === 'steady' && !g.pellets ? 1.2 : 1;
  const spread = g.spread * (shells > 1 ? 1.35 : 1) * (g.pellets && trait === 'coolhead' ? 0.65 : 1) * (p.sprinting ? 2.2 : 1);
  for (let i = 0; i < pellets; i++) {
    const a = p.aim + (g.pellets ? (sim.rng.next() + sim.rng.next() - 1) * spread : (sim.rng.next() * 2 - 1) * spread + (i > 0 ? (i % 2 ? 0.07 : -0.07) * Math.ceil(i / 2) : 0));
    firePlayerShot(sim, g, a, Math.round(g.damage * steady), i === 0 ? p.gun : null);
  }
  p.mags[p.gun] -= shells;
  if (g.recharge) p.rest[p.gun] = 0;
  p.sprintLock = 0.3;
}

function firePlayerShot(sim, g, angle, damage, sound, heavy = false) {
  const s = sim.state, p = s.player;
  const mx = p.x + Math.cos(angle) * 16, my = p.y + Math.sin(angle) * 16;
  const ti = tileIdx(sim, mx, my);
  const blocked = ti < 0 || sim.cache.flags[ti] & BLOCKS_SHOT;
  const ox = blocked ? p.x : mx, oy = blocked ? p.y : my;
  const speed = g.speed * (g.pellets ? 0.9 + sim.rng.next() * 0.2 : 1);
  spawnBullet(sim, { x: ox, y: oy, angle, speed, damage, owner: 'player', life: g.range / speed, kind: p.gun, stagger: sound !== 'fan' && !g.pellets,
    pierce: g.pierce || 0, robotMul: g.robotMul || 1, chain: g.chain || 0, chainRange: g.chainRange || 0, stun: g.stun || 0, heavy,
    bounce: g.bounce || 0, explode: g.explode || null });
  if (sound) {
    emit(sim, 'shot', { x: mx, y: my, angle, kind: sound === 'fan' ? 'fan' : p.gun, heavy });
    if (s.mode !== 'town') noise(sim, p.x, p.y, g.noise, 'player');
    s.echo.shots.push({ t: s.t, x: ox, y: oy, a: angle });
    p.shotT = s.t;
  }
}

function spawnBullet(sim, b) {
  const s = sim.state;
  s.bullets.push({
    id: s.nextId++, x: b.x, y: b.y, px: b.x, py: b.y,
    vx: Math.cos(b.angle) * b.speed, vy: Math.sin(b.angle) * b.speed,
    damage: b.damage, owner: b.owner, life: b.life, kind: b.kind, stagger: Boolean(b.stagger), src: b.src ?? null, grazed: false,
    pierce: b.pierce || 0, robotMul: b.robotMul || 1, chain: b.chain || 0, chainRange: b.chainRange || 0, stun: b.stun || 0, heavy: Boolean(b.heavy), hit: [],
    bounce: b.bounce || 0, explode: b.explode || null, big: Boolean(b.big), ground: Boolean(b.ground),
  });
}

/** `fromAngle` points from the player toward where the hit came from (for hit indicators). */
function damagePlayer(sim, dmg, src, fromAngle = null) {
  const s = sim.state, p = s.player;
  if (s.phase !== 'playing' || s.mode === 'town') return;
  if (p.iframes > 0) {
    emit(sim, 'dodged', { x: p.x, y: p.y });
    return;
  }
  const md = sim.cache.mods;
  const amount = Math.max(1, Math.round(dmg * (hasGear(s, 'duster') ? 0.8 : 1) * md.armour));
  p.hp = Math.max(0, p.hp - amount);
  p.hurtT = 0.3;
  p.lastHitBy = src ? { kind: src.kind, name: src.name ?? null } : null;
  if (p.hp <= 0 && hasGear(s, 'charm') && !p.charmUsed) {
    p.charmUsed = true;
    p.hp = 1;
    p.iframes = 1.2;
    emit(sim, 'toast', { text: "The rabbit's foot crumbles. You are still standing.", tone: 'warn', long: true });
  }
  if (p.hp <= 0 && md.revive && !p.reviveUsed) {
    p.reviveUsed = true;
    p.hp = Math.min(p.maxHp, 30);
    p.iframes = 1.5;
    emit(sim, 'toast', { text: 'Second wind. You are still standing.', tone: 'warn', long: true });
  }
  emit(sim, 'player_hit', { amount, x: p.x, y: p.y, fromAngle });
}

// ------------------------------------------------------------------ interaction

function nearestInteractable(sim) {
  const s = sim.state, p = s.player;
  let best = null, bestD = Infinity;
  for (const it of s.interactables) {
    if (it.done) continue;
    const range = it.kind === 'exit' ? PLAYER.extractRadius * 0.62 : it.r || PLAYER.interactRange;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d < range && d < bestD) { best = it; bestD = d; }
  }
  return best;
}

function updateInteract(sim, dt, input) {
  const s = sim.state, p = s.player;
  const it = nearestInteractable(sim);
  s.focusId = it ? it.id : 0;
  if (it && it.duration === 0) {
    // press once: exits, shop counters, people, graves
    if (input.interactPressed) {
      if (it.kind === 'exit') {
        if (it.needsClear && !objectiveDone(s)) emit(sim, 'toast', { text: 'The lift is locked down until the floor boss is dealt with.', tone: 'bad' });
        else if (!s.extract.active) startExtraction(sim, it);
      } else if (it.kind === 'gun' || it.kind === 'relic' || it.kind === 'ware') takeItem(sim, it);
      else emit(sim, 'town_interact', { kind: it.kind, shop: it.shop, role: it.role, name: it.name, text: it.text, id: it.id });
    }
    s.interact.id = 0;
    s.interact.t = 0;
    return;
  }
  const working = it && input.interactHeld && !s.extract.active && p.dodgeT <= 0 && p.healT <= 0 && p.fanQueue === 0;
  if (!working) { s.interact.id = 0; s.interact.t = 0; return; }
  if (s.interact.id !== it.id) { s.interact.id = it.id; s.interact.t = 0; }
  s.interact.t += dt;
  if (s.interact.t >= it.duration) {
    completeInteract(sim, it);
    s.interact.id = 0;
    s.interact.t = 0;
  }
}

function addAmmo(sim, kind, n) {
  const s = sim.state, p = s.player;
  const cap = hasGear(s, 'bandolier') ? AMMO[kind].maxBandolier : AMMO[kind].max;
  const got = Math.max(0, Math.min(n, cap - p.ammo[kind]));
  p.ammo[kind] += got;
  return got;
}

function completeInteract(sim, it) {
  const s = sim.state, p = s.player;
  it.done = true;
  const toast = (text, tone = 'good', long = false) => emit(sim, 'toast', { text, tone, long });
  if (it.kind === 'cache') {
    const mult = s.config.character.trait === 'scavenger' ? 1.3 : 1;
    const found = it.loot.map((l) => ({ name: l.name, value: Math.round(l.value * mult) }));
    s.carried.loot.push(...found);
    const bits = found.map((l) => `${l.name} (¢${l.value})`);
    if (it.cartridges) { const n = addAmmo(sim, 'cartridges', it.cartridges); if (n) bits.push(`${n} cartridges`); }
    if (it.shells) { const n = addAmmo(sim, 'shells', it.shells); if (n) bits.push(`${n} shells`); }
    if (it.bandage && p.bandages < CARRY.bandages) { p.bandages += 1; bits.push('a bandage'); }
    // the better the cache, the better the odds of a gun or a relic beside it
    if (it.tier >= 2 || (it.tier === 1 && sim.rng.chance(0.5)) || (it.tier === 0 && sim.rng.chance(0.12))) {
      const d = rollDrop(sim, sim.cache.mods.luck * (1 + it.tier * 0.5));
      if (d) { const a = Math.atan2(p.y - it.y, p.x - it.x); dropItem(sim, it.x + Math.cos(a) * 30, it.y + Math.sin(a) * 30, d); bits.push(d.gun ? `a ${GUNS[d.gun].name.toLowerCase()}` : RELICS[d.relic].name.toLowerCase()); }
    }
    if (it.dynamite) {
      const cap = hasGear(s, 'bandolier') ? CARRY.dynamiteBandolier : CARRY.dynamite;
      const n = Math.min(it.dynamite, cap - p.dynamite);
      if (n > 0) { p.dynamite += n; bits.push(n > 1 ? `${n} sticks of dynamite` : 'a stick of dynamite'); }
    }
    emit(sim, 'loot', { x: it.x, y: it.y, value: found.reduce((a, l) => a + l.value, 0), text: bits.join(', '), id: it.id });
  } else if (it.kind === 'objective') {
    const obj = s.config.objective || {};
    switch (it.item) {
      case 'stake':
      case 'relay': {
        s.burned += 1;
        s.lights.push({ x: it.x, y: it.y, kind: 'fire', r: 130, t: 12 });
        noise(sim, it.x, it.y, it.item === 'relay' ? 700 : 420, 'player');
        if (it.item === 'relay') {
          toast(`Relay overloaded (${Math.min(s.burned, obj.count ?? 3)}/${obj.count ?? 3}). Machines nearby lock up, and the rest know where you are.`);
          for (const e of s.enemies) if (!e.dead && ENEMIES[e.kind].robot && Math.hypot(e.x - it.x, e.y - it.y) < 520) e.stunT = Math.max(e.stunT || 0, 5);
        } else toast(`Survey beacon burning (${Math.min(s.burned, obj.count ?? 3)}/${obj.count ?? 3}). The smoke is tripping alarms.`);
        break;
      }
      case 'shard': {
        s.carried.items.push('shard');
        s.echo.delay = ECHO.shardDelay;
        toast('The shard is cold as a grave. Your echo is closer now.', 'bad', true);
        for (let i = 0; i < 4; i++) {
          const spot = findSpawn(sim, 300, 520);
          if (spot) addEnemy(sim, 'walker', spot.x, spot.y);
        }
        break;
      }
      case 'strongbox':
        s.carried.items.push('strongbox');
        toast('Freight case on your shoulder. It is heavy: no sprinting. Get it to the lift or the tram stop.', 'story', true);
        break;
      case 'payroll':
        s.carried.items.push('payroll');
        toast('Payroll case on your shoulder. It slows you down.', 'story');
        break;
      case 'ledger':
        s.carried.items.push('ledger');
        toast('The Site 9 ledger. Unit numbers, dates, and a column of names headed INTAKE. Get it home.', 'story', true);
        break;
      case 'borekey':
        s.carried.items.push('borekey');
        toast('The bore key. Something below heard you take it.', 'bad', true);
        for (const e of s.enemies) if (e.state === 'dormant') wake(sim, e);
        for (let i = 0; i < 3; i++) { const spot = findSpawn(sim, 260, 480); if (spot) addEnemy(sim, 'husk', spot.x, spot.y); }
        break;
      case 'medicine': {
        s.carried.items.push('medicine');
        const have = s.carried.items.filter((k) => k === 'medicine').length;
        toast(`Medicine crate ${have}/${obj.count ?? 3}.`);
        break;
      }
      default:
        s.carried.items.push(it.item);
        toast(`${ITEMS[it.item]?.label ?? 'Item'} recovered.`);
    }
    if (objectiveDone(s) && it.item !== 'shard' && it.item !== 'borekey') toast('Job done. Reach an exit: the lift you came in by, or the tram stop.', 'good');
  }
  emit(sim, 'interact_done', { kind: it.kind, item: it.item, x: it.x, y: it.y, id: it.id });
}

/** Is what the job asked for done (still needs carrying home)? */
export function objectiveDone(s) {
  const o = s.config.objective || {};
  if (o.kind === 'item') return s.carried.items.includes(o.item);
  if (o.kind === 'collect') return s.carried.items.filter((k) => k === o.item).length >= o.count;
  if (o.kind === 'burn') return s.burned >= o.count;
  if (o.kind === 'kill') return s.targetKilled;
  return false;
}

const EXIT_TEXT = {
  horse: 'Calling the lift. Stay inside the circle.',
  coach: 'Tram signalled. It is coming. Stay inside the circle.',
  lift: 'Ringing for the lift. Stay on the platform.',
  ladder: 'Climbing the vent shaft. Hold on.',
};

function startExtraction(sim, it) {
  const s = sim.state;
  s.extract = { active: true, t: 0, id: it.id };
  noise(sim, it.x, it.y, 460, 'player');
  emit(sim, 'extract_start', { x: it.x, y: it.y, variant: it.variant });
  emit(sim, 'toast', { text: EXIT_TEXT[it.variant] || EXIT_TEXT.horse, tone: 'warn' });
}

function updateExtraction(sim, dt, input) {
  const s = sim.state, p = s.player, x = s.extract;
  if (!x.active) return false;
  const it = s.interactables.find((i) => i.id === x.id);
  if (input.interactPressed && x.t > 0.25) {
    x.active = false;
    emit(sim, 'extract_cancel', { reason: 'You stopped.' });
    return false;
  }
  if (!it || Math.hypot(it.x - p.x, it.y - p.y) > PLAYER.extractRadius) {
    x.active = false;
    emit(sim, 'extract_cancel', { reason: 'You left the circle. Start again.' });
    return false;
  }
  x.t += dt;
  if (x.t >= PLAYER.extractTime && p.hp > 0) {
    endExpedition(sim, 'extracted');
    return true;
  }
  return false;
}

function updatePickups(sim) {
  const s = sim.state, p = s.player;
  s.pickups = s.pickups.filter((k) => {
    if (Math.hypot(k.x - p.x, k.y - p.y) > (sim.cache.mods.magnet ? 230 : PLAYER.pickupRange)) return true;
    if (k.kind === 'ammo') {
      const n = addAmmo(sim, k.ammo, k.amount);
      if (n <= 0) return true;
      emit(sim, 'pickup', { x: k.x, y: k.y, text: `+${n} ${k.ammo}`, what: 'ammo' });
      return false;
    }
    if (k.kind === 'cash') {
      const n = Math.round(k.amount * sim.cache.mods.coin);
      s.coin += n;
      emit(sim, 'pickup', { x: k.x, y: k.y, text: `+${n} coin`, what: 'cash' });
      return false;
    }
    if (k.kind === 'heart') {
      if (p.hp >= p.maxHp) return true;
      p.hp = Math.min(p.maxHp, p.hp + k.amount);
      emit(sim, 'pickup', { x: k.x, y: k.y, text: `+${k.amount} health`, what: 'heart' });
      return false;
    }
    if (k.kind === 'pulse') {
      p.pulses += 1;
      emit(sim, 'pickup', { x: k.x, y: k.y, text: '+1 pulse', what: 'pulse' });
      return false;
    }
    if (k.kind === 'effects') {
      const victims = s.config.bounty?.victims ?? [];
      s.carried.effects = { victims };
      emit(sim, 'pickup', { x: k.x, y: k.y, text: 'Kit recovered', what: 'effects' });
      emit(sim, 'toast', { text: 'You have your kit back. Get it home.', tone: 'good' });
      return false;
    }
    return true;
  });
}

// ------------------------------------------------------------------ enemies

const HOT = { engage: 1, flare: 1, retreat: 1, dash: 1 };

function wake(sim, e) {
  if (e.state !== 'dormant') return;
  e.state = 'engage';
  e.stateT = 0;
  emit(sim, 'wake', { id: e.id, x: e.x, y: e.y });
}

function noise(sim, x, y, radius, source) {
  const s = sim.state;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const ai = ENEMIES[e.kind].ai;
    if (ai === 'none') continue;
    if (Math.hypot(e.x - x, e.y - y) > radius) continue;
    if (e.state === 'dormant') { if (source === 'player') wake(sim, e); continue; }
    if (ai === 'swarm') continue;
    if (HOT[e.state]) {
      if (source === 'player') { e.lastX = x; e.lastY = y; }
      continue;
    }
    e.state = 'investigate';
    e.stateT = 0;
    e.arrivedT = 0;
    e.targetX = x + sim.rng.range(-28, 28);
    e.targetY = y + sim.rng.range(-28, 28);
    e.path = null;
    e.suspicion = Math.max(e.suspicion, 0.4);
    emit(sim, 'heard', { id: e.id });
  }
}

function alertEnemy(sim, e, x, y, shout = true) {
  const s = sim.state;
  const def = ENEMIES[e.kind];
  if (def.ai === 'none') return;
  const calm = !HOT[e.state];
  e.suspicion = 1;
  e.lastX = x; e.lastY = y;
  e.lastSeenT = s.t;
  e.path = null;
  if (def.ai === 'scout' && !e.flared) {
    e.flared = true;
    e.state = 'flare';
    e.stateT = 0;
    e.atk.t = 1.3;
    emit(sim, 'flare_windup', { id: e.id, x: e.x, y: e.y });
  } else if (calm) {
    e.state = 'engage';
    e.stateT = 0;
    if (def.boss && def.taunt) emit(sim, 'toast', { text: def.taunt, tone: 'bad', long: true });
  }
  if (calm) emit(sim, 'alert', { id: e.id, x: e.x, y: e.y });
  if (shout && calm) {
    for (const o of s.enemies) {
      if (o === e || o.dead || HOT[o.state] || o.state === 'dormant') continue;
      const oai = ENEMIES[o.kind].ai;
      if (oai === 'swarm' || oai === 'none') continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) < 300) alertEnemy(sim, o, x, y, false);
    }
  }
}

function perceive(sim, e, def) {
  const s = sim.state, p = s.player;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  const toP = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.state === 'dormant') {
    if (d < 300 && hasLOS(sim, e.x, e.y, p.x, p.y)) wake(sim, e);
    return;
  }
  if (def.ai === 'swarm') {
    e.seesPlayer = d < 440 && hasLOS(sim, e.x, e.y, p.x, p.y);
    e.lastX = p.x; e.lastY = p.y;
    e.lastSeenT = s.t;
    e.state = 'engage';
    return;
  }
  const hot = Boolean(HOT[e.state]);
  const range = def.sight * (1 - 0.4 * darkness(sim)) * (hot ? 1.3 : 1) * (p.sprinting ? 1.15 : 1);
  const sees = d < range && hasLOS(sim, e.x, e.y, p.x, p.y);
  e.seesPlayer = sees && hot;
  if (sees) {
    if (hot) { e.lastX = p.x; e.lastY = p.y; e.lastSeenT = s.t; return; }
    const calm = e.state === 'idle' || e.state === 'patrol' || e.state === 'return';
    const inCone = Math.abs(angleDiff(e.facing, toP)) < 1.05 || d < 76;
    if (inCone || !calm) {
      const rate = (calm ? 1 : 2.2) * (1 + (1 - d / range) * 1.6);
      e.suspicion = Math.min(1, e.suspicion + (0.1 * rate) / 0.7);
      e.facing = turnToward(e.facing, toP, 0.5);
      if (e.suspicion >= 1) {
        alertEnemy(sim, e, p.x, p.y);
        e.seesPlayer = true;
      } else if (calm && e.suspicion > 0.45) {
        e.state = 'investigate';
        e.stateT = 0;
        e.arrivedT = 0;
        e.targetX = p.x; e.targetY = p.y;
        e.path = null;
        emit(sim, 'heard', { id: e.id });
      }
    }
  } else {
    if (e.state === 'idle' || e.state === 'patrol' || e.state === 'return') e.suspicion = Math.max(0, e.suspicion - 0.03);
    if (e.state === 'engage' && s.t - e.lastSeenT > 1.4 && !def.boss) {
      e.state = 'search';
      e.stateT = 0;
      e.arrivedT = 0;
      e.path = null;
    }
  }
}

function updateEnemies(sim, dt) {
  const s = sim.state, p = s.player;
  for (const e of s.enemies) {
    if (e.dead) continue;
    // far-off, calm enemies tick at a quarter rate
    if (!HOT[e.state] && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > 1500 * 1500) {
      e.skip = (e.skip || 0) + 1;
      if (e.skip % 4) continue;
      updateEnemy(sim, e, dt * 4);
    } else updateEnemy(sim, e, dt);
  }
  separate(sim);
  s.enemies = s.enemies.filter((e) => !e.dead);
}

function updateEnemy(sim, e, dt) {
  const s = sim.state, p = s.player;
  const def = ENEMIES[e.kind];
  e.hitT = Math.max(0, e.hitT - dt);
  if (def.ai === 'none') return;
  if (e.spawnT > 0) { e.spawnT -= dt; return; } // still arriving
  if (e.stunT > 0) { // a machine locked up by lightning or a dead relay
    e.stunT -= dt;
    e.vx *= 0.8; e.vy *= 0.8;
    if (e.atk.phase === 'windup') { e.atk.phase = 'cooldown'; e.atk.t = 0.5; emit(sim, 'staggered', { id: e.id, x: e.x, y: e.y }); }
    return;
  }
  e.stateT += dt;
  e.pathAge += dt;
  e.perceiveT -= dt;
  if (e.perceiveT <= 0) {
    e.perceiveT += 0.1;
    perceive(sim, e, def);
  }
  let move = null;
  let speed = def.speed;
  switch (e.state) {
    case 'dormant':
      break;
    case 'idle': {
      e.lookT -= dt;
      if (e.lookT <= 0) {
        e.lookT = sim.rng.range(1.6, 3.6);
        e.facing = e.baseFacing + sim.rng.range(-1.3, 1.3);
        if (e.route) {
          e.routeI = (e.routeI + 1) % e.route.length;
          [e.targetX, e.targetY] = e.route[e.routeI];
          e.state = 'patrol'; e.stateT = 0; e.path = null;
        } else if (def.ai === 'skirmish' && sim.rng.chance(0.3)) {
          const a = sim.rng.range(0, TAU), dist = sim.rng.range(30, 90);
          e.targetX = e.postX + Math.cos(a) * dist;
          e.targetY = e.postY + Math.sin(a) * dist;
          e.state = 'patrol'; e.stateT = 0; e.path = null;
        }
      }
      break;
    }
    case 'patrol':
    case 'return': {
      const home = e.state === 'return';
      const tx = home ? e.postX : e.targetX, ty = home ? e.postY : e.targetY;
      if (Math.hypot(tx - e.x, ty - e.y) < 14 || e.stateT > (e.route ? 40 : 12) || e.stuckT > 2) {
        e.state = 'idle';
        e.stateT = 0;
        e.stuckT = 0;
        if (home) e.facing = e.baseFacing;
        if (e.route && !home) { e.postX = e.x; e.postY = e.y; e.baseFacing = e.facing; e.lookT = sim.rng.range(2, 4.5); }
        break;
      }
      move = navigate(sim, e, tx, ty);
      speed = def.speed * 0.7;
      break;
    }
    case 'investigate':
    case 'search': {
      const tx = e.state === 'search' ? e.lastX : e.targetX;
      const ty = e.state === 'search' ? e.lastY : e.targetY;
      const arrived = Math.hypot(tx - e.x, ty - e.y) < 20 || e.stuckT > 1.5 || e.stateT > 14;
      if (arrived) {
        if (!e.arrivedT) e.arrivedT = s.t;
        e.lookT -= dt;
        if (e.lookT <= 0) { e.lookT = 0.7; e.facing += sim.rng.range(-1.6, 1.6); }
        if (s.t - e.arrivedT > 2.6) { e.state = 'return'; e.stateT = 0; e.arrivedT = 0; e.path = null; }
      } else {
        move = navigate(sim, e, tx, ty);
        speed = e.state === 'search' ? def.chase * 0.9 : def.speed;
      }
      break;
    }
    case 'flare': {
      e.atk.t -= dt;
      e.facing = turnToward(e.facing, Math.atan2(p.y - e.y, p.x - e.x), 6 * dt);
      if (e.atk.t <= 0) {
        fireFlare(sim, e);
        e.state = 'engage'; e.stateT = 0;
        e.atk.phase = 'cooldown'; e.atk.t = 0.6;
      }
      break;
    }
    case 'retreat': {
      move = { x: e.x - p.x, y: e.y - p.y };
      speed = def.chase;
      if (e.stateT > 2.2) { e.state = 'engage'; e.stateT = 0; }
      break;
    }
    case 'dash': {
      // a committed charge along a fixed line
      const w = WEAPONS.e_charge;
      e.atk.t -= dt;
      const ox = e.x, oy = e.y;
      e.vx = Math.cos(e.atk.angle) * w.dashSpeed; e.vy = Math.sin(e.atk.angle) * w.dashSpeed;
      moveBody(sim, e, e.vx * dt, e.vy * dt);
      const hitWall = Math.hypot(e.x - ox, e.y - oy) < w.dashSpeed * dt * 0.4;
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r + 6 && !e.atk.shots) {
        e.atk.shots = 1;
        damagePlayer(sim, w.damage * (def.boss ? 1.3 : 1), { kind: e.kind, name: e.name }, Math.atan2(e.y - p.y, e.x - p.x));
        p.vx += Math.cos(e.atk.angle) * 380; p.vy += Math.sin(e.atk.angle) * 380;
      }
      if (e.atk.t <= 0 || hitWall) {
        e.state = 'engage'; e.stateT = 0;
        e.atk.phase = 'cooldown'; e.atk.t = hitWall ? w.cooldown + 0.7 : w.cooldown;
        e.vx *= 0.2; e.vy *= 0.2;
        if (hitWall) emit(sim, 'stagger', { x: e.x, y: e.y });
      }
      return;
    }
    case 'engage': {
      const r = engage(sim, e, def, dt);
      move = r.move;
      speed = r.speed;
      break;
    }
    default:
      e.state = 'idle';
  }

  if (move && (move.x || move.y)) {
    const len = Math.hypot(move.x, move.y) || 1;
    const k = Math.min(1, 10 * dt);
    e.vx += ((move.x / len) * speed - e.vx) * k;
    e.vy += ((move.y / len) * speed - e.vy) * k;
    if (!(e.state === 'engage' && e.seesPlayer)) e.facing = turnToward(e.facing, Math.atan2(e.vy, e.vx), 7 * dt);
  } else {
    const k = Math.max(0, 1 - 10 * dt);
    e.vx *= k;
    e.vy *= k;
  }
  const ox = e.x, oy = e.y;
  moveBody(sim, e, e.vx * dt, e.vy * dt);
  if (move && Math.hypot(e.x - ox, e.y - oy) < speed * dt * 0.2) {
    e.stuckT += dt;
    if (e.stuckT > 0.8) e.path = null;
  } else e.stuckT = Math.max(0, e.stuckT - dt);
}

function chase(sim, e) {
  const p = sim.state.player;
  if (e.seesPlayer && bodyLineClear(sim, e.x, e.y, p.x, p.y, e.r)) return { x: p.x - e.x, y: p.y - e.y };
  if (ENEMIES[e.kind].ai === 'swarm') return flowDir(sim, e) ?? { x: p.x - e.x, y: p.y - e.y };
  return navigate(sim, e, e.lastX, e.lastY);
}

function strafe(sim, e, dx, dy, d, dt) {
  e.strafeT -= dt;
  if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = sim.rng.range(0.8, 1.8); }
  return { x: (-dy / d) * e.strafe, y: (dx / d) * e.strafe };
}

function beginWindup(sim, e, w, angle, move = 0) {
  e.atk.phase = 'windup';
  e.atk.t = w.windup;
  e.atk.angle = angle;
  e.atk.move = move;
  e.atk.w = w.kind;
  emit(sim, 'windup', { id: e.id, kind: e.kind, weapon: w.kind, x: e.x, y: e.y });
}

function engage(sim, e, def, dt) {
  const s = sim.state, p = s.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  const toP = Math.atan2(dy, dx);
  const sees = e.seesPlayer;
  const atk = e.atk;
  let w = WEAPONS[def.weapon];
  if (def.boss && atk.w && atk.phase !== 'ready' && atk.phase !== 'cooldown') w = bossWeapon(atk.w);
  if (sees) e.facing = turnToward(e.facing, toP, 8 * dt);

  if (atk.phase === 'cooldown') {
    atk.t -= dt;
    if (atk.t <= 0) atk.phase = 'ready';
  }
  if (atk.phase === 'windup') {
    atk.t -= dt;
    // Track the target until the lock window, then hold the line: the dodge cue.
    const lockAt = w.lock ?? 0.12;
    if (sees && atk.t > lockAt) atk.angle = turnToward(atk.angle, toP, (w.kind === 'rifle' ? 3.2 : 2.2) * dt);
    if (atk.t <= 0) releaseAttack(sim, e, def, w);
    return { move: null, speed: 0 };
  }
  if (atk.phase === 'burst') {
    atk.t -= dt;
    if (atk.t <= 0) {
      if (w.kind === 'shotgun') {
        for (let i = 0; i < w.pellets; i++) fireEnemyBullet(sim, e, w, atk.angle + (i / (w.pellets - 1) - 0.5) * 2 * w.spread + (sim.rng.next() - 0.5) * 0.05);
      } else fireEnemyBullet(sim, e, w, atk.angle + (sim.rng.next() * 2 - 1) * (w.spread ?? 0));
      emit(sim, 'enemy_shot', { x: e.x, y: e.y, angle: atk.angle, weapon: w.kind, id: e.id });
      atk.shots -= 1;
      if (atk.shots <= 0) { atk.phase = 'cooldown'; atk.t = w.cooldown; }
      else { atk.t = w.burstGap; if (sees) atk.angle = turnToward(atk.angle, toP, 0.5); }
    }
    return { move: null, speed: 0 };
  }

  let move = null;
  let speed = def.chase;
  const ready = atk.phase === 'ready';
  switch (def.ai) {
    case 'skirmish': {
      const want = def.keep ?? 150;
      if (!sees || d > want) move = chase(sim, e);
      else { move = strafe(sim, e, dx, dy, d, dt); speed = def.speed * 0.6; }
      if (ready && sees && d < w.range * 0.92) beginWindup(sim, e, w, toP);
      break;
    }
    case 'ranged': {
      if (!sees || d > 470) move = chase(sim, e);
      else if (d < 240) { move = { x: -dx, y: -dy }; speed = def.speed; }
      else { move = strafe(sim, e, dx, dy, d, dt); speed = def.speed * 0.55; }
      if (ready && sees && d < w.range) beginWindup(sim, e, w, toP);
      break;
    }
    case 'scout': {
      if (!sees || d > 340) move = chase(sim, e);
      else if (d < 200) move = { x: -dx, y: -dy };
      else move = strafe(sim, e, dx, dy, d, dt);
      if (ready && sees && d < w.range) beginWindup(sim, e, w, toP);
      break;
    }
    case 'lobber': {
      if (!sees || d > w.range * 0.95) move = chase(sim, e);
      else if (d < 210) { move = { x: -dx, y: -dy }; speed = def.chase; }
      else { move = strafe(sim, e, dx, dy, d, dt); speed = def.speed * 0.5; }
      if (ready && sees && d < w.range && d > 110) beginWindup(sim, e, w, toP);
      break;
    }
    case 'charger': {
      move = chase(sim, e);
      if (ready && sees && d < w.range && d > 60 && bodyLineClear(sim, e.x, e.y, p.x, p.y, e.r)) beginWindup(sim, e, w, toP);
      else if (ready && d < 56) beginWindup(sim, e, WEAPONS.claw, toP);
      break;
    }
    case 'swarm': {
      move = chase(sim, e);
      if (ready && d < w.range + p.r) beginWindup(sim, e, w, toP);
      break;
    }
    case 'boss': {
      // call for help as the fight turns
      const frac = e.hp / e.maxHp;
      if ((frac < 0.66 && e.summons === 0) || (frac < 0.33 && e.summons === 1)) {
        e.summons += 1;
        let n = 0;
        for (let i = 0; i < 2; i++) {
          const spot = findSpawn(sim, 330, 600);
          if (!spot) continue;
          alertEnemy(sim, addEnemy(sim, e.summons === 1 ? 'guard' : 'enforcer', spot.x, spot.y), p.x, p.y, false);
          n++;
        }
        emit(sim, 'boss_phase', { phase: e.summons, x: e.x, y: e.y });
        emit(sim, 'toast', { text: e.kind === 'foreman' ? (n ? 'Voss calls units down. More are coming.' : 'Voss is leaking coolant, and angrier for it.') : (n ? 'The Overseer calls units off the line. More are coming.' : 'The Overseer is sparking, and faster for it.'), tone: 'bad' });
      }
      if (!sees || d > 300) move = chase(sim, e);
      else if (d < 120) { move = strafe(sim, e, dx, dy, d, dt); speed = def.speed; }
      else { move = strafe(sim, e, dx, dy, d, dt); speed = def.speed * 0.7; }
      if (ready && sees) {
        const roll = sim.rng.next();
        const clear = bodyLineClear(sim, e.x, e.y, p.x, p.y, e.r);
        if (d > 330) beginWindup(sim, e, bossWeapon(roll < 0.35 ? 'dynamite' : roll < 0.6 ? 'fan' : roll < 0.8 ? 'ring' : 'charge'), toP);
        else if (d > 130) beginWindup(sim, e, bossWeapon(roll < 0.3 ? 'shotgun' : roll < 0.5 ? 'fan' : roll < 0.68 ? 'ring' : roll < 0.84 && clear ? 'charge' : 'dynamite'), toP);
        else beginWindup(sim, e, bossWeapon(roll < 0.6 || !clear ? 'shotgun' : 'charge'), toP);
      }
      break;
    }
    default:
      break;
  }
  return { move, speed };
}

const BOSS_WEAPONS = {
  shotgun: { kind: 'shotgun', range: 300, windup: 0.62, cooldown: 1.25, pellets: 7, spread: 0.3, damage: 9, speed: 720, life: 0.42, noise: 500, burst: 2, burstGap: 0.42 },
  dynamite: { kind: 'dynamite', range: 520, windup: 0.7, cooldown: 2.0, flight: 0.9, fuse: 0.6, radius: 96, damage: 32, noise: 700, count: 3 },
  charge: { kind: 'charge', range: 420, windup: 0.8, cooldown: 1.9, dash: 0.7, dashSpeed: 430, damage: 30, reach: 34 },
  ring: { kind: 'ring', range: 700, windup: 0.7, cooldown: 1.5, count: 18, damage: 11, speed: 340, life: 2.2, noise: 500, big: true },
  fan: { kind: 'fan', range: 700, windup: 0.6, cooldown: 1.3, count: 9, arc: 1.3, damage: 11, speed: 420, life: 1.9, noise: 500, big: true },
};
function bossWeapon(kind) { return BOSS_WEAPONS[kind] || BOSS_WEAPONS.shotgun; }

function releaseAttack(sim, e, def, w) {
  const s = sim.state, p = s.player;
  const atk = e.atk;
  atk.phase = 'cooldown';
  atk.t = w.cooldown;
  switch (w.kind) {
    case 'shotgun':
      if (w.burst) { atk.phase = 'burst'; atk.shots = w.burst; atk.t = 0; return; }
      for (let i = 0; i < w.pellets; i++) fireEnemyBullet(sim, e, w, atk.angle + (i / (w.pellets - 1) - 0.5) * 2 * w.spread + (sim.rng.next() - 0.5) * 0.05);
      break;
    case 'rifle':
    case 'pulse':
      fireEnemyBullet(sim, e, w, atk.angle);
      break;
    case 'fan':
      for (let i = 0; i < w.count; i++) fireEnemyBullet(sim, e, w, atk.angle + (i / (w.count - 1) - 0.5) * w.arc);
      break;
    case 'ring':
      for (let i = 0; i < w.count; i++) fireEnemyBullet(sim, e, w, atk.angle + (i / w.count) * TAU);
      break;
    case 'pistol':
      fireEnemyBullet(sim, e, w, atk.angle + (sim.rng.next() * 2 - 1) * w.spread);
      break;
    case 'revolver':
    case 'smg':
      atk.phase = 'burst'; atk.shots = w.burst; atk.t = 0;
      return;
    case 'dynamite': {
      const n = w.count || 1;
      for (let i = 0; i < n; i++) {
        // lead the target a little; extra sticks land around it
        const lead = 0.35;
        let tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
        if (i > 0) { const a = sim.rng.range(0, TAU), r = sim.rng.range(70, 130); tx += Math.cos(a) * r; ty += Math.sin(a) * r; }
        let dx = tx - e.x, dy = ty - e.y;
        let d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        d = Math.min(d, w.range * 1.1, castRay(sim, e.x, e.y, dx, dy, d + 20, BLOCKS_SHOT) - 8);
        s.bombs.push({ id: s.nextId++, owner: 'enemy', src: { kind: e.kind, name: e.name }, x0: e.x, y0: e.y, x: e.x + dx * d, y: e.y + dy * d, t: 0, flight: w.flight + i * 0.12, fuse: w.fuse, r: w.radius, damage: w.damage, landed: false });
      }
      emit(sim, 'throw', { x: e.x, y: e.y, enemy: true });
      return;
    }
    case 'charge':
      e.state = 'dash';
      e.stateT = 0;
      atk.phase = 'dash';
      atk.t = w.dash;
      atk.shots = 0;
      emit(sim, 'charge', { id: e.id, x: e.x, y: e.y, angle: atk.angle });
      return;
    case 'claw': {
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      const off = Math.abs(angleDiff(atk.angle, Math.atan2(p.y - e.y, p.x - e.x)));
      emit(sim, 'claw', { x: e.x, y: e.y, angle: atk.angle, id: e.id });
      if (d < w.reach + p.r + (e.r - 11) && off < w.arc) damagePlayer(sim, w.damage * (def.ai === 'charger' ? 1.5 : 1), { kind: e.kind, name: e.name }, Math.atan2(e.y - p.y, e.x - p.x));
      return;
    }
    default:
      return;
  }
  emit(sim, 'enemy_shot', { x: e.x, y: e.y, angle: atk.angle, weapon: w.kind, id: e.id });
  noise(sim, e.x, e.y, w.noise ?? 300, 'enemy');
}

function fireEnemyBullet(sim, e, w, angle) {
  spawnBullet(sim, {
    x: e.x + Math.cos(angle) * (e.r + 3), y: e.y + Math.sin(angle) * (e.r + 3), angle,
    speed: w.speed, damage: w.damage, owner: 'enemy', life: w.life ?? w.range / w.speed, kind: w.kind, big: w.big, ground: w.kind === 'ring',
    src: { kind: e.kind, name: e.name },
  });
}

function fireFlare(sim, e) {
  const s = sim.state, p = s.player;
  s.lights.push({ x: e.x, y: e.y, kind: 'flare', r: 320, t: 5 });
  emit(sim, 'flare', { x: e.x, y: e.y });
  emit(sim, 'toast', { text: 'A flare! Every unit nearby knows where you are.', tone: 'bad' });
  for (const o of s.enemies) {
    if (o === e || o.dead || o.state === 'dormant') continue;
    const ai = ENEMIES[o.kind].ai;
    if (ai === 'swarm' || ai === 'none') continue;
    if (Math.hypot(o.x - e.x, o.y - e.y) > 1300) continue;
    alertEnemy(sim, o, p.x, p.y, false);
  }
  for (let i = 0; i < 2; i++) {
    const spot = findSpawn(sim, 330, 620);
    if (!spot) continue;
    const r = addEnemy(sim, 'bandit', spot.x, spot.y);
    alertEnemy(sim, r, p.x, p.y, false);
  }
}

function damageEnemy(sim, e, dmg, ang, stagger = false) {
  const s = sim.state, p = s.player;
  const def = ENEMIES[e.kind];
  if (def.ai === 'none') {
    // a practice target: knock it over, stand it up again later
    e.dead = true;
    s.respawns.push({ kind: e.kind, x: e.x, y: e.y, t: e.respawn || 3, respawn: e.respawn || 3 });
    emit(sim, 'target_hit', { x: e.x, y: e.y, angle: ang });
    return;
  }
  e.hp -= dmg;
  e.hitT = 0.12;
  emit(sim, 'enemy_hit', { x: e.x, y: e.y, angle: ang, kind: e.kind, amount: Math.round(dmg), id: e.id });
  if (e.hp <= 0) { killEnemy(sim, e, ang); return; }
  if (e.state === 'dormant') wake(sim, e);
  if (!def.boss && def.ai !== 'charger' && !def.rooted) { e.vx += Math.cos(ang) * 70; e.vy += Math.sin(ang) * 70; }
  if (stagger && !def.boss && e.kind !== 'bounty' && def.ai !== 'charger' && e.atk.phase === 'windup') {
    e.atk.phase = 'cooldown';
    e.atk.t = 0.45;
    emit(sim, 'stagger', { x: e.x, y: e.y });
  }
  if (e.state === 'flare') e.atk.t += 0.25;
  if (!HOT[e.state]) alertEnemy(sim, e, p.x, p.y);
  else { e.lastX = p.x; e.lastY = p.y; e.lastSeenT = s.t; }
  if (def.ai === 'ranged' && !e.retreated && e.hp < e.maxHp * 0.35) {
    e.retreated = true;
    e.state = 'retreat';
    e.stateT = 0;
  }
}

function killEnemy(sim, e, ang) {
  const s = sim.state, p = s.player;
  const def = ENEMIES[e.kind];
  const flaring = e.state === 'flare';
  e.dead = true;
  e.hp = 0;
  s.kills += 1;
  s.corpses.push({ x: e.x, y: e.y, kind: e.kind, a: ang, t: s.t, facing: e.facing });
  if (s.corpses.length > 40) s.corpses.shift();
  emit(sim, 'enemy_killed', { x: e.x, y: e.y, kind: e.kind, angle: ang, name: e.name, id: e.id, boss: Boolean(def.boss) });
  if (e.kind === 'bounty') {
    s.bountyKilled = true;
    s.pickups.push({ id: s.nextId++, kind: 'effects', x: e.x, y: e.y });
    emit(sim, 'toast', { text: `${e.name || 'The ganger'} is dead. Take back what they took.`, tone: 'good' });
  }
  if (e.target) {
    s.targetKilled = true;
    emit(sim, 'toast', { text: def.boss ? (def.down || 'Target down. Reach an exit.') : 'Target down. Reach an exit.', tone: 'good', long: true });
  }
  if (def.cash) {
    const jit = () => sim.rng.range(-9, 9);
    s.pickups.push({ id: s.nextId++, kind: 'cash', x: e.x + jit(), y: e.y + jit(), amount: sim.rng.int(def.cash[0], def.cash[1]) });
    const md = sim.cache.mods;
    if (md.lifesteal && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + md.lifesteal);
    if (p.hp < p.maxHp && sim.rng.chance(Math.min(0.3, 0.05 * md.luck))) s.pickups.push({ id: s.nextId++, kind: 'heart', x: e.x + jit(), y: e.y + jit(), amount: 15 });
    if (sim.rng.chance(Math.min(0.1, 0.015 * md.luck))) s.pickups.push({ id: s.nextId++, kind: 'pulse', x: e.x + jit(), y: e.y + jit() });
    if (def.boss && !e.room) { const d = rollDrop(sim, 3); if (d) dropItem(sim, e.x, e.y + 34, d); }
    if (sim.rng.chance(Math.min(0.9, 0.62 * md.luck))) {
      const shells = Object.keys(p.mags).some((g) => GUNS[g].ammo === 'shells') && sim.rng.chance(0.4);
      s.pickups.push({ id: s.nextId++, kind: 'ammo', ammo: shells ? 'shells' : 'cartridges', x: e.x + jit(), y: e.y + jit(), amount: shells ? sim.rng.int(3, 5) : sim.rng.int(6, 11) });
    }
  }
  if (flaring) emit(sim, 'toast', { text: 'Scout down before the flare went up.', tone: 'good' });
  if (s.boss === e.id) s.boss = null;
}

function separate(sim) {
  const s = sim.state, p = s.player;
  const list = s.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead || ENEMIES[a.kind].ai === 'none') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead || ENEMIES[b.kind].ai === 'none') continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-4) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push;
      b.x += (dx / d) * push; b.y += (dy / d) * push;
      collide(sim, a);
      collide(sim, b);
    }
    const dx = a.x - p.x, dy = a.y - p.y;
    const min = a.r + p.r - 2;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min && d2 > 1e-4 && a.state !== 'dash') {
      const d = Math.sqrt(d2);
      a.x += (dx / d) * (min - d);
      a.y += (dy / d) * (min - d);
      collide(sim, a);
    }
  }
}

function updateRespawns(sim, dt) {
  const s = sim.state;
  s.respawns = s.respawns.filter((r) => {
    r.t -= dt;
    if (r.t > 0) return true;
    const e = addEnemy(sim, r.kind, r.x, r.y, {});
    e.respawn = r.respawn;
    return false;
  });
}

// ------------------------------------------------------------------ bullets and bombs

function updateBullets(sim, dt) {
  const s = sim.state;
  const keep = [];
  for (const b of s.bullets) {
    b.px = b.x;
    b.py = b.y;
    const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 8));
    let alive = true;
    for (let i = 0; i < steps; i++) {
      const nx = b.x + (b.vx * dt) / steps, ny = b.y + (b.vy * dt) / steps;
      if (bulletHits(sim, b, b.x, b.y, nx, ny)) { alive = false; break; }
      const ti = tileIdx(sim, nx, ny);
      if (ti < 0 || sim.cache.flags[ti] & BLOCKS_SHOT) {
        emit(sim, 'impact', { x: nx, y: ny, angle: Math.atan2(b.vy, b.vx), owner: b.owner });
        if (b.explode) burst(sim, b);
        else if (b.bounce > 0 && ti >= 0) {
          // work out which face was hit by trying each axis on its own
          const hx = tileIdx(sim, nx, b.y), hy = tileIdx(sim, b.x, ny);
          const bx = hx < 0 || (sim.cache.flags[hx] & BLOCKS_SHOT), by = hy < 0 || (sim.cache.flags[hy] & BLOCKS_SHOT);
          if (bx || !by) b.vx = -b.vx;
          if (by || !bx) b.vy = -b.vy;
          b.bounce -= 1;
          b.damage *= 1.2;
          b.life = Math.max(b.life, 0.5);
          b.hit = [];
          continue;
        }
        alive = false;
        break;
      }
      b.x = nx;
      b.y = ny;
    }
    b.life -= dt;
    if (alive && b.life > 0) keep.push(b);
  }
  s.bullets = keep;
}

/** A shell bursts: reuse the dynamite blast, with no fuse. */
function burst(sim, b) {
  const s = sim.state;
  s.bombs.push({ id: s.nextId++, owner: 'player', x0: b.x, y0: b.y, x: b.x, y: b.y, t: 1, flight: 0, fuse: 0, r: b.explode.r, damage: b.explode.damage, landed: true });
}

function bulletHits(sim, b, x0, y0, x1, y1) {
  const s = sim.state;
  const md = sim.cache.mods;
  const boost = md.damage * (s.player.hp < s.player.maxHp / 2 ? md.berserk : 1);
  if (b.owner === 'player' || b.owner === 'echo') {
    for (const e of s.enemies) {
      if (e.dead || b.hit.includes(e.id)) continue;
      if (segCircle(x0, y0, x1, y1, e.x, e.y, e.r + 3)) {
        const robot = ENEMIES[e.kind].robot;
        const ang = Math.atan2(b.vy, b.vx);
        if (e.spawnT > 0) continue;
        if (b.explode) { burst(sim, b); return true; }
        damageEnemy(sim, e, b.owner === 'echo' ? ECHO.toEnemy : b.damage * boost * (robot ? b.robotMul * md.robot : 1), ang, b.stagger);
        if (b.stun && robot && !e.dead && !ENEMIES[e.kind].boss) e.stunT = Math.max(e.stunT || 0, b.stun);
        if (b.chain) { // lightning jumps to the nearest enemies in reach, at 60% strength
          let from = e;
          const done = [e.id];
          for (let k = 0; k < b.chain; k++) {
            let next = null, best = b.chainRange;
            for (const o of s.enemies) {
              if (o.dead || done.includes(o.id) || ENEMIES[o.kind].ai === 'none') continue;
              const d = Math.hypot(o.x - from.x, o.y - from.y);
              if (d < best && hasLOS(sim, from.x, from.y, o.x, o.y, BLOCKS_SHOT)) { best = d; next = o; }
            }
            if (!next) break;
            emit(sim, 'arc', { x0: from.x, y0: from.y, x1: next.x, y1: next.y });
            const r2 = ENEMIES[next.kind].robot;
            damageEnemy(sim, next, b.damage * 0.6 * boost * (r2 ? b.robotMul * md.robot : 1), Math.atan2(next.y - from.y, next.x - from.x), false);
            if (b.stun && r2 && !next.dead && !ENEMIES[next.kind].boss) next.stunT = Math.max(next.stunT || 0, b.stun);
            done.push(next.id);
            from = next;
          }
        }
        if (b.pierce > 0) { b.pierce -= 1; b.hit.push(e.id); b.damage *= 0.8; continue; }
        return true;
      }
    }
  }
  if (b.owner === 'enemy' && s.buddy && s.buddy.downT <= 0 && segCircle(x0, y0, x1, y1, s.buddy.x, s.buddy.y, s.buddy.r)) { hurtBuddy(sim, b.damage); return true; }
  if ((b.owner === 'enemy' || b.owner === 'echo') && s.phase === 'playing') {
    const p = s.player;
    if (!(b.ground && p.jumpT > 0) && segCircle(x0, y0, x1, y1, p.x, p.y, b.big ? p.r + 4 : p.r)) {
      if (p.iframes > 0) {
        if (!b.grazed) { b.grazed = true; emit(sim, 'dodged', { x: p.x, y: p.y }); }
        return false;
      }
      damagePlayer(sim, b.owner === 'echo' ? ECHO.toPlayer : b.damage, b.owner === 'echo' ? { kind: 'echo' } : b.src, Math.atan2(-b.vy, -b.vx));
      return true;
    }
  }
  return false;
}

function updateBombs(sim, dt) {
  const s = sim.state, p = s.player;
  const keep = [];
  for (const b of s.bombs) {
    b.t += dt;
    if (!b.landed && b.t >= b.flight) {
      b.landed = true;
      emit(sim, 'bomb_land', { x: b.x, y: b.y, owner: b.owner });
    }
    if (b.t < b.flight + b.fuse) { keep.push(b); continue; }
    emit(sim, 'explosion', { x: b.x, y: b.y, r: b.r, owner: b.owner });
    noise(sim, b.x, b.y, DYNAMITE.noise, b.owner === 'player' ? 'player' : 'enemy');
    s.lights.push({ x: b.x, y: b.y, kind: 'blast', r: 260, t: 0.35 });
    const falloff = (d) => 1 - 0.65 * clamp(d / b.r, 0, 1);
    if (b.owner === 'player') {
      for (const e of s.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d > b.r + e.r || !hasLOS(sim, b.x, b.y, e.x, e.y, BLOCKS_SHOT)) continue;
        damageEnemy(sim, e, b.damage * falloff(d), Math.atan2(e.y - b.y, e.x - b.x), true);
        if (!e.dead && !ENEMIES[e.kind].boss) { e.vx += ((e.x - b.x) / (d || 1)) * 260; e.vy += ((e.y - b.y) / (d || 1)) * 260; }
      }
    }
    const dp = Math.hypot(p.x - b.x, p.y - b.y);
    if (dp < b.r + p.r && hasLOS(sim, b.x, b.y, p.x, p.y, BLOCKS_SHOT)) {
      const dmg = (b.owner === 'player' ? DYNAMITE.selfDamage : b.damage) * falloff(dp);
      damagePlayer(sim, dmg, b.owner === 'player' ? { kind: 'dynamite', name: 'your own dynamite' } : b.src, Math.atan2(b.y - p.y, b.x - p.x));
    }
  }
  s.bombs = keep;
}

// ------------------------------------------------------------------ the Hollow

// ------------------------------------------------------------------ Deputy Tin
// A rebuilt company machine that follows the drifter and shoots at whatever is fighting them.
// Enemies ignore it; stray bullets and blasts can knock it offline for a while.
export const BUDDY = { hp: 60, speed: 300, range: 520, damage: 7, cooldown: 0.85, offline: 14, follow: 70 };
function updateBuddy(sim, dt) {
  const s = sim.state, b = s.buddy, p = s.player;
  if (!b) return;
  b.pathAge += dt;
  if (b.downT > 0) {
    b.downT -= dt; b.moving = false;
    if (b.downT <= 0) { b.hp = BUDDY.hp; emit(sim, 'buddy_up', { x: b.x, y: b.y }); }
    return;
  }
  // heel at the drifter's left hand, out of the line of the camera and the gun
  // Pick the heel point a few times a second, not every frame: a point that moves with every twitch
  // of the aim forces a new path search each frame and makes the machine dither.
  b.goalT = (b.goalT ?? 0) - dt;
  if (b.goalT <= 0 || b.gx === undefined || Math.hypot(b.gx - p.x, b.gy - p.y) > 150) {
    b.goalT = 0.4;
    let gx = p.x + Math.cos(p.aim - Math.PI / 2) * 70 - Math.cos(p.aim) * 26, gy = p.y + Math.sin(p.aim - Math.PI / 2) * 70 - Math.sin(p.aim) * 26;
    if (navIdx(sim, gx, gy) < 0 || !hasLOS(sim, p.x, p.y, gx, gy, SOLID)) { gx = p.x - Math.cos(p.aim) * 40; gy = p.y - Math.sin(p.aim) * 40; }
    b.gx = gx; b.gy = gy;
  }
  const hx = b.gx, hy = b.gy;
  const d = Math.hypot(hx - b.x, hy - b.y);
  if (d > 1100) { // left behind: catch up out of sight
    const q = navIdx(sim, p.x, p.y);
    if (q >= 0) { b.x = p.x - Math.cos(p.aim) * 30; b.y = p.y - Math.sin(p.aim) * 30; collide(sim, b); b.path = null; }
  }
  let target = null, best = BUDDY.range;
  if (s.mode !== 'town') {
    for (const e of s.enemies) {
      if (e.dead || ENEMIES[e.kind].ai === 'none' || !HOT[e.state]) continue;
      const de = Math.hypot(e.x - b.x, e.y - b.y);
      if (de < best && hasLOS(sim, b.x, b.y, e.x, e.y, BLOCKS_SHOT)) { best = de; target = e; }
    }
  }
  // start walking when well out of place, keep walking until nearly there: no flip-flopping at the edge
  const was = b.moving;
  b.moving = false;
  if (d > BUDDY.follow * (target ? 2.2 : was ? 0.3 : 1.0)) {
    const dir = navigate(sim, b, hx, hy);
    if (dir) {
      const l = Math.hypot(dir.x, dir.y) || 1;
      const sp = BUDDY.speed * (d > 320 ? 1.5 : 1);
      moveBody(sim, b, (dir.x / l) * sp * dt, (dir.y / l) * sp * dt);
      b.moving = true;
      if (!target) b.facing = turnToward(b.facing, Math.atan2(dir.y, dir.x), dt * 9);
    }
  } else if (!target) b.facing = turnToward(b.facing, p.aim, dt * 4);
  b.cool -= dt;
  if (target) {
    const a = Math.atan2(target.y - b.y, target.x - b.x);
    b.facing = turnToward(b.facing, a, dt * 10);
    if (b.cool <= 0 && Math.abs(angleDiff(b.facing, a)) < 0.2) {
      b.cool = BUDDY.cooldown;
      const ang = a + (sim.rng.next() - 0.5) * 0.07;
      spawnBullet(sim, { x: b.x + Math.cos(ang) * 14, y: b.y + Math.sin(ang) * 14, angle: ang, speed: 1100, damage: BUDDY.damage, owner: 'player', life: BUDDY.range / 1100, kind: 'buddy' });
      emit(sim, 'buddy_shot', { x: b.x, y: b.y, angle: ang });
    }
  }
}
function hurtBuddy(sim, dmg) {
  const b = sim.state.buddy;
  if (!b || b.downT > 0) return;
  b.hp -= dmg;
  if (b.hp <= 0) { b.downT = BUDDY.offline; emit(sim, 'buddy_down', { x: b.x, y: b.y }); emit(sim, 'toast', { text: 'TIN is offline. It will reboot.', tone: 'bad' }); }
}

function updateEcho(sim) {
  const s = sim.state, p = s.player, E = s.echo;
  E.history.push([s.t, p.x, p.y, p.aim]);
  while (E.history.length && E.history[0][0] < s.t - ECHO.history) E.history.shift();
  const on = haunted(sim);
  if (on && !E.active) {
    E.active = true;
    E.since = s.t;
    emit(sim, 'echo_start');
    if (!E.warned) {
      E.warned = true;
      emit(sim, 'toast', { text: 'The air goes thin. Something walks where you walked, and shoots where you shot.', tone: 'bad', long: true });
    }
  } else if (!on && E.active) {
    E.active = false;
    emit(sim, 'echo_end');
  }
  const ready = E.active && s.t - E.since >= E.delay;
  E.visible = false;
  if (ready) {
    const target = s.t - E.delay;
    for (let i = E.history.length - 1; i >= 0; i--) {
      const h = E.history[i];
      if (h[0] <= target) { E.x = h[1]; E.y = h[2]; E.a = h[3]; E.visible = true; break; }
    }
  }
  const keep = [];
  for (const shot of E.shots) {
    if (shot.t <= s.t - E.delay) {
      if (ready && shot.t >= E.since) {
        spawnBullet(sim, { x: shot.x, y: shot.y, angle: shot.a, speed: 1000, damage: ECHO.toEnemy, owner: 'echo', life: 0.55, kind: 'echo' });
        emit(sim, 'echo_shot', { x: shot.x, y: shot.y, angle: shot.a });
      }
    } else if (shot.t > s.t - ECHO.history) keep.push(shot);
  }
  E.shots = keep;
}

function updateNight(sim) {
  const s = sim.state;
  if (s.noClock) return;
  const tt = clockTime(s);
  const bonus = s.config.sundownBonus ?? 0;
  const dusk = CLOCK.dusk + bonus, night = CLOCK.night + bonus;
  if (!s.warned.dusk && tt >= dusk - 40) {
    s.warned.dusk = true;
    emit(sim, 'toast', { text: 'Lockdown in under a minute. Finish up and get out.', tone: 'warn' });
  }
  if (!s.warned.night && tt >= night) {
    s.warned.night = true;
    s.nextWaveT = s.t + 6;
    emit(sim, 'toast', { text: 'Lockdown. The lights go red, and something is moving.', tone: 'bad' });
    emit(sim, 'nightfall');
  }
  if (s.warned.night && s.t >= s.nextWaveT) {
    s.nextWaveT = s.t + CLOCK.waveEvery;
    const alive = s.enemies.filter((e) => e.kind === 'walker' && !e.dead).length;
    const want = Math.min(CLOCK.maxWalkers - alive, 2 + Math.floor((tt - night) / 90));
    let spawned = 0;
    for (let i = 0; i < want; i++) {
      const spot = findSpawn(sim, 360, 660);
      if (!spot) continue;
      addEnemy(sim, 'walker', spot.x, spot.y);
      spawned += 1;
    }
    if (spawned) emit(sim, 'walkers', { count: spawned });
  }
}

function markExplored(sim) {
  const s = sim.state, p = s.player, L = sim.level;
  const cx = Math.floor(p.x / (TS * MACRO)), cy = Math.floor(p.y / (TS * MACRO));
  const r = darkness(sim) > 0.6 ? 2 : 4;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= L.mw || y >= L.mh) continue;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1) s.explored[y * L.mw + x] = 1;
  }
}

function updateZone(sim) {
  const s = sim.state, p = s.player;
  let name = '';
  let indoor = false;
  for (const z of sim.level.zones) {
    if (p.x >= z.x0 && p.x < z.x1 && p.y >= z.y0 && p.y < z.y1) {
      // the smallest zone wins: a building inside a compound
      if (!name || z.indoor) { name = z.name; indoor = Boolean(z.indoor); }
      if (indoor) break;
    }
  }
  if (name !== s.zone) {
    s.zone = name;
    if (name) emit(sim, 'enter_zone', { name, indoor });
  }
}

function updateSight(sim, dt) {
  const s = sim.state;
  s.sightT -= dt;
  if (s.sightT > 0) return;
  s.sightT = 0.25;
  markExplored(sim);
  const R = Math.min(visionRadius(sim), 900);
  const p = s.player;
  for (const it of s.interactables) {
    if (it.seen) continue;
    if (Math.hypot(it.x - p.x, it.y - p.y) < R && hasLOS(sim, p.x, p.y, it.x, it.y)) { it.seen = true; it.known = true; }
  }
  const spy = hasGear(s, 'spyglass');
  for (const e of s.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    e.spotted = (spy && d < 1440) || (d < R && hasLOS(sim, p.x, p.y, e.x, e.y));
    if (e.spotted && (e.target || e.kind === 'bounty')) e.known = true;
  }
}

function updateLights(s, dt) {
  s.lights = s.lights.filter((l) => {
    if (l.t < 0) return true;
    l.t -= dt;
    return l.t > 0;
  });
}

// ------------------------------------------------------------------ townsfolk

function updateNpcs(sim, dt) {
  const s = sim.state, p = s.player;
  for (const n of s.npcs) {
    const dp = Math.hypot(p.x - n.x, p.y - n.y);
    const near = dp < 110;
    n.moving = false;
    if (near) {
      n.facing = turnToward(n.facing, Math.atan2(p.y - n.y, p.x - n.x), 5 * dt);
    } else if (n.fixed || !n.route) {
      n.facing = turnToward(n.facing, n.baseFacing, 3 * dt);
    } else if (n.waitT > 0) {
      n.waitT -= dt;
    } else {
      const [tx, ty] = n.route[n.routeI];
      if (Math.hypot(tx - n.x, ty - n.y) < 16) {
        n.routeI = (n.routeI + 1) % n.route.length;
        n.waitT = sim.rng.range(1.5, 5);
      } else {
        n.pathAge += dt;
        const mv = navigate(sim, n, tx, ty);
        if (mv) {
          const len = Math.hypot(mv.x, mv.y) || 1;
          const sp = 58;
          n.vx += ((mv.x / len) * sp - n.vx) * Math.min(1, 8 * dt);
          n.vy += ((mv.y / len) * sp - n.vy) * Math.min(1, 8 * dt);
          n.facing = turnToward(n.facing, Math.atan2(n.vy, n.vx), 6 * dt);
          moveBody(sim, n, n.vx * dt, n.vy * dt);
          n.moving = true;
        }
      }
    }
    if (!n.moving) { n.vx = 0; n.vy = 0; }
    // do not let anyone stand inside the player
    if (dp < n.r + p.r && dp > 0.01 && !n.fixed) { n.x += ((n.x - p.x) / dp) * (n.r + p.r - dp); n.y += ((n.y - p.y) / dp) * (n.r + p.r - dp); collide(sim, n); }
  }
  for (const it of s.interactables) {
    if (it.kind !== 'talk') continue;
    const n = s.npcs.find((q) => q.id === it.npc);
    if (n) { it.x = n.x; it.y = n.y; }
  }
}

// ------------------------------------------------------------------ ending

function endExpedition(sim, outcome) {
  const s = sim.state, p = s.player;
  if (s.phase === 'ended') return;
  s.phase = 'ended';
  s.extract.active = false;
  const inMags = (ammo) => GUN_ORDER.reduce((a, g) => a + (p.mags[g] !== undefined && GUNS[g].ammo === ammo ? p.mags[g] : 0), 0);
  s.report = {
    expeditionId: s.config.expeditionId,
    missionId: s.config.missionId,
    outcome,
    done: objectiveDone(s),
    carried: { loot: [...s.carried.loot.map((l) => ({ ...l })), ...(s.coin > 0 ? [{ name: 'Loose coin', value: s.coin }] : [])], items: [...s.carried.items], effects: s.carried.effects },
    floor: s.floor,
    carry: { hp: p.hp, mags: { ...p.mags }, gun: p.gun, relics: [...p.relics], pulses: p.pulses, ammo: { ...p.ammo }, bandages: p.bandages, dynamite: p.dynamite, coin: s.coin, kills: s.kills },
    relics: [...p.relics], guns: Object.keys(p.mags),
    burned: s.burned,
    targetKilled: s.targetKilled,
    killedBy: outcome === 'died' ? p.lastHitBy : null,
    playerHp: p.hp,
    consumables: { cartridges: p.ammo.cartridges + inMags('cartridges'), shells: p.ammo.shells + inMags('shells'), bandages: p.bandages, dynamite: p.dynamite },
    kills: s.kills,
    time: Math.round(s.t),
    bountyKilled: s.bountyKilled,
    hollow: haunted(sim),
  };
  emit(sim, 'ended', { outcome });
}

/** Leave without finishing (used by "give up" in the pause menu): counts as fleeing empty-handed. */
export function abandon(sim) {
  const s = sim.state;
  s.carried = { loot: [], items: [], effects: null };
  endExpedition(sim, 'fled');
}

// ------------------------------------------------------------------ HUD helpers

const EXIT_LABEL = { horse: 'Call the lift home', coach: 'Signal the freight tram', lift: 'Call the lift', ladder: 'Climb the vent shaft' };

export function focusPrompt(sim) {
  const s = sim.state;
  if (s.extract.active) {
    const it = s.interactables.find((i) => i.id === s.extract.id);
    return { kind: 'extracting', label: 'Press again to cancel', progress: s.extract.t / PLAYER.extractTime, x: it?.x ?? 0, y: it?.y ?? 0 };
  }
  const it = s.interactables.find((i) => i.id === s.focusId);
  if (!it) return null;
  let label;
  if (it.kind === 'cache') label = 'Search the cache';
  else if (it.kind === 'gun' || it.kind === 'relic') label = `Take: ${itemName(it)} (${itemBlurb(it)})`;
  else if (it.kind === 'ware') label = `Buy ${itemName(it)} for ${it.price} coin (${itemBlurb(it)})`;
  else if (it.kind === 'exit') label = EXIT_LABEL[it.variant] || 'Leave';
  else if (it.kind === 'objective') label = ITEMS[it.item]?.verb ?? 'Take';
  else if (it.kind === 'shop') label = s.config.shopVerbs?.[it.shop] ?? 'Trade';
  else if (it.kind === 'talk') label = `Talk to ${it.name}`;
  else if (it.kind === 'board') label = 'Read the job board';
  else if (it.kind === 'ride') label = 'Take the lift out';
  else if (it.kind === 'grave') label = 'Read the name';
  else label = 'Use';
  return {
    kind: it.kind, label, hold: it.duration > 0,
    progress: s.interact.id === it.id && it.duration ? s.interact.t / it.duration : 0,
    x: it.x, y: it.y,
  };
}

export function objectiveList(sim) {
  const s = sim.state;
  const o = s.config.objective;
  if (!o) return [];
  const list = [];
  const where = o.zone ? ` (${o.zone})` : '';
  if (o.kind === 'item') list.push({ text: `${ITEMS[o.item].label}${where}`, done: s.carried.items.includes(o.item) });
  else if (o.kind === 'collect') {
    const have = s.carried.items.filter((k) => k === o.item).length;
    list.push({ text: `${ITEMS[o.item].label}s ${Math.min(have, o.count)}/${o.count}`, done: have >= o.count });
  } else if (o.kind === 'burn') list.push({ text: `${o.item === 'relay' ? 'Overload signal relays' : 'Burn survey beacons'} ${Math.min(s.burned, o.count)}/${o.count}`, done: s.burned >= o.count });
  else if (o.kind === 'kill') list.push({ text: `${o.label || 'Kill the target'}${where}`, done: s.targetKilled });
  list.push({ text: objectiveDone(s) ? 'Reach an exit' : 'Then reach an exit', done: false, dim: !objectiveDone(s) });
  const bounty = s.config.bounty;
  if (bounty && o.enemy !== 'bounty' && s.enemies.some((e) => e.kind === 'bounty') || (bounty && s.bountyKilled && o.enemy !== 'bounty')) {
    list.push({ text: `Optional: kill ${bounty.name}`, done: s.bountyKilled, optional: true });
  }
  if (s.bountyKilled) list.push({ text: 'Carry your kit home', done: Boolean(s.carried.effects), optional: o.enemy !== 'bounty' });
  return list;
}

export function unsecuredValue(s) {
  return s.carried.loot.reduce((a, l) => a + l.value, 0) + (s.coin || 0);
}

export function bossState(sim) {
  const s = sim.state;
  if (!s.boss) return null;
  const e = s.enemies.find((q) => q.id === s.boss);
  if (!e || !HOT[e.state]) return null;
  return { name: ENEMIES[e.kind].title || 'Target', hp: e.hp, maxHp: e.maxHp };
}
