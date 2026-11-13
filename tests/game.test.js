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
  c.cash = 500;
  assert.ok(R.buy(c, 'bandage').ok !== false);
  assert.ok(R.buy(c, 'duster').ok !== false);
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
  c.cash = 500; R.invest(c, 'deputy');
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
    e.kind = kind; e.hp = e.maxHp = 1000; e.r = ENEMIES[kind].radius;
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
