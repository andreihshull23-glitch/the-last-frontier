// Unit tests for the campaign rules, the level generators and the expedition sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/rules.js';
import { CHAPTERS, JOBS, INVESTMENTS } from '../js/content.js';
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

test('data sanity', () => {
  for (const [id, inv] of Object.entries(INVESTMENTS)) assert.ok(inv.name && inv.cost > 0 && inv.effect, id);
});
