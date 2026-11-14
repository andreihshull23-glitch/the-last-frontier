// Campaign rules: the single owner of persistent state.
//
// Ownership:
//   campaign fields  -> "what is true now" (cash, reputation, the armory, the drifter, the chapter)
//   campaign.ledger  -> "what happened" (story events, deaths, bounties)
// Nothing outside this module mutates a campaign.
//
// What death costs: the drifter (and their trait), the kit they wore, the loot
// and supplies they carried. What it never costs: banked cash, the armory
// (guns and upgrades), town investments, and story progress.

import {
  CHAPTERS, JOBS, GEAR, SUPPLIES, INVESTMENTS, TRAITS, PERKS, CLINIC_PRICE, GUNS, UPGRADES, AMMO, CARRY, ITEMS, SHOPS, TELEGRAMS,
  FIRST_NAMES, LAST_NAMES, BIOS, OUTLAW_FIRST, OUTLAW_NICK, OUTLAW_LAST, ENEMIES, DRIFTER_LOOKS, DESCENT, START_GUN, GUN_ORDER, HERO,
} from './content.js';
import { makeRng, mixSeed } from './rng.js';

export const SAVE_FORMAT = 'last-frontier-save';
export const SAVE_VERSION = 3;
export const REP_MIN = -5;
export const REP_MAX = 5;
export const BOUNTY_REWARD = 60;
export const TOWN_SEED = 20251;

// Only people become outlaws who carry off a dead drifter's kit; machines do not loot.
const HUMAN_KILLERS = new Set(['bandit', 'gunman', 'dynamiter', 'brute', 'bounty', 'trooper']);
const PRUNABLE = new Set(['JOB_DONE', 'DRIFTER_ARRIVED', 'INVESTED', 'DRIFTER_FLED']);
const LEDGER_CAP = 1200;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fail = (reason, price) => (price === undefined ? { ok: false, reason } : { ok: false, reason, price });
/** Cannot afford it: say what it costs and how much is missing. */
const short = (c, price) => ({ ok: false, reason: `¢${price - c.cash} short`, price });

function shell() {
  return {
    seed: 1, rolls: 0, createdAt: Date.now(), cash: 0, prosperity: 0, rep: { meridian: 0, riders: 0 },
    investments: [], armory: { guns: [], upgrades: [] }, chapter: 0,
    character: null, candidates: null, fallen: [], bounty: null, plugins: [], deaths: 0,
    ledger: [], ledgerSeq: 0, pendingChoice: null, activeExpedition: null, expeditionCount: 0, jobsDone: 0,
  };
}

export function newCampaign(seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) {
  const c = shell();
  c.seed = seed >>> 0;
  c.cash = 60;
  record(c, 'CAMPAIGN_STARTED');
  rollCandidates(c);
  return c;
}

// ---------------------------------------------------------------- ledger

export function record(c, type, data = {}) {
  c.ledgerSeq += 1;
  c.ledger.push({ n: c.ledgerSeq, type, at: c.expeditionCount, data });
  if (c.ledger.length > LEDGER_CAP) {
    const i = c.ledger.findIndex((e) => PRUNABLE.has(e.type));
    if (i >= 0) c.ledger.splice(i, 1);
  }
}
export const has = (c, type) => c.ledger.some((e) => e.type === type);
export const eventsOf = (c, type) => c.ledger.filter((e) => e.type === type);

/** The wire, newest first. */
export function telegrams(c, limit = 30) {
  const out = [];
  for (let i = c.ledger.length - 1; i >= 0 && out.length < limit; i--) {
    const e = c.ledger[i];
    const fn = TELEGRAMS[e.type];
    if (fn) out.push({ n: e.n, at: e.at, text: fn(e.data || {}) });
  }
  return out;
}

// ---------------------------------------------------------------- drifters

export function maxHp(ch) {
  return 100 + (ch?.trait === 'leather' ? 25 : 0);
}

export function rollCandidates(c, n = 3) {
  c.rolls += 1;
  const rng = makeRng(mixSeed(c.seed, c.rolls * 7919));
  const taken = new Set([...c.fallen.map((f) => f.name), c.character?.name].filter(Boolean));
  const traits = rng.shuffle(Object.keys(TRAITS));
  const looks = rng.shuffle(DRIFTER_LOOKS.map((_, i) => i)).filter((i) => i !== c.character?.look);
  const out = [];
  for (let i = 0; i < n; i++) {
    let name = '';
    for (let tries = 0; tries < 30; tries++) {
      name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      if (!taken.has(name)) break;
    }
    taken.add(name);
    out.push({ name, trait: traits[i % traits.length], bio: rng.pick(BIOS), look: looks[i % looks.length] });
  }
  c.candidates = out;
  return out;
}

export function hireDrifter(c, index) {
  if (c.character?.alive) return fail('You are already set up.');
  const pick = c.candidates?.[index];
  if (!pick) return fail('That plug-in is no longer on offer.');
  const first = c.fallen.length === 0;
  // One runner for the whole campaign. The pick is their first plug-in.
  c.plugins = [...new Set([...(c.plugins || []), pick.trait])];
  c.character = {
    name: HERO.name, trait: pick.trait, bio: HERO.bio, look: 0, alive: true, hp: 0, gear: [],
    cartridges: first ? AMMO.cartridges.start : 60,
    shells: c.armory.guns.includes('shotgun') ? 12 : 0,
    bandages: first ? 2 : 1,
    dynamite: first ? 1 : 0,
    expeditions: 0, kills: 0, hiredAt: c.expeditionCount,
  };
  c.character.hp = maxHp(c.character);
  c.candidates = null;
  record(c, 'DRIFTER_ARRIVED', { name: pick.name });
  return { ok: true, character: c.character };
}

export const needsSuccessor = (c) => !c.character || !c.character.alive;

// ---------------------------------------------------------------- factions

export function perks(c) {
  const out = [];
  if (c.rep.meridian >= 2) out.push('company_rates');
  if (c.rep.meridian <= -2) out.push('enforcers');
  if (c.rep.riders >= 2) out.push('rider_intel');
  if (c.rep.riders >= 4) out.push('rider_cache');
  if (c.rep.riders <= -2) out.push('riders_shun');
  return out;
}
export const perkDetails = (c) => perks(c).map((id) => ({ id, ...PERKS[id] }));

function adjustRep(c, faction, delta) {
  c.rep[faction] = clamp(c.rep[faction] + delta, REP_MIN, REP_MAX);
}

export function prosperityLabel(p) {
  if (p >= 7) return 'Thriving';
  if (p >= 5) return 'Growing';
  if (p >= 3) return 'Recovering';
  if (p >= 1) return 'Holding on';
  return 'Dying';
}

// ---------------------------------------------------------------- missions

export const storyDone = (c) => c.chapter >= CHAPTERS.length;
export const currentChapter = (c) => (storyDone(c) ? null : CHAPTERS[c.chapter]);

function meets(c, req = {}) {
  if (req.repAbove) for (const [f, min] of Object.entries(req.repAbove)) if (!(c.rep[f] > min)) return false;
  return true;
}

/** Side jobs get harder and pay better as the story advances. */
function tierOf(c) { return Math.min(8, c.chapter + Math.floor(c.jobsDone / 3)); }

function describe(c, kind, def) {
  const story = kind === 'story';
  const tier = story ? 0 : tierOf(c);
  let cash = def.reward.cash ?? 0;
  if (!story) cash = Math.round(cash * (1 + tier * 0.12));
  if (def.faction === 'meridian' && perks(c).includes('company_rates')) cash = Math.round(cash * 1.25);
  let title = def.title, brief = def.brief;
  if (def.id === 'bounty' && c.bounty) {
    title = `Wanted: ${c.bounty.name}`;
    cash = BOUNTY_REWARD * c.bounty.notoriety;
    brief = `${c.bounty.name} killed ${c.bounty.victims.join(' and ')} and rides with what they carried. ${def.brief}`;
  }
  return {
    id: `${kind}:${def.id}`, kind, key: def.id, title, brief, hint: def.hint || '', faction: def.faction || null,
    giver: def.giver || null, cash, rep: def.reward.rep || {}, prosperity: def.reward.prosperity || 0, tier,
    chapter: story ? c.chapter + 1 : 0, final: Boolean(def.final), gen: def.level.gen, night: Boolean(def.level.night),
    objective: def.level.objective,
  };
}

/** Guns that can turn up on a ride: the common ones, plus whatever the gunsmith has been paid to build. */
export function gunPool(c) {
  return GUN_ORDER.filter((g) => g !== START_GUN && (GUNS[g].base || c.armory.guns.includes(g)));
}

const DESCENT_DEF = {
  id: 'descent', title: DESCENT.title, brief: DESCENT.brief, hint: 'Rooms seal when you walk in. Kill everything to open them. Find the floor boss, then take the lift down.',
  level: { gen: 'descent', floor: 1 }, reward: { cash: 0 }, after: 1,
};
const bossLabel = (kind) => (kind === 'foreman' ? 'Kill Director Voss' : kind === 'overseer' ? 'Destroy the Overseer' : kind === 'warden' ? 'Destroy the Warden' : kind === 'brute' ? 'Kill the boss' : 'Kill the target');
function floorConfig(base, floor, seed, pool) {
  const F = DESCENT.floors[floor - 1];
  return {
    ...base, floor, seed: seed >>> 0, title: `${DESCENT.title}: floor ${floor}, ${F.name}`,
    level: { gen: 'descent', floor, seed: seed >>> 0, pool },
    objective: { kind: 'kill', enemy: F.boss, label: F.bossName ? `Kill ${F.bossName}` : bossLabel(F.boss), zone: '' },
  };
}
/** The next floor of a descent, carrying down what the drifter holds. Null when the last floor is done. */
export function nextFloor(c, config, report) {
  if (!config?.descent || report?.outcome !== 'extracted' || !report.done) return null;
  const floor = (config.floor || 1) + 1;
  if (floor > DESCENT.floors.length) return null;
  const seed = (Math.imul(config.seed ^ 0x9e3779b9, 2654435761) + floor * 977) >>> 0;
  return { ...floorConfig(config, floor, seed, config.pool), carry: report.carry, intro: `Floor ${floor}: ${DESCENT.floors[floor - 1].name}. The lift will not go back up until this is finished.` };
}
export const descentFloors = () => DESCENT.floors.length;

/** What can be ridden right now: the next chapter first, then the side jobs. */
export function availableMissions(c) {
  const out = [];
  const ch = currentChapter(c);
  if (ch && !c.pendingChoice) out.push(describe(c, 'story', ch));
  for (const job of Object.values(JOBS)) {
    if (c.chapter < job.after) continue;
    if (job.needsBounty && !c.bounty) continue;
    if (!meets(c, job.requires)) continue;
    if (job.faction === 'riders' && perks(c).includes('riders_shun')) continue;
    out.push(describe(c, 'job', job));
  }
  if (c.chapter >= DESCENT_DEF.after) out.push({ ...describe(c, 'descent', DESCENT_DEF), floors: DESCENT.floors.length, best: c.descentBest || 0 });
  return out;
}

function missionDef(id) {
  const [kind, key] = String(id).split(':');
  if (kind === 'story') return { kind, def: CHAPTERS.find((k) => k.id === key) };
  if (kind === 'job') return { kind, def: JOBS[key] };
  if (kind === 'descent') return { kind, def: DESCENT_DEF };
  return { kind: null, def: null };
}

// ---------------------------------------------------------------- shops

export function ammoCap(c, field) {
  const band = c.character?.gear.includes('bandolier');
  if (field === 'cartridges') return band ? AMMO.cartridges.maxBandolier : AMMO.cartridges.max;
  if (field === 'shells') return band ? AMMO.shells.maxBandolier : AMMO.shells.max;
  if (field === 'bandages') return CARRY.bandages;
  if (field === 'dynamite') return band ? CARRY.dynamiteBandolier : CARRY.dynamite;
  return 0;
}

function locked(c, def) {
  if (def.needsInvestment && !c.investments.includes(def.needsInvestment)) return `Needs: ${INVESTMENTS[def.needsInvestment].name.toLowerCase()}`;
  if (def.needsProsperity && c.prosperity < def.needsProsperity) return `Needs deck standing ${def.needsProsperity}`;
  if (def.needsGun && !c.armory.guns.includes(def.needsGun)) return `Needs the ${GUNS[def.needsGun].name.toLowerCase()}`;
  return null;
}

function shopOpen(c) {
  if (!c.character?.alive) return fail('No runner.');
  if (c.activeExpedition) return fail('You are out on a run.');
  return { ok: true };
}

/** Supplies and kit (things the drifter carries). */
export function canBuy(c, id) {
  const open = shopOpen(c);
  if (!open.ok) return open;
  const ch = c.character;
  const gear = GEAR[id], supply = SUPPLIES[id];
  const def = gear ?? supply;
  if (!def) return fail('Nobody sells that.');
  const lock = locked(c, def);
  if (lock) return fail(lock, def.cost);
  if (gear && ch.gear.includes(id)) return fail('Already carried');
  if (supply && ch[supply.field] >= ammoCap(c, supply.field)) return fail(`Carrying all you can (${ammoCap(c, supply.field)})`);
  if (c.cash < def.cost) return short(c, def.cost);
  return { ok: true, price: def.cost };
}

export function buy(c, id) {
  const check = canBuy(c, id);
  if (!check.ok) return check;
  c.cash -= check.price;
  if (GEAR[id]) c.character.gear.push(id);
  else {
    const s = SUPPLIES[id];
    c.character[s.field] = Math.min(ammoCap(c, s.field), c.character[s.field] + s.qty);
  }
  return { ok: true };
}

/** Guns and upgrades (the armory: permanent). */
export function canBuyGun(c, id) {
  const open = shopOpen(c);
  if (!open.ok) return open;
  const g = GUNS[id];
  if (!g || !g.cost) return fail('Not for sale.');
  if (g.base) return fail('Turns up on every run');
  if (c.armory.guns.includes(id)) return fail('Unlocked');
  if (g.after && c.chapter < g.after) return fail(`Not built yet: finish "${CHAPTERS[g.after - 1].title}"`, g.cost);
  if (c.cash < g.cost) return short(c, g.cost);
  return { ok: true, price: g.cost };
}
export function buyGun(c, id) {
  const check = canBuyGun(c, id);
  if (!check.ok) return check;
  c.cash -= check.price;
  c.armory.guns.push(id);
  return { ok: true };
}
/** Plug-ins the runner owns; one is fitted at a time. */
export const ownedPlugins = (c) => [...(c.plugins || [])];
export function canBuyPlugin(c, id) {
  const open = shopOpen(c);
  if (!open.ok) return open;
  const t = TRAITS[id];
  if (!t) return fail('No such plug-in');
  if ((c.plugins || []).includes(id)) return fail('Owned');
  if (c.cash < t.cost) return short(c, t.cost);
  return { ok: true, price: t.cost };
}
export function buyPlugin(c, id) {
  const check = canBuyPlugin(c, id);
  if (!check.ok) return check;
  c.cash -= check.price;
  c.plugins = [...(c.plugins || []), id];
  return { ok: true };
}
/** Fit a plug-in the runner owns. Health is kept in proportion when plating goes in or out. */
export function fitPlugin(c, id) {
  const ch = c.character;
  if (!ch?.alive) return fail('No runner');
  if (!(c.plugins || []).includes(id)) return fail('Not owned');
  if (ch.trait === id) return fail('Fitted');
  const before = maxHp(ch);
  ch.trait = id;
  ch.hp = clamp(Math.round(ch.hp * (maxHp(ch) / before)), 1, maxHp(ch));
  return { ok: true };
}

export function canBuyUpgrade(c, id) {
  const open = shopOpen(c);
  if (!open.ok) return open;
  const u = UPGRADES[id];
  if (!u) return fail('Unknown work');
  if (c.armory.upgrades.includes(id)) return fail('Fitted');
  if (u.gun !== START_GUN && !GUNS[u.gun].base && !c.armory.guns.includes(u.gun)) return fail(`Unlock the ${GUNS[u.gun].name.toLowerCase()} first`, u.cost);
  if (!c.investments.includes('workshop')) return fail("Needs: Tess's workbench (Customs Hall)", u.cost);
  if (c.cash < u.cost) return short(c, u.cost);
  return { ok: true, price: u.cost };
}
export function buyUpgrade(c, id) {
  const check = canBuyUpgrade(c, id);
  if (!check.ok) return check;
  c.cash -= check.price;
  c.armory.upgrades.push(id);
  return { ok: true };
}

export function canInvest(c, id) {
  const inv = INVESTMENTS[id];
  if (!inv) return fail('Unknown project');
  if (c.investments.includes(id)) return fail('Done');
  if (inv.needsProsperity && c.prosperity < inv.needsProsperity) return fail(`Needs deck standing ${inv.needsProsperity}`, inv.cost);
  if (c.cash < inv.cost) return short(c, inv.cost);
  return { ok: true, price: inv.cost };
}
export function invest(c, id) {
  const check = canInvest(c, id);
  if (!check.ok) return check;
  const inv = INVESTMENTS[id];
  c.cash -= inv.cost;
  c.investments.push(id);
  c.prosperity += inv.prosperity;
  record(c, 'INVESTED', { id, name: inv.name });
  return { ok: true };
}

export const clinicPrice = (c) => (c.investments.includes('clinic') ? 0 : CLINIC_PRICE);
export function treat(c) {
  const ch = c.character;
  if (!ch?.alive) return fail('Nobody to treat.');
  if (ch.hp >= maxHp(ch)) return fail('Already in good health');
  const price = clinicPrice(c);
  if (c.cash < price) return short(c, price);
  c.cash -= price;
  ch.hp = maxHp(ch);
  return { ok: true, price };
}

/** The Site 9 ledger: print it, or sell it back. */
export function chooseLedger(c, choice) {
  if (c.pendingChoice !== 'ledger') return fail('There is nothing to decide.');
  if (choice === 'expose') {
    adjustRep(c, 'riders', 3);
    adjustRep(c, 'meridian', -3);
    c.prosperity += 1;
    record(c, 'EVIDENCE_EXPOSED');
  } else if (choice === 'sell') {
    c.cash += 300;
    adjustRep(c, 'meridian', 2);
    adjustRep(c, 'riders', -2);
    record(c, 'EVIDENCE_SOLD');
  } else return fail('Unknown choice');
  c.pendingChoice = null;
  return { ok: true };
}

// ---------------------------------------------------------------- configs for the sim

function characterConfig(c, extra = {}) {
  const ch = c.character;
  return {
    name: ch.name, trait: ch.trait, look: ch.look ?? 0, hp: ch.hp, maxHp: maxHp(ch), gear: [...ch.gear],
    cartridges: ch.cartridges, shells: ch.shells, bandages: ch.bandages, dynamite: ch.dynamite, ...extra,
  };
}

/** The walkable town. Rebuilt whenever the campaign changes what stands in it. */
export function townConfig(c, arrive = 'trail') {
  const ch = c.character;
  const chapter = currentChapter(c);
  return {
    mode: 'town',
    seed: TOWN_SEED,
    level: {
      gen: 'town', seed: TOWN_SEED, arrive, investments: [...c.investments], prosperity: c.prosperity,
      fallen: c.fallen.slice(-9).map((f) => ({ name: f.name, epitaph: `Killed by ${f.killedBy}. ${f.expeditions} run${f.expeditions === 1 ? '' : 's'}.` })),
    },
    objective: null,
    character: ch?.alive ? characterConfig(c) : { name: 'Nobody', trait: 'steady', look: 0, hp: 100, maxHp: 100, gear: [], cartridges: 0, shells: 0, bandages: 0, dynamite: 0 },
    armory: { guns: [...c.armory.guns], upgrades: [...c.armory.upgrades] },
    pool: gunPool(c),
    giver: chapter && !c.pendingChoice ? chapter.giver : null,
    chapter: c.chapter,
    companion: c.investments.includes('deputy'),
    shopVerbs: Object.fromEntries(Object.entries(SHOPS).map(([k, v]) => [k, v.verb])),
    intel: {},
  };
}

export function beginExpedition(c, missionId, seed) {
  if (c.activeExpedition) return fail('A run is already under way.');
  const ch = c.character;
  if (!ch?.alive) return fail('No runner.');
  const { kind, def } = missionDef(missionId);
  const offer = availableMissions(c).find((m) => m.id === missionId);
  if (!def || !offer) return fail('That job is not on offer.');
  const p = perks(c);
  const id = `x${c.expeditionCount + 1}-${(seed >>> 0).toString(36)}`;
  c.activeExpedition = { id, missionId, seed: seed >>> 0, startedAt: Date.now() };
  const tier = offer.tier;
  const open = def.level.gen === 'canyon' && def.level.theme !== 'hollow';
  const bounty = c.bounty ? { name: c.bounty.name, notoriety: c.bounty.notoriety, victims: [...c.bounty.victims] } : null;
  const objective = { ...def.level.objective };
  if (objective.kind === 'kill') objective.label = objective.enemy === 'foreman' ? 'Kill Director Voss' : objective.enemy === 'overseer' ? 'Destroy the Overseer' : objective.enemy === 'bounty' ? `Kill ${bounty?.name ?? 'the outlaw'}` : 'Kill the Saint';
  const config = {
    mode: 'ride', expeditionId: id, missionId, seed: seed >>> 0, title: offer.title,
    intro: def.hint || def.brief,
    level: {
      ...def.level, seed: seed >>> 0, tier,
      threat: +((def.level.threat ?? 1) * (kind === 'job' ? 1 + tier * 0.07 : 1)).toFixed(3),
      bounty: bounty && (open || objective.enemy === 'bounty') ? { name: bounty.name, notoriety: bounty.notoriety } : null,
      enforcers: p.includes('enforcers') && open,
    },
    objective,
    character: characterConfig(c, {
      bandages: Math.min(CARRY.bandages, ch.bandages + (p.includes('rider_cache') ? 1 : 0) + (c.investments.includes('clinic') ? 1 : 0)),
      dynamite: Math.min(ammoCap(c, 'dynamite'), ch.dynamite + (p.includes('rider_cache') ? 1 : 0) + (ch.trait === 'powder' ? 1 : 0)),
    }),
    armory: { guns: [...c.armory.guns], upgrades: [...c.armory.upgrades] },
    pool: gunPool(c),
    perks: p,
    intel: { fullMap: c.investments.includes('telegraph'), riderIntel: p.includes('rider_intel') },
    bounty,
    sundownBonus: c.investments.includes('watchtower') ? 90 : 0,
    companion: c.investments.includes('deputy'),
  };
  if (kind === 'descent') return { ok: true, config: { ...floorConfig({ ...config, descent: true }, 1, seed, config.pool), intro: def.hint } };
  return { ok: true, config };
}

/** Undo beginExpedition when the ride could not start. */
export function abortExpedition(c, expeditionId) {
  if (!c.activeExpedition || c.activeExpedition.id !== expeditionId) return fail('No such run.');
  c.activeExpedition = null;
  return { ok: true };
}

function killerLabel(killer) {
  if (!killer) return 'the tower';
  if (killer.kind === 'bounty') return killer.name ?? 'a ganger';
  if (killer.kind === 'echo') return 'their own echo';
  if (killer.kind === 'walker' || killer.kind === 'husk') return 'something in the dark';
  if (killer.kind === 'dynamite') return 'their own charge';
  if (killer.kind === 'foreman') return 'Director Voss';
  if (killer.kind === 'overseer') return 'the Overseer';
  const def = ENEMIES[killer.kind];
  return def ? `a ${def.name}` : 'the tower';
}

export function rollOutlawName(c) {
  const rng = makeRng(mixSeed(c.seed, 104729 + c.expeditionCount * 31 + c.fallen.length));
  return `${rng.pick(OUTLAW_FIRST)} "${rng.pick(OUTLAW_NICK)}" ${rng.pick(OUTLAW_LAST)}`;
}

/**
 * Settle a ride exactly once. `report` comes from the sim (or resolveMissing).
 * A report for any ride other than the active one is refused, so a repeated or
 * stale call can never pay out twice.
 */
export function resolveExpedition(c, report) {
  const active = c.activeExpedition;
  if (!active || !report || report.expeditionId !== active.id) return fail('This run has already been settled.');
  const { kind, def } = missionDef(active.missionId);
  const ch = c.character;
  const before = { cash: c.cash, rep: { ...c.rep }, prosperity: c.prosperity, chapter: c.chapter };
  const offer = def ? describe(c, kind, def) : null;
  const summary = {
    ok: true, outcome: report.outcome, missionId: active.missionId, title: offer?.title ?? 'Unknown job', story: kind === 'story',
    drifter: ch?.name ?? 'You', lines: [], lost: [], obituary: null, bounty: null, done: false, outro: null, choice: null, ending: null,
  };
  c.activeExpedition = null;
  c.expeditionCount += 1;

  const carried = report.carried ?? {};
  const loot = carried.loot ?? [];
  if (kind === 'descent') {
    // paid by the floor, whether or not the drifter made it back up
    const finished = report.outcome === 'extracted' && report.done;
    const cleared = finished ? (report.floor || 1) : Math.max(0, (report.floor || 1) - 1);
    const pay = cleared * DESCENT.reward.cashPerFloor + (finished && cleared >= DESCENT.floors.length ? DESCENT.reward.cashFinish : 0);
    if (pay > 0) { c.cash += pay; summary.lines.push({ label: `The Descent: ${cleared} floor${cleared === 1 ? '' : 's'} cleared`, value: `+¢${pay}`, tone: 'good' }); }
    else summary.lines.push({ label: 'The Descent', value: 'No floor cleared', tone: 'muted' });
    c.descentBest = Math.max(c.descentBest || 0, cleared);
    summary.floors = cleared;
    if (finished && cleared >= DESCENT.floors.length) {
      summary.done = true;
      summary.outro = 'You rode the lift back up from the heart of the Hollow. Nobody on the deck has done that before. The shaft is still open, and it is never quite the same twice.';
      record(c, 'DESCENT_DONE', {});
    }
  }

  if (report.outcome === 'extracted' || report.outcome === 'fled') {
    const kept = report.outcome === 'extracted';
    const lootTotal = kept ? Math.round(loot.reduce((s, l) => s + (l.value | 0), 0) * (c.investments.includes('coachline') ? 1.2 : 1)) : 0;
    if (lootTotal > 0) {
      c.cash += lootTotal;
      summary.lines.push({ label: `Sold ${loot.length} find${loot.length === 1 ? '' : 's'}`, value: `+¢${lootTotal}` });
    }
    if (kept && def && report.done && kind !== 'descent') {
      const bountyJob = def.id === 'bounty';
      const payout = bountyJob ? 0 : offer.cash;
      c.cash += payout;
      for (const [f, d] of Object.entries(def.reward.rep ?? {})) adjustRep(c, f, d);
      c.prosperity += def.reward.prosperity ?? 0;
      summary.done = true;
      if (!bountyJob) summary.lines.push({ label: `${kind === 'story' ? 'Chapter' : 'Job'}: ${offer.title}`, value: `+¢${payout}`, tone: 'good' });
      if (kind === 'story') {
        c.chapter += 1;
        record(c, def.event, def.event === 'FOREMAN_DEAD' ? { exposed: has(c, 'EVIDENCE_EXPOSED') } : {});
        summary.outro = def.outro || null;
        if (def.choice) { c.pendingChoice = def.choice; summary.choice = def.choice; }
        if (def.final) summary.ending = has(c, 'EVIDENCE_EXPOSED') ? 'exposed' : 'sold';
      } else {
        c.jobsDone += 1;
        record(c, 'JOB_DONE', { id: def.id, title: offer.title });
      }
    } else if (def && kind !== 'descent') {
      summary.lines.push({ label: `${kind === 'story' ? 'Chapter' : 'Job'}: ${summary.title}`, value: kept ? 'Not finished' : 'Abandoned', tone: 'muted' });
    }
    if (kept && carried.effects && c.bounty) {
      let refund = 0;
      const back = [];
      for (const g of c.bounty.gear) {
        if (!GEAR[g]) continue;
        if (ch.gear.includes(g)) refund += Math.floor(GEAR[g].cost / 2);
        else { ch.gear.push(g); back.push(GEAR[g].name); }
      }
      const reward = BOUNTY_REWARD * c.bounty.notoriety + refund;
      c.cash += reward;
      record(c, 'BOUNTY_CLAIMED', { outlaw: c.bounty.name, victims: c.bounty.victims.join(' AND ') });
      summary.lines.push({ label: `Bounty on ${c.bounty.name}`, value: `+¢${reward}`, tone: 'good' });
      if (back.length) summary.lines.push({ label: 'Recovered kit', value: back.join(', ') });
      c.bounty = null;
    } else if (report.bountyKilled && c.bounty) {
      record(c, 'BOUNTY_SLAIN_UNCLAIMED', { outlaw: c.bounty.name });
      summary.lines.push({ label: `${c.bounty.name} is dead`, value: 'Kit left behind', tone: 'muted' });
      c.bounty = null;
    }
    if (!kept) {
      summary.lost = loot.map((l) => `${l.name} (¢${l.value})`);
      record(c, 'DRIFTER_FLED', { name: ch.name });
    }
    const cons = report.consumables ?? {};
    ch.hp = clamp(Math.round(report.playerHp ?? ch.hp), 1, maxHp(ch));
    ch.cartridges = clamp(cons.cartridges ?? ch.cartridges, 0, ammoCap(c, 'cartridges'));
    ch.shells = clamp(cons.shells ?? ch.shells, 0, ammoCap(c, 'shells'));
    ch.bandages = clamp(cons.bandages ?? ch.bandages, 0, CARRY.bandages);
    ch.dynamite = clamp(cons.dynamite ?? ch.dynamite, 0, ammoCap(c, 'dynamite'));
    ch.expeditions += 1;
    ch.kills += report.kills ?? 0;
  } else if (report.outcome === 'died') {
    const killer = report.killedBy ?? null;
    const label = killerLabel(killer);
    if (report.bountyKilled && c.bounty) {
      record(c, 'BOUNTY_SLAIN_UNCLAIMED', { outlaw: c.bounty.name });
      c.bounty = null;
    }
    summary.lost = [...loot.map((l) => `${l.name} (¢${l.value})`), ...ch.gear.map((g) => GEAR[g]?.name ?? g)];
    // The runner does not die for good: the clinic's recovery team drags them back to the deck.
    // What the run turned up is gone, and so is the kit they wore.
    c.deaths = (c.deaths || 0) + 1;
    summary.down = { killedBy: label, times: c.deaths, lostKit: ch.gear.map((g) => GEAR[g]?.name ?? g) };
    record(c, 'DRIFTER_DIED', { name: ch.name, killer: label });
    if (killer && HUMAN_KILLERS.has(killer.kind) && killer.kind !== 'foreman') {
      if (c.bounty) {
        c.bounty.gear = [...new Set([...c.bounty.gear, ...ch.gear])];
        c.bounty.victims.push(ch.name);
        c.bounty.notoriety += 1;
        record(c, 'BOUNTY_GREW', { outlaw: c.bounty.name, victim: ch.name });
      } else {
        const name = killer.kind === 'bounty' && killer.name ? killer.name : rollOutlawName(c);
        c.bounty = { name, gear: [...ch.gear], victims: [ch.name], notoriety: 1 };
        record(c, 'BOUNTY_POSTED', { outlaw: name, victim: ch.name });
      }
      summary.bounty = { ...c.bounty };
    } else if (report.hollow) record(c, 'LOST_TO_HOLLOW', { name: ch.name });
    ch.hp = maxHp({ ...ch, gear: [] });
    ch.gear = [];
    ch.cartridges = 60; ch.shells = 0; ch.bandages = 1; ch.dynamite = 0;
    ch.kills += report.kills ?? 0;
    ch.expeditions += 1;
  } else {
    // 'missing': the page closed mid-ride with no snapshot to resume from. The drifter
    // limps home: loot and the supplies they carried are gone, kit and life are kept.
    summary.lost = loot.map((l) => `${l.name} (¢${l.value})`);
    summary.lines.push({ label: 'Supplies carried', value: 'Lost', tone: 'bad' });
    ch.hp = Math.max(1, Math.round(maxHp(ch) / 2));
    ch.cartridges = Math.min(ch.cartridges, 24); ch.shells = Math.min(ch.shells, 6); ch.bandages = 0; ch.dynamite = 0;
    record(c, 'DRIFTER_FLED', { name: ch.name });
  }

  summary.delta = {
    cash: c.cash - before.cash,
    prosperity: c.prosperity - before.prosperity,
    rep: { meridian: c.rep.meridian - before.rep.meridian, riders: c.rep.riders - before.rep.riders },
    chapter: c.chapter - before.chapter,
  };
  return summary;
}

/** Settle a ride that was interrupted with nothing to resume. */
export function resolveMissing(c) {
  if (!c.activeExpedition) return null;
  return resolveExpedition(c, { expeditionId: c.activeExpedition.id, outcome: 'missing', carried: { loot: [], items: [] } });
}

// ---------------------------------------------------------------- saving

export function toSavePayload(c) {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: Date.now(), campaign: c };
}

/** Validate, repair and (for version 1 saves) migrate a stored payload. */
export function fromSavePayload(payload) {
  if (!payload || typeof payload !== 'object') return fail('No save data');
  if (payload.format !== SAVE_FORMAT) return fail('Not a Last Frontier save');
  if (typeof payload.version !== 'number' || payload.version > SAVE_VERSION) return fail('Save is from a newer version');
  const raw = payload.campaign;
  if (!raw || typeof raw !== 'object') return fail('Save has no campaign');
  const old = payload.version < 2;
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const c = shell();
  c.seed = num(raw.seed, c.seed) >>> 0;
  c.rolls = num(raw.rolls, 0);
  c.createdAt = num(raw.createdAt, Date.now());
  c.cash = Math.max(0, Math.round(num(raw.cash, 0)));
  c.prosperity = Math.max(0, Math.round(num(raw.prosperity, 0)));
  c.rep = {
    meridian: clamp(Math.round(num(raw.rep?.meridian, 0)), REP_MIN, REP_MAX),
    riders: clamp(Math.round(num(raw.rep?.riders, 0)), REP_MIN, REP_MAX),
  };
  const inv = Array.isArray(raw.investments) ? raw.investments.map((id) => (old && id === 'gunsmith' ? 'workshop' : id)) : [];
  c.investments = [...new Set(inv.filter((id) => INVESTMENTS[id]))];
  c.ledger = Array.isArray(raw.ledger)
    ? raw.ledger.filter((e) => e && typeof e.type === 'string').map((e) => ({ n: num(e.n, 0), type: e.type, at: num(e.at, 0), data: e.data && typeof e.data === 'object' ? e.data : {} }))
    : [];
  c.ledgerSeq = Math.max(num(raw.ledgerSeq, 0), ...c.ledger.map((e) => e.n), 0);
  c.expeditionCount = Math.max(0, Math.round(num(raw.expeditionCount, 0)));
  c.jobsDone = Math.max(0, Math.round(num(raw.jobsDone, 0)));
  c.descentBest = Math.max(0, Math.round(num(raw.descentBest, 0)));
  c.deaths = Math.max(0, Math.round(num(raw.deaths, 0)));
  c.plugins = Array.isArray(raw.plugins) ? [...new Set(raw.plugins.filter((t) => TRAITS[t]))] : [];
  c.fallen = Array.isArray(raw.fallen) ? raw.fallen.filter((f) => f && typeof f.name === 'string').map((f) => ({ ...f, killedBy: String(f.killedBy ?? 'the tower'), expeditions: num(f.expeditions, 0) })) : [];
  c.armory = {
    guns: Array.isArray(raw.armory?.guns) ? [...new Set(raw.armory.guns.filter((g) => GUNS[g] && g !== 'revolver'))] : [],
    upgrades: Array.isArray(raw.armory?.upgrades) ? [...new Set(raw.armory.upgrades.filter((u) => UPGRADES[u]))] : [],
  };
  if (old) {
    // The first build told the story through contracts. Map what was done onto chapters.
    const did = (t) => c.ledger.some((e) => e.type === t);
    c.chapter = did('SHARD_DELIVERED') ? 6 : did('EVIDENCE_EXPOSED') || did('EVIDENCE_SOLD') ? 3 : did('EVIDENCE_SECURED') ? 3 : did('SHIPMENT_DELIVERED') ? 1 : 0;
    c.pendingChoice = raw.pendingChoice === 'evidence' ? 'ledger' : null;
    if (raw.character?.gear?.includes?.('long_colt')) c.armory.upgrades.push('long_barrel');
  } else {
    let ch = Math.round(num(raw.chapter, 0));
    // Version 3 added two chapters: "Cut the Strings" after Site 9 and "The Foundry" after the Hollow.
    if (payload.version < 3) ch += (ch >= 3 ? 1 : 0) + (ch >= 5 ? 1 : 0);
    c.chapter = clamp(ch, 0, CHAPTERS.length);
    c.pendingChoice = raw.pendingChoice === 'ledger' ? 'ledger' : null;
  }
  if (raw.bounty && typeof raw.bounty.name === 'string') {
    c.bounty = {
      name: raw.bounty.name,
      gear: Array.isArray(raw.bounty.gear) ? raw.bounty.gear.filter((g) => GEAR[g]) : [],
      victims: Array.isArray(raw.bounty.victims) ? raw.bounty.victims.map(String) : [],
      notoriety: clamp(Math.round(num(raw.bounty.notoriety, 1)), 1, 9),
    };
  }
  const ch = raw.character;
  if (ch && typeof ch.name === 'string' && TRAITS[ch.trait]) {
    c.character = {
      name: ch.name, trait: ch.trait, bio: typeof ch.bio === 'string' ? ch.bio : '',
      look: clamp(Math.round(num(ch.look, Math.abs(c.seed) % DRIFTER_LOOKS.length)), 0, DRIFTER_LOOKS.length - 1),
      alive: ch.alive !== false, hp: 0,
      gear: Array.isArray(ch.gear) ? [...new Set(ch.gear.filter((g) => GEAR[g]))] : [],
      cartridges: 0, shells: 0, bandages: 0, dynamite: 0,
      expeditions: Math.max(0, Math.round(num(ch.expeditions, 0))),
      kills: Math.max(0, Math.round(num(ch.kills, 0))),
      hiredAt: num(ch.hiredAt, 0),
    };
    const cc = c.character;
    cc.hp = cc.alive ? clamp(Math.round(num(ch.hp, maxHp(cc))), 1, maxHp(cc)) : 0;
    if (cc.alive) {
      cc.cartridges = clamp(Math.round(num(ch.cartridges, 0)), old ? 48 : 0, ammoCap(c, 'cartridges'));
      cc.shells = clamp(Math.round(num(ch.shells, 0)), 0, ammoCap(c, 'shells'));
      cc.bandages = clamp(Math.round(num(ch.bandages, 0)), 0, CARRY.bandages);
      cc.dynamite = clamp(Math.round(num(ch.dynamite, 0)), 0, ammoCap(c, 'dynamite'));
    }
  }
  if (Array.isArray(raw.candidates)) {
    c.candidates = raw.candidates.filter((k) => k && typeof k.name === 'string' && TRAITS[k.trait]).slice(0, 3)
      .map((k, i) => ({ ...k, look: clamp(Math.round(num(k.look, i * 3)), 0, DRIFTER_LOOKS.length - 1) }));
    if (!c.candidates.length) c.candidates = null;
  }
  const ax = raw.activeExpedition;
  if (!old && ax && typeof ax.id === 'string' && missionDef(ax.missionId).def) {
    c.activeExpedition = { id: ax.id, missionId: ax.missionId, seed: num(ax.seed, 0) >>> 0, startedAt: num(ax.startedAt, Date.now()) };
  }
  if (needsSuccessor(c) && !c.candidates) rollCandidates(c);
  if (c.character?.alive && c.character.trait && !c.plugins.includes(c.character.trait)) c.plugins.push(c.character.trait);
  return { ok: true, campaign: c, savedAt: num(payload.savedAt, 0), migrated: old };
}

export { ITEMS };
