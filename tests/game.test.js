// Unit tests for the campaign rules, the level generators and the expedition sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/rules.js';
import { CHAPTERS, JOBS, INVESTMENTS, GUNS, GUN_ORDER, ENEMIES, TALK } from '../js/content.js';
import { generateLevel } from '../js/gen/index.js';
import { validateLevel } from '../js/level.js';
import { createSim, update, snapshot, restoreSim, abandon } from '../js/sim.js';

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

test('an expedition settles exactly once, and death keeps the town but loses the kit', () => {
  const c = campaign();
  c.cash = 500;
  assert.ok(R.buy(c, 'bandage').ok !== false);
  const invested = R.invest(c, 'deputy');
  assert.ok(invested.ok !== false, invested.reason);
  const cashBefore = c.cash;
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  assert.ok(sim.state.buddy, 'Deputy Tin rides along once rebuilt');
  sim.state.player.hp = 0;
  run(sim, 4);
  assert.equal(sim.state.report.outcome, 'died');
  const s1 = R.resolveExpedition(c, sim.state.report);
  assert.ok(s1);
  assert.equal(c.cash, cashBefore, 'secured cash survives');
  assert.ok(c.investments.includes('deputy'));
  assert.equal(c.fallen.length, 1);
  assert.ok(R.needsSuccessor(c));
  const again = R.resolveExpedition(c, sim.state.report);
  assert.ok(!again || again.ok === false || c.fallen.length === 1, 'second settlement does nothing');
  assert.equal(c.fallen.length, 1);
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

function armed(guns, chapter = 8) {
  const c = campaign();
  c.chapter = chapter; c.cash = 5000;
  for (const g of guns) { const r = R.buyGun(c, g); assert.ok(r.ok, `${g}: ${r.reason}`); }
  c.chapter = 0;
  const { sim } = ride(c, R.availableMissions(c)[0].id);
  const s = sim.state;
  s.player.maxHp = s.player.hp = 1e6;
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
  assert.ok(R.canBuyGun(c, 'smg').ok);

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
  for (const g of GUN_ORDER) assert.ok(GUNS[g].gunModel && GUNS[g].role && GUNS[g].desc, g);
  for (const d of [...CHAPTERS, ...Object.values(JOBS)]) for (const kind of Object.keys(d.level.mix || {})) assert.ok(ENEMIES[kind], `${d.id}: ${kind}`);
  for (const [id, inv] of Object.entries(INVESTMENTS)) assert.ok(inv.name && inv.cost > 0 && inv.effect, id);
});
