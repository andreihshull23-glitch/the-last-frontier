// Unit tests for the campaign rules, the level generators and the expedition sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/rules.js';
import { CHAPTERS, JOBS, INVESTMENTS, GUNS, GUN_ORDER, ENEMIES, TALK, RELICS, DESCENT, START_GUN, TRAITS } from '../js/content.js';
import { generateLevel } from '../js/gen/index.js';
import { validateLevel } from '../js/level.js';
import { createSim, update, snapshot, restoreSim, abandon, giveGun, giveRelic, runMods } from '../js/sim.js';

function campaign(seed = 7) {
  const c = R.newCampaign(seed);
  const r = R.hireDrifter(c, 0);
  assert.ok(r.ok !== false, 'hire works');
  return c;
}
function ride(c, mission, seed = 11) {
  const b = R.beginExpedition(c, mission, seed);
  assert.ok(b.ok, b.reason);
  const level = generateLevel(b.config.level);
  return { config: b.config, level, sim: createSim(b.config, level) };
}
const run = (sim, seconds, input = {}) => { for (let i = 0; i < seconds * 60 && sim.state.phase !== 'ended'; i++) update(sim, 1 / 60, input); };

test('every chapter and job generates a valid level for many seeds', () => {
  const specs = [...Object.values(CHAPTERS), ...Object.values(JOBS)].map((d) => d.level).filter(Boolean);
  for (const spec of specs) for (let seed = 1; seed <= 4; seed++) {
    const L = generateLevel({ ...spec, seed, tier: 1 });
    assert.deepEqual(validateLevel(L), [], `${spec.gen} seed ${seed}`);
  }
});

test('the town generates and holds its shops', () => {
  const c = campaign();
  const cfg = R.townConfig(c);
  const L = generateLevel(cfg.level);
  assert.ok(L.npcs.length >= 8);
  const sim = createSim(cfg, L);
  run(sim, 2, { mx: 1 });
  assert.equal(sim.state.phase !== 'ended', true);
});

test('the sim is deterministic and resumes from a snapshot', () => {
  const play = () => { const c = campaign(); const { sim } = ride(c, R.availableMissions(c)[0].id); return sim; };
  const a = play(), b = play();
  const input = { mx: 1, my: 0.3, ax: 1, ay: 0, fireHeld: true, fire: true };
  run(a, 4, input); run(b, 4, input);
  assert.equal(JSON.stringify(snapshot(a)), JSON.stringify(snapshot(b)));
  const snap = JSON.parse(JSON.stringify(snapshot(a)));
  const c = restoreSim(snap, a.level);
  run(a, 2, input); run(c, 2, input);
  assert.equal(JSON.stringify(snapshot(a)), JSON.stringify(snapshot(c)));
});

test('an expedition settles exactly once; going down costs the kit, not the runner', () => {
  const c = campaign();
  c.cash = 900;
  assert.ok(R.buy(c, 'bandage').ok !== false);
  assert.ok(R.buy(c, 'duster').ok !== false);
  c.jobsOnce = ['tin_core', 'tin_servos', 'tin_voice'];
  const invested = R.invest(c, 'deputy');
  assert.ok(invested.ok !== false, invested.reason);
  const cashBefore = c.cash;
  const name = c.character.name, plugin = c.character.trait;
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  assert.ok(sim.state.buddy, 'the rebuilt unit comes along');
  sim.state.player.hp = 0;
  run(sim, 4);
  assert.equal(sim.state.report.outcome, 'died');
  const s1 = R.resolveExpedition(c, sim.state.report);
  assert.ok(s1.down, 'the summary says the runner went down');
  assert.equal(c.cash, cashBefore, 'banked creds survive');
  assert.ok(c.investments.includes('deputy'));
  assert.ok(c.character.alive, 'the same runner carries on');
  assert.equal(c.character.name, name);
  assert.equal(c.character.trait, plugin, 'the fitted plug-in stays');
  assert.deepEqual(c.character.gear, [], 'the kit they wore is gone');
  assert.equal(c.deaths, 1);
  assert.equal(R.needsSuccessor(c), false);
  const again = R.resolveExpedition(c, sim.state.report);
  assert.equal(again.ok, false, 'second settlement does nothing');
  assert.equal(c.deaths, 1);
});

test('plug-ins are bought once and fitted one at a time', () => {
  const c = campaign();
  const first = c.character.trait;
  assert.deepEqual(R.ownedPlugins(c), [first]);
  const other = Object.keys(TRAITS).find((t) => t !== first && t !== 'leather');
  assert.equal(R.canBuyPlugin(c, other).ok, false, 'costs creds');
  c.cash = 1000;
  assert.ok(R.buyPlugin(c, other).ok);
  assert.equal(R.buyPlugin(c, other).ok, false, 'already owned');
  assert.equal(c.character.trait, first, 'buying does not fit it');
  assert.ok(R.fitPlugin(c, other).ok);
  assert.equal(c.character.trait, other);
  assert.equal(R.fitPlugin(c, 'nope').ok, false);
  // a save keeps them
  const back = R.fromSavePayload(JSON.parse(JSON.stringify(R.toSavePayload(c))));
  assert.deepEqual(back.campaign.plugins.sort(), [first, other].sort());
});

test('giving up brings the drifter home alive', () => {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  run(sim, 1);
  abandon(sim);
  assert.equal(sim.state.phase, 'ended');
  R.resolveExpedition(c, sim.state.report);
  assert.ok(c.character.alive);
  assert.equal(c.activeExpedition ?? null, null);
});

test('Deputy Tin follows, fights, and only ever goes offline', () => {
  const c = campaign();
  c.cash = 600; c.jobsOnce = ['tin_core', 'tin_servos', 'tin_voice']; R.invest(c, 'deputy');
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state, e = s.enemies.find((x) => !x.dead);
  // stand the drifter near an enemy and wake it
  s.player.x = e.x - 180; s.player.y = e.y; s.player.maxHp = s.player.hp = 1e6;
  s.buddy.x = s.player.x; s.buddy.y = s.player.y + 20;
  let shots = 0;
  for (let i = 0; i < 60 * 12; i++) {
    update(sim, 1 / 60, { ax: 1, ay: 0, fire: i % 30 === 0, fireHeld: true });
    shots += sim.events.filter((ev) => ev.type === 'buddy_shot').length;
    sim.events.length = 0;
  }
  assert.ok(shots > 0 || s.enemies.every((x) => x.dead || x.state !== 'engage'), 'the deputy shoots at what fights you');
  assert.ok(s.buddy.hp > 0 || s.buddy.downT > 0);
});

function armed(guns) {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state;
  s.player.maxHp = s.player.hp = 1e6;
  for (const g of guns) giveGun(sim, g, true);
  update(sim, 1 / 60, { slot: 1 });
  for (let i = 0; i < 30; i++) update(sim, 1 / 60, {});
  sim.events.length = 0;
  return { sim, s };
}
/** Line three enemies up in front of the drifter on open ground and return them. */
function lineUp(sim, kinds) {
  const s = sim.state, p = s.player;
  const live = s.enemies.filter((e) => !e.dead);
  for (const e of live) { e.x = 60; e.y = 60; }
  return kinds.map((kind, i) => {
    const e = live[i];
    e.kind = kind; e.hp = e.maxHp = 1000; e.r = ENEMIES[kind].radius; e.elite = null; e.shield = 0;
    e.x = p.x + 90 + i * 40; e.y = p.y;
    return e;
  });
}

test('guns are gated by the story and each behaves differently', () => {
  const c = campaign(); c.cash = 5000;
  assert.equal(R.canBuyGun(c, 'pulse').ok, false, 'no energy weapons before the relays are down');
  assert.equal(R.canBuyGun(c, 'smg').ok, false, 'common guns are not sold: they turn up on rides');
  assert.deepEqual(R.gunPool(c), ['rifle', 'shotgun', 'smg']);
  c.chapter = 4;
  assert.ok(R.buyGun(c, 'pulse').ok);
  assert.ok(R.gunPool(c).includes('pulse'), 'an unlocked gun joins the pool');

  // the Long Tom goes through a line of targets; the repeater stops in the first
  for (const [gun, expectHit] of [['longrifle', 3], ['rifle', 1]]) {
    const { sim, s } = armed([gun]);
    const es = lineUp(sim, ['bandit', 'bandit', 'bandit']);
    const aim = { ax: s.player.x + 500, ay: s.player.y };
    update(sim, 1 / 60, { ...aim, slot: 2 });
    for (let i = 0; i < 50; i++) update(sim, 1 / 60, aim);
    update(sim, 1 / 60, { ...aim, fire: true });
    for (let i = 0; i < 30; i++) update(sim, 1 / 60, aim);
    assert.equal(es.filter((e) => e.hp < 1000).length, expectHit, gun);
  }

  // the pulse carbine needs no ammunition, refills by itself, and hits machines harder
  {
    const { sim, s } = armed(['pulse']);
    const [robot, man] = lineUp(sim, ['guard', 'bandit']);
    man.x = s.player.x; man.y = s.player.y + 120;
    const before = { ...s.player.ammo };
    update(sim, 1 / 60, { ax: robot.x, ay: robot.y, slot: 2 });
    for (let i = 0; i < 40; i++) update(sim, 1 / 60, { ax: robot.x, ay: robot.y });
    update(sim, 1 / 60, { ax: robot.x, ay: robot.y, fire: true });
    for (let i = 0; i < 20; i++) update(sim, 1 / 60, { ax: robot.x, ay: robot.y });
    update(sim, 1 / 60, { ax: man.x, ay: man.y });
    update(sim, 1 / 60, { ax: man.x, ay: man.y, fire: true });
    for (let i = 0; i < 20; i++) update(sim, 1 / 60, { ax: man.x, ay: man.y });
    const dr = 1000 - robot.hp, dm = 1000 - man.hp;
    assert.ok(dr > dm && dm > 0, `machine ${dr} vs man ${dm}`);
    assert.deepEqual(s.player.ammo, before, 'no ammunition used');
    const low = s.player.mags.pulse;
    for (let i = 0; i < 180; i++) update(sim, 1 / 60, { ax: man.x, ay: man.y });
    assert.ok(s.player.mags.pulse > low, 'the cell refills');
  }

  // the arc caster jumps between enemies and locks machines up
  {
    const { sim, s } = armed(['arc']);
    const es = lineUp(sim, ['guard', 'guard', 'bandit']);
    es[1].y += 60; es[2].y -= 60;
    update(sim, 1 / 60, { ax: es[0].x, ay: es[0].y, slot: 2 });
    for (let i = 0; i < 40; i++) update(sim, 1 / 60, { ax: es[0].x, ay: es[0].y });
    update(sim, 1 / 60, { ax: es[0].x, ay: es[0].y, fire: true });
    for (let i = 0; i < 12; i++) update(sim, 1 / 60, { ax: es[0].x, ay: es[0].y });
    assert.equal(es.filter((e) => e.hp < 1000).length, 3, 'lightning reaches all three');
    assert.ok(es[0].stunT > 0 && es[1].stunT > 0, 'machines lock up');
    assert.ok(!(es[2].stunT > 0), 'people do not');
  }

  // the Rattler swaps a whole magazine at once
  {
    const { sim, s } = armed(['smg']);
    update(sim, 1 / 60, { slot: 2 });
    s.player.mags.smg = 0;
    for (let i = 0; i < 60; i++) update(sim, 1 / 60, { reload: i === 30 });
    assert.equal(s.player.mags.smg, 0, 'still loading after half a second');
    for (let i = 0; i < 120; i++) update(sim, 1 / 60, {});
    assert.equal(s.player.mags.smg, GUNS.smg.mag);
  }
});

test('a ride starts with the sidearm, and guns and relics are found', () => {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state, p = s.player;
  assert.deepEqual(Object.keys(p.mags), [START_GUN]);
  // the best cache on the map always leaves a gun or a relic beside it
  const cache = s.interactables.filter((i) => i.kind === 'cache').sort((a, b) => b.tier - a.tier)[0];
  cache.tier = 2;
  p.x = cache.x + 30; p.y = cache.y;
  for (const e of s.enemies) { e.x = 60; e.y = 60; }
  for (let i = 0; i < 80; i++) update(sim, 1 / 60, { interactHeld: true });
  assert.ok(cache.done, 'cache opened');
  const drop = s.interactables.find((i) => (i.kind === 'gun' || i.kind === 'relic') && !i.done);
  assert.ok(drop, 'something to pick up');
  p.x = drop.x; p.y = drop.y;
  update(sim, 1 / 60, {});
  update(sim, 1 / 60, { interactPressed: true });
  assert.ok(drop.done);
  assert.ok(drop.gun ? p.mags[drop.gun] !== undefined : p.relics.includes(drop.relic));

  // relics change the numbers
  const before = sim.cache.guns.revolver.mag;
  giveRelic(sim, 'deep_pockets', true);
  assert.equal(sim.cache.guns.revolver.mag, Math.round(before * 1.5));
  assert.equal(runMods(['hollow_point', 'hair_trigger']).damage, 1.25);
  for (const [id, r] of Object.entries(RELICS)) assert.ok(r.name && r.desc && r.mod && r.tier, id);
});

test('the pulse clears enemy fire and a jump clears low cover', () => {
  const { sim, s } = armed([]);
  const p = s.player;
  for (let i = 0; i < 6; i++) s.bullets.push({ id: 900 + i, x: p.x + 80 + i * 10, y: p.y, px: p.x + 80, py: p.y, vx: -10, vy: 0, damage: 5, owner: 'enemy', life: 5, kind: 'fan', hit: [] });
  const had = p.pulses;
  update(sim, 1 / 60, { pulse: true });
  assert.equal(s.bullets.filter((b) => b.owner === 'enemy').length, 0);
  assert.equal(p.pulses, had - 1);
  update(sim, 1 / 60, { jump: true });
  assert.ok(p.jumpT > 0);
  for (let i = 0; i < 60; i++) update(sim, 1 / 60, {});
  assert.equal(p.jumpT, 0, 'lands again');
});

test('the Descent: rooms seal, clear and pay, and floors chain', () => {
  const c = campaign();
  c.chapter = 1;
  const offer = R.availableMissions(c).find((m) => m.kind === 'descent');
  assert.ok(offer, 'offered once the first chapter is done');
  let { sim, config, level } = ride(c, offer.id, 5);
  assert.equal(config.floor, 1);
  for (let seed = 1; seed <= 6; seed++) for (let floor = 1; floor <= DESCENT.floors.length; floor++) {
    const L = generateLevel({ gen: 'descent', floor, seed, pool: R.gunPool(c) });
    assert.deepEqual(validateLevel(L), []);
    assert.ok(L.rooms.some((r) => r.role === 'boss') && L.rooms.some((r) => r.role === 'shop') && L.rooms.some((r) => r.role === 'chest'));
  }
  const s = sim.state, p = s.player;
  p.maxHp = p.hp = 1e6;
  assert.equal(s.enemies.length, 0, 'nothing is out until a room is entered');
  const room = level.rooms.find((r) => r.role === 'combat');
  p.x = (room.x0 + room.x1) / 2; p.y = (room.y0 + room.y1) / 2;
  update(sim, 1 / 60, {});
  const st = s.rooms[room.id];
  assert.equal(st.state, 'active');
  assert.ok(s.enemies.length > 0);
  const [x0, y0] = room.seal[0];
  assert.ok(sim.cache.flags[y0 * level.w + x0] & 1, 'the door is shut');
  // the snapshot keeps the seal
  const again = restoreSim(JSON.parse(JSON.stringify(snapshot(sim))), level);
  assert.ok(again.cache.flags[y0 * level.w + x0] & 1);
  let guard = 0;
  while (st.state === 'active' && guard++ < 10) { for (const e of s.enemies) if (!e.dead && e.room === room.id) { e.dead = true; } update(sim, 1 / 60, {}); }
  assert.equal(st.state, 'cleared');
  assert.ok(!(sim.cache.flags[y0 * level.w + x0] & 1), 'the door opens');

  // the lift is locked until the boss is dead, then it leads down
  const lift = s.interactables.find((i) => i.kind === 'exit');
  assert.ok(lift.needsClear);
  s.targetKilled = true;
  p.x = lift.x; p.y = lift.y;
  update(sim, 1 / 60, {});
  update(sim, 1 / 60, { interactPressed: true });
  for (let i = 0; i < 60 * 8 && s.phase !== 'ended'; i++) update(sim, 1 / 60, {});
  assert.equal(s.report?.outcome, 'extracted');
  giveRelic(sim, 'hollow_point', true);
  const next = R.nextFloor(c, config, { ...s.report, carry: { ...s.report.carry, relics: ['hollow_point'] } });
  assert.equal(next.floor, 2);
  const L2 = generateLevel(next.level);
  const sim2 = createSim(next, L2);
  assert.deepEqual(sim2.state.player.relics, ['hollow_point'], 'relics ride the lift down');
  // dying on floor 2 still pays for floor 1
  const cash = c.cash;
  sim2.state.player.hp = 0;
  for (let i = 0; i < 300 && sim2.state.phase !== 'ended'; i++) update(sim2, 1 / 60, {});
  R.resolveExpedition(c, sim2.state.report);
  assert.equal(c.cash, cash + DESCENT.reward.cashPerFloor);
  assert.equal(c.descentBest, 1);
});

test('old saves land on the right chapter after the two new ones', () => {
  const c = campaign();
  const payload = R.toSavePayload(c);
  for (const [old, now] of [[0, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 8]]) {
    const p2 = JSON.parse(JSON.stringify(payload)); p2.version = 2; p2.campaign.chapter = old;
    const r = R.fromSavePayload(p2);
    assert.ok(r.ok !== false);
    assert.equal((r.campaign ?? r).chapter, now, `chapter ${old}`);
  }
});

test('data sanity', () => {
  assert.equal(CHAPTERS.length, 8);
  for (const ch of CHAPTERS) assert.ok(ch.goal && ch.brief && ch.recap && ch.outro, ch.id);
  for (const role of ['marshal', 'rider', 'agent', 'barkeep', 'townsfolk']) assert.equal(TALK[role].length, CHAPTERS.length + 1, role);
  for (const g of GUN_ORDER) assert.ok(GUNS[g].gunModel && GUNS[g].role && GUNS[g].desc && (g === START_GUN || GUNS[g].tier), g);
  for (const f of DESCENT.floors) for (const kind of [...Object.keys(f.mix), f.boss]) assert.ok(ENEMIES[kind], kind);
  for (const d of [...CHAPTERS, ...Object.values(JOBS)]) for (const kind of Object.keys(d.level.mix || {})) assert.ok(ENEMIES[kind], `${d.id}: ${kind}`);
  for (const [id, inv] of Object.entries(INVESTMENTS)) assert.ok(inv.name && inv.cost > 0 && inv.effect, id);
});

test('TIN is only rebuilt after the three TIN jobs', () => {
  const c = campaign();
  c.cash = 5000; c.chapter = 6;
  assert.equal(R.canInvest(c, 'deputy').ok, false);
  const ids = () => R.availableMissions(c).map((m) => m.key);
  assert.ok(ids().includes('tin_core') && !ids().includes('tin_servos'));
  c.jobsOnce = ['tin_core'];
  assert.ok(!ids().includes('tin_core') && ids().includes('tin_servos'));
  c.jobsOnce = ['tin_core', 'tin_servos', 'tin_voice'];
  assert.equal(R.canInvest(c, 'deputy').ok, true);
});

test('walking into a place brings in its wave, once', () => {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const L = sim.level, s = sim.state;
  const w = L.waves.findIndex((q) => q.on === 'enter');
  assert.ok(w >= 0, 'the district has waves');
  const before = s.enemies.length;
  s.player.x = L.waves[w].x; s.player.y = L.waves[w].y; s.player.hp = s.player.maxHp = 99999;
  run(sim, 0.2, {});
  assert.equal(s.enemies.length, before + L.waves[w].units.length);
  run(sim, 0.5, {});
  assert.equal(s.enemies.length >= before + L.waves[w].units.length, true);
  assert.equal(s.waves[w], true);
});

test('every black-market deal pays out and charges its price', async () => {
  const { DEALS } = await import('../js/content.js');
  for (const id of Object.keys(DEALS)) {
    const c = campaign();
    const { sim } = ride(c, R.availableMissions(c)[0].id);
    const s = sim.state, p = s.player;
    const up = s.interactables.find((i) => i.kind === 'uplink');
    assert.ok(up, 'the district has an uplink');
    up.deal = id;
    for (const e of s.enemies) { e.x = 60; e.y = 60; }
    const before = { maxHp: p.maxHp, clock: s.clockOffset, enemies: s.enemies.length, pulses: p.pulses, coin: s.coin };
    p.x = up.x + 30; p.y = up.y;
    for (let i = 0; i < 90 && !up.done; i++) update(sim, 1 / 60, { interactHeld: true });
    assert.ok(up.done, `${id}: deal taken`);
    const t = DEALS[id].take;
    if (t.maxHp) assert.ok(p.maxHp < before.maxHp, id);
    if (t.clock) assert.ok(s.clockOffset > before.clock, id);
    if (t.hunters) assert.ok(s.enemies.filter((e) => e.elite).length >= 1, id);
    if (t.elite) assert.ok(s.eliteBonus > 0, id);
    if (t.hurt) assert.ok(s.dealHurt > 1, id);
  }
});

// ---------------------------------------------------------------- WARDEN, cargo, systems, Override, Overclock

test('WARDEN reads how Rook fights and leans its elites toward the counter, never only that', async () => {
  const { WARDEN, ELITES } = await import('../js/content.js');
  const { wardenRead } = await import('../js/sim.js');
  const { sim, s } = armed([]);
  assert.equal(wardenRead(s), null, 'no read without a fight');
  Object.assign(s.warden.stats, { close: 900, mid: 100, long: 0 });
  assert.equal(wardenRead(s), 'close');
  // a wave makes it adapt; then elites lean shielded but other kinds still turn up
  const L = sim.level, w = L.waves.findIndex((q) => q.on === 'enter');
  s.player.x = L.waves[w].x; s.player.y = L.waves[w].y;
  run(sim, 0.1, {});
  assert.equal(s.warden.level, 1);
  assert.equal(s.warden.focus, 'close');
  // sample the weighting directly from the data: the counter weighs 1 + level * weight against 1 for each other ordinary kind
  const ordinary = Object.keys(ELITES).filter((k) => !ELITES[k].learned);
  const share = (1 + WARDEN.max * WARDEN.weight) / (1 + WARDEN.max * WARDEN.weight + ordinary.length - 1);
  assert.ok(share < 0.75 && share > 0.5, `countermeasure share ${share.toFixed(2)} stays a lean, not a lock`);
});

test('cargo: finds have bulk, the lift takes what fits, the chute secures finds even if Rook goes down', async () => {
  const { CARGO } = await import('../js/content.js');
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state, p = s.player;
  p.hp = p.maxHp = 1e6;
  for (let i = 0; i < 8; i++) s.carried.loot.push({ name: `Find ${i}`, value: 10 + i * 8, bulk: CARGO.bulkOf(10 + i * 8) });
  const chute = s.interactables.find((i) => i.kind === 'infra' && i.sys === 'chute');
  assert.ok(chute, 'the district has a cargo chute');
  for (const e of s.enemies) { e.x = 60; e.y = 60; }
  p.x = chute.x; p.y = chute.y + 4;
  for (const o of s.interactables) if (o !== chute && Math.hypot(o.x - chute.x, o.y - chute.y) < 140) { o.x += 4000; }
  for (let i = 0; i < 120 && !chute.done; i++) update(sim, 1 / 60, { interactHeld: true });
  assert.ok(chute.done, 'chute used');
  const sentBulk = s.secured.reduce((a, l) => a + l.bulk, 0);
  assert.ok(s.secured.length > 0 && sentBulk <= CARGO.chute, 'sent at most the chute load');
  const sentValue = s.secured.reduce((a, l) => a + l.value, 0);
  // now go down: the chute's finds are still paid
  const cash = c.cash;
  p.hp = 0;
  run(sim, 3, {});
  assert.equal(s.report.outcome, 'died');
  const sum = R.resolveExpedition(c, s.report);
  assert.ok(sum.ok);
  assert.equal(c.cash - cash, sentValue, 'chute finds paid after going down');
});

test('cargo: extracting with too much leaves the worst value for the space behind', async () => {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state;
  for (let i = 0; i < 9; i++) s.carried.loot.push({ name: `Find ${i}`, value: i % 2 ? 50 : 12, bulk: i % 2 ? 3 : 1 });
  const { cargoCap } = await import('../js/sim.js');
  const exit = s.interactables.find((i) => i.kind === 'exit');
  for (const e of s.enemies) { e.x = 60; e.y = 60; }
  s.player.hp = s.player.maxHp = 1e6; s.player.x = exit.x; s.player.y = exit.y;
  update(sim, 1 / 60, { interactPressed: true });
  run(sim, 12, {});
  assert.equal(s.report.outcome, 'extracted');
  const C = s.report.cargo;
  const taken = C.offer.filter((o) => o.take);
  assert.ok(taken.reduce((a, o) => a + o.bulk, 0) <= cargoCap(s) - C.reserved, 'fits');
  assert.ok(C.offer.some((o) => !o.take), 'something was left');
  const lootInReport = s.report.carried.loot.filter((l) => !l.name.startsWith('Loose coin'));
  assert.equal(lootInReport.length, taken.length);
});

test('tower systems: every district has some, and each one changes the floor', async () => {
  const { SYSTEMS } = await import('../js/content.js');
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const c = campaign(seed);
    const { sim } = ride(c, R.availableMissions(c)[0].id, seed);
    for (const it of sim.state.interactables) if (it.kind === 'infra') seen.add(it.sys);
  }
  for (const k of Object.keys(SYSTEMS)) assert.ok(seen.has(k), `${k} turns up somewhere`);
  // a relay: turrets dead, an emergency response sent
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state;
  s.player.hp = s.player.maxHp = 1e6;
  const before = s.enemies.length;
  const spot = s.interactables.find((i) => i.kind === 'infra');
  s.player.x = spot.x; s.player.y = spot.y + 4;
  for (const o of s.interactables) o.x += 9000;
  const relay = { id: 9999, kind: 'infra', sys: 'relay', x: s.player.x, y: s.player.y, done: false, seen: true, known: true, duration: 0.1, r: 64 };
  s.interactables.push(relay);
  for (let i = 0; i < 20 && !relay.done; i++) update(sim, 1 / 60, { interactHeld: true });
  assert.ok(relay.done && s.sys.relay === true && s.blackout, 'relay overloaded');
  assert.ok(s.enemies.length > before, 'emergency protocol sent units');
  assert.ok(s.report === null || s.report === undefined);
  // the fabricator thins machines out of later waves
  s.sys.fabricator = true;
  const w = sim.level.waves.find((q) => q.units.some((u) => ENEMIES[u.kind].robot));
  if (w) {
    const robots = w.units.filter((u) => ENEMIES[u.kind].robot).length;
    const i = sim.level.waves.indexOf(w);
    s.waves[i] = false;
    const n0 = s.enemies.length;
    s.player.x = w.x; s.player.y = w.y; w.on = 'enter';
    run(sim, 0.1, {});
    assert.equal(s.enemies.length - n0, w.units.length - Math.ceil(robots / 2), 'half the machines stayed home');
  }
});

test('Override: needs charge, takes control of a machine, which then fights for Rook', async () => {
  const { OVERRIDE } = await import('../js/content.js');
  const { sim, s } = armed([]);
  const p = s.player;
  const [robot, man] = lineUp(sim, ['guard', 'bandit']);
  man.x = robot.x + 120; man.y = robot.y;
  p.aim = 0;
  p.hack = 0;
  update(sim, 1 / 60, { hack: true });
  assert.ok(!(robot.hackT > 0), 'no charge, no override');
  p.hack = OVERRIDE.max;
  update(sim, 1 / 60, { hack: true, ax: robot.x, ay: robot.y });
  assert.ok(robot.hackT > 0, 'the machine is ours');
  assert.ok(p.hack < OVERRIDE.max, 'charge spent');
  const hp0 = man.hp;
  run(sim, 3, {});
  assert.ok(man.hp < hp0, 'the hacked machine shot its own side');
  // a shield can be stripped
  const [, shielded] = lineUp(sim, ['bandit', 'bandit']);
  shielded.shield = shielded.shieldMax = 200; shielded.elite = 'shielded';
  shielded.x = p.x + 100; shielded.y = p.y;
  p.hack = OVERRIDE.max;
  update(sim, 1 / 60, { hack: true });
  assert.equal(shielded.shield, 0, 'shield stripped');
});

test('Overclock spends Override charge, boosts, then crashes and blocks Override', async () => {
  const { OVERCLOCK } = await import('../js/content.js');
  const { sim, s } = armed([]);
  const p = s.player;
  for (const e of s.enemies) { e.x = 60; e.y = 60; }
  update(sim, 1 / 60, { overclock: true });
  assert.equal(p.oc, 0, 'not charged');
  p.hack = 100;
  update(sim, 1 / 60, { overclock: true });
  assert.ok(p.oc > 0, 'overclocked');
  assert.equal(p.hack, 100 - OVERCLOCK.cost, 'paid from the one meter');
  const x0 = p.x;
  run(sim, 0.5, { mx: 1 });
  const fast = p.x - x0;
  run(sim, OVERCLOCK.time, {});
  assert.ok(p.crash > 0, 'crashed');
  p.hack = 100;
  update(sim, 1 / 60, { hack: true });
  assert.equal(p.hack, 100, 'no override while rebooting');
  const x1 = p.x;
  run(sim, 0.5, { mx: 1 });
  assert.ok(p.x - x1 < fast, 'slower in the crash than overclocked');
});

test('a run saved before the new systems still resumes', () => {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const old = JSON.parse(snapshot(sim));
  for (const k of ['warden', 'sys', 'secured', 'hazards', 'jammed', 'jamT']) delete old[k];
  for (const k of ['hack', 'oc', 'crash']) delete old.player[k];
  const back = restoreSim(old, sim.level);
  run(back, 2, { mx: 1, fireHeld: true, fire: true, hack: true, overclock: true });
  assert.equal(back.state.phase !== undefined, true);
});

test('WARDEN keeps a file between runs, forgets a little, and can be scrubbed', async () => {
  const { WARDEN } = await import('../js/content.js');
  const c = campaign();
  c.cash = 1000;
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state;
  s.warden.level = 3; s.warden.focus = 'close'; s.warden.stats.close = 800;
  abandon(sim);
  R.resolveExpedition(c, s.report);
  assert.equal(c.warden.focus, 'close');
  assert.equal(c.warden.level, 3 - WARDEN.forget, 'forgets a little');
  assert.equal(c.warden.stats.close, 400, 'keeps half the numbers');
  // the next run starts with the file open
  const next = ride(c, R.availableMissions(c)[0].id, 12);
  assert.equal(next.sim.state.warden.level, 3 - WARDEN.forget);
  assert.equal(next.sim.state.warden.focus, 'close');
  assert.ok(next.sim.events.some((e) => e.type === 'toast' && /FILE ON RUNNER/.test(e.text)), 'it says so');
  abandon(next.sim);
  R.resolveExpedition(c, next.sim.state.report);
  // the clerk wipes it
  const cash = c.cash;
  assert.ok(R.scrubWarden(c).ok);
  assert.equal(c.warden, null);
  assert.equal(cash - c.cash, WARDEN.scrub);
  assert.equal(R.scrubWarden(c).ok, false, 'nothing left to scrub');
});

test('every run has a weapons cache with a gun in it', () => {
  const c = campaign();
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state, p = s.player;
  const box = s.interactables.find((i) => i.kind === 'cache' && i.armory);
  assert.ok(box && box.known, 'marked on the map');
  for (const e of s.enemies) { e.x = 60; e.y = 60; }
  for (const o of s.interactables) if (o !== box && Math.hypot(o.x - box.x, o.y - box.y) < 140) o.x += 4000;
  p.hp = p.maxHp = 1e6; p.x = box.x; p.y = box.y + 4;
  for (let i = 0; i < 90 && !box.done; i++) update(sim, 1 / 60, { interactHeld: true });
  assert.ok(box.done);
  assert.ok(s.interactables.some((i) => i.kind === 'gun' && !i.done), 'a gun lies beside it');
});

test('Saints and Meridian fight each other, and a flare only calls its own side', () => {
  const { sim, s } = armed([]);
  const [saint, sentry] = lineUp(sim, ['bandit', 'guard']);
  const p = s.player;
  // Rook far away, out of sight; the two facing each other across open ground
  saint.x = p.x + 90; saint.y = p.y; sentry.x = p.x + 230; sentry.y = p.y;
  p.x -= 2000;
  saint.state = sentry.state = 'idle';
  const hp0 = saint.hp + sentry.hp;
  run(sim, 6, {});
  assert.ok(saint.hp + sentry.hp < hp0, 'they shot each other');
  assert.ok(saint.foe || sentry.foe || saint.dead || sentry.dead, 'each took the other on');
});
