// Static game data. No logic beyond small pure helpers.

// ---- scale -------------------------------------------------------------
export const PX = 32;        // sim units per metre
export const TILE = 16;      // sim units per tile (half a metre)
export const MACRO = 8;      // tiles per canyon cell (4 m)

// ---- tile flags --------------------------------------------------------
export const SOLID = 1;      // bodies cannot enter
export const OPAQUE = 2;     // blocks sight
export const BLOCKS_SHOT = 4;
export const WATER = 8;
export const ROCK = 16;      // canyon rock (drawn with a cap)
export const INDOOR = 32;

// ground paint ids (the renderer owns the colours)
export const GROUND = { sand: 0, trail: 1, rockfloor: 2, wood: 3, grass: 4, camp: 5, water: 6, paving: 7, mine: 8, hollow: 9, field: 10, plank: 11, gravel: 12 };

// ---- player weapons ----------------------------------------------------
// Distances are in sim units (32 = 1 m).
export const GUNS = {
  revolver: {
    id: 'revolver', name: 'Revolver', role: 'Sidearm', ammo: 'cartridges', mag: 6, damage: 34, cooldown: 0.3, spread: 0.02,
    range: 680, speed: 1300, reloadRound: 0.3, noise: 520, gunModel: 'qg/Revolver_1',
    alt: 'fan', fanDamage: 21, fanInterval: 0.085, fanSpread: 0.16, fanRecover: 0.45,
    desc: 'Six shots, loaded one at a time. Alternate fire fans the hammer and empties it in half a second.',
  },
  rifle: {
    id: 'rifle', name: 'Repeater', role: 'Marksman', ammo: 'cartridges', mag: 12, damage: 62, cooldown: 0.62, spread: 0.006,
    range: 1400, speed: 1900, reloadRound: 0.26, noise: 640, gunModel: 'qg/Shotgun_4', cost: 150,
    desc: 'Twelve rounds, long reach, dead straight. Slow to cycle, so make each shot count.',
  },
  shotgun: {
    id: 'shotgun', name: 'Coach gun', role: 'Close quarters', ammo: 'shells', mag: 6, damage: 13, pellets: 8, cooldown: 0.7, spread: 0.17,
    range: 340, speed: 1050, reloadRound: 0.4, noise: 720, gunModel: 'qg/Shotgun_SawedOff', cost: 120,
    alt: 'double', desc: 'Eight pellets a shell. Useless at range, brutal up close. Alternate fire lets go two shells at once.',
  },
  smg: {
    id: 'smg', name: 'Rattler', role: 'Bullet hose', ammo: 'cartridges', mag: 30, damage: 11, cooldown: 0.075, spread: 0.075,
    range: 520, speed: 1200, magReload: 1.7, noise: 600, gunModel: 'qg/SubmachineGun_1', cost: 190,
    desc: 'Thirty rounds in two seconds. Weak per shot, wild past ten metres, and it eats cartridges. The whole magazine swaps at once.',
  },
  longrifle: {
    id: 'longrifle', name: 'Long Tom', role: 'One shot, one grave', ammo: 'cartridges', mag: 4, damage: 150, cooldown: 1.15, spread: 0.002,
    range: 2200, speed: 2600, reloadRound: 0.75, noise: 900, pierce: 2, gunModel: 'qg/SniperRifle_5', cost: 280, after: 2,
    desc: 'Four huge rounds. Each one goes clean through up to three targets. Very slow to fire and to load, and very loud.',
  },
  pulse: {
    id: 'pulse', name: 'Pulse carbine', role: 'Company tech', ammo: null, mag: 24, damage: 17, cooldown: 0.13, spread: 0.03,
    range: 800, speed: 1500, noise: 380, recharge: { rate: 9, delay: 0.9 }, robotMul: 1.6, bolt: '#6fd6ff',
    gunModel: 'gun/blaster-d', cost: 320, after: 4,
    alt: 'overcharge', desc: 'Salvaged Meridian energy weapon. Needs no ammunition: the cell refills when you stop firing. Hits machines 60% harder. Alternate fire dumps half the cell into one heavy bolt.',
  },
  arc: {
    id: 'arc', name: 'Arc caster', role: 'Machine breaker', ammo: null, mag: 6, damage: 38, cooldown: 0.6, spread: 0.02,
    range: 460, speed: 1300, noise: 450, recharge: { rate: 1.6, delay: 1.2 }, robotMul: 1.5, chain: 2, chainRange: 190, stun: 1.6, bolt: '#c9a2ff',
    gunModel: 'gun/blaster-f', cost: 420, after: 6,
    desc: 'Throws lightning that jumps to two more enemies nearby. Machines it touches lock up for a moment. Short reach and a slow-filling cell.',
  },
};
export const GUN_ORDER = ['revolver', 'rifle', 'shotgun', 'smg', 'longrifle', 'pulse', 'arc'];

/** Permanent gunsmith upgrades. `mod` is applied by gunStats(). */
export const UPGRADES = {
  long_barrel: { gun: 'revolver', name: 'Long barrel', cost: 90, mod: { damage: 12, range: 160 }, desc: 'Aimed revolver shots hit harder (34 to 46) and carry farther.' },
  speed_loader: { gun: 'revolver', name: 'Speed loader', cost: 80, mod: { reloadRound: -0.15 }, desc: 'Reload the revolver twice as fast.' },
  tube_extension: { gun: 'rifle', name: 'Tube extension', cost: 90, mod: { mag: 4 }, desc: 'The repeater holds 16 rounds.' },
  peep_sight: { gun: 'rifle', name: 'Peep sight', cost: 120, mod: { damage: 18 }, desc: 'Repeater damage 62 to 80.' },
  full_choke: { gun: 'shotgun', name: 'Full choke', cost: 80, mod: { spreadMul: 0.65, range: 90 }, desc: 'Tighter shotgun pattern that reaches farther.' },
  shell_loop: { gun: 'shotgun', name: 'Shell loops', cost: 70, mod: { reloadRound: -0.16, mag: 2 }, desc: 'Eight shells, and they load faster.' },
  drum_mag: { gun: 'smg', name: 'Drum magazine', cost: 110, mod: { mag: 20 }, desc: 'The Rattler holds 50 rounds.' },
  fore_grip: { gun: 'smg', name: 'Fore grip', cost: 90, mod: { spreadMul: 0.6 }, desc: 'The Rattler sprays much tighter.' },
  tungsten: { gun: 'longrifle', name: 'Tungsten cores', cost: 150, mod: { pierce: 3, damage: 30 }, desc: 'Long Tom rounds hit for 180 and pass through six targets.' },
  big_cell: { gun: 'pulse', name: 'Double cell', cost: 140, mod: { mag: 16 }, desc: 'The pulse carbine holds 40 charges.' },
  fork_coil: { gun: 'arc', name: 'Forked coil', cost: 170, mod: { chain: 2 }, desc: 'Arc caster lightning jumps to four more enemies.' },
};

/** Effective stats of a gun after upgrades. */
export function gunStats(id, upgrades = []) {
  const g = { ...GUNS[id] };
  for (const u of upgrades) {
    const up = UPGRADES[u];
    if (!up || up.gun !== id) continue;
    for (const [k, v] of Object.entries(up.mod)) {
      if (k === 'spreadMul') g.spread *= v;
      else g[k] = +(g[k] + v).toFixed(3);
    }
  }
  return g;
}

export const AMMO = {
  cartridges: { name: 'cartridges', start: 72, max: 150, maxBandolier: 240 },
  shells: { name: 'shells', start: 0, max: 48, maxBandolier: 72 },
};
export const CARRY = { bandages: 5, dynamite: 5, dynamiteBandolier: 8 };

export const DYNAMITE = { range: 330, fuse: 0.9, radius: 105, damage: 130, selfDamage: 45, noise: 900 };

// ---- enemies -----------------------------------------------------------
// `robot` enemies are Meridian machines: energy weapons hit them harder and the arc caster locks them up.
export const ENEMIES = {
  bandit: { name: 'bandit', hp: 60, radius: 11, speed: 100, chase: 132, sight: 340, weapon: 'e_shotgun', ai: 'skirmish', keep: 120, look: 'bandit', cash: [2, 7] },
  gunman: { name: 'gunslinger', hp: 72, radius: 11, speed: 96, chase: 124, sight: 380, weapon: 'e_revolver', ai: 'skirmish', keep: 215, look: 'gunman', cash: [4, 10] },
  guard: { name: 'sentry unit', hp: 82, radius: 11, speed: 82, chase: 100, sight: 430, weapon: 'e_rifle', ai: 'ranged', look: 'guard', cash: [3, 9], robot: true },
  scout: { name: 'scout walker', hp: 34, radius: 10, speed: 138, chase: 160, sight: 410, weapon: 'e_pistol', ai: 'scout', look: 'scout', cash: [1, 5], robot: true },
  enforcer: { name: 'enforcer unit', hp: 105, radius: 11, speed: 104, chase: 136, sight: 400, weapon: 'e_smg', ai: 'skirmish', keep: 170, look: 'enforcer', cash: [5, 12], robot: true },
  crusher: { name: 'crusher unit', hp: 240, radius: 15, speed: 80, chase: 112, sight: 360, weapon: 'e_charge', ai: 'charger', look: 'crusher', cash: [10, 18], robot: true },
  trooper: { name: 'company trooper', hp: 78, radius: 11, speed: 96, chase: 122, sight: 440, weapon: 'e_pulse', ai: 'ranged', look: 'trooper', cash: [6, 14] },
  dynamiter: { name: 'dynamiter', hp: 56, radius: 11, speed: 92, chase: 112, sight: 370, weapon: 'e_dynamite', ai: 'lobber', look: 'dynamiter', cash: [3, 8] },
  brute: { name: 'brute', hp: 200, radius: 15, speed: 84, chase: 118, sight: 340, weapon: 'e_charge', ai: 'charger', look: 'brute', cash: [8, 16] },
  walker: { name: 'Hollow walker', hp: 48, radius: 11, speed: 108, chase: 126, sight: 0, weapon: 'claw', ai: 'swarm', look: 'walker' },
  husk: { name: 'husk', hp: 26, radius: 10, speed: 150, chase: 176, sight: 0, weapon: 'bite', ai: 'swarm', look: 'husk' },
  bounty: { name: 'outlaw', hp: 170, radius: 12, speed: 98, chase: 124, sight: 380, weapon: 'e_revolver', ai: 'skirmish', keep: 210, look: 'bounty', cash: [20, 40] },
  overseer: { name: 'the Overseer', hp: 560, radius: 15, speed: 84, chase: 110, sight: 560, weapon: 'e_shotgun', ai: 'boss', look: 'overseer', cash: [40, 60], boss: true, robot: true,
    title: 'OVERSEER UNIT 01', taunt: 'Overseer: "UNAUTHORISED PERSONNEL. PRODUCTION WILL CONTINUE."', down: 'The Overseer is scrap. The line has stopped. Get out.' },
  foreman: { name: 'the Foreman', hp: 950, radius: 17, speed: 78, chase: 104, sight: 600, weapon: 'e_shotgun', ai: 'boss', look: 'foreman', cash: [60, 90], boss: true, robot: true,
    title: 'FOREMAN HARLAN VOSS', taunt: 'Voss: "You should have sold it to me, drifter."', down: 'Voss is down. Get out before the depot burns.' },
  target: { name: 'target', hp: 1, radius: 12, speed: 0, chase: 0, sight: 0, weapon: null, ai: 'none', look: 'target' },
};

export const WEAPONS = {
  e_shotgun: { kind: 'shotgun', range: 170, windup: 0.5, cooldown: 1.4, pellets: 5, spread: 0.2, damage: 9, speed: 700, life: 0.3, noise: 420 },
  e_rifle: { kind: 'rifle', range: 620, windup: 0.85, lock: 0.25, cooldown: 1.8, damage: 24, speed: 1000, life: 0.75, noise: 520 },
  e_pistol: { kind: 'pistol', range: 330, windup: 0.4, cooldown: 1.1, damage: 8, speed: 640, spread: 0.08, life: 0.6, noise: 300 },
  e_revolver: { kind: 'revolver', range: 320, windup: 0.5, cooldown: 1.6, burst: 3, burstGap: 0.14, damage: 13, speed: 780, spread: 0.07, life: 0.5, noise: 400 },
  e_smg: { kind: 'smg', range: 300, windup: 0.45, cooldown: 1.9, burst: 6, burstGap: 0.075, damage: 6, speed: 820, spread: 0.11, life: 0.45, noise: 420 },
  e_pulse: { kind: 'pulse', range: 560, windup: 0.6, lock: 0.2, cooldown: 1.3, damage: 15, speed: 900, life: 0.7, noise: 360 },
  e_dynamite: { kind: 'dynamite', range: 400, windup: 0.6, cooldown: 2.6, flight: 0.85, fuse: 0.55, radius: 92, damage: 34, noise: 700 },
  e_charge: { kind: 'charge', range: 300, windup: 0.75, cooldown: 1.7, dash: 0.55, dashSpeed: 430, damage: 30, reach: 34 },
  claw: { kind: 'claw', range: 34, reach: 46, windup: 0.32, cooldown: 0.8, damage: 15, arc: 1.1 },
  bite: { kind: 'claw', range: 30, reach: 40, windup: 0.22, cooldown: 0.6, damage: 8, arc: 1.2 },
};

// ---- things you carry out ------------------------------------------------
export const ITEMS = {
  strongbox: { label: 'Meridian strongbox', verb: 'Pry the strongbox loose', duration: 2, heavy: true },
  satchel: { label: "Courier's satchel", verb: 'Take the satchel', duration: 1 },
  ledger: { label: 'Site 9 ledger', verb: 'Take the ledger', duration: 1.2 },
  borekey: { label: 'Bore key', verb: 'Take the bore key', duration: 1.5 },
  shard: { label: 'Hollow shard', verb: 'Pull the shard from the stone', duration: 3 },
  payroll: { label: 'Payroll chest', verb: 'Haul the payroll chest', duration: 2, heavy: true },
  medicine: { label: 'Medicine crate', verb: 'Take the medicine', duration: 1 },
  stake: { label: 'Survey stake', verb: 'Burn the stake', duration: 1.5 },
  relay: { label: 'Signal relay', verb: 'Overload the relay', duration: 2.2 },
  core: { label: 'Machine core', verb: 'Pull the core', duration: 1.5 },
};

export const LOOT_NAMES = [
  'Silver pocket watch', 'Tin of tobacco', 'Gold tooth', 'Railroad scrip', 'Pearl-handled razor',
  'Bottle of rye', 'Brass spyglass', 'Deed to a dead claim', 'Turquoise ring', 'Pouch of gold dust',
  'Engraved flask', 'Box of cigars', 'Silver spurs', 'Tintype in a gilt frame', 'Ivory dice', 'Company bond',
];

// ---- factions, perks -------------------------------------------------------
export const FACTIONS = {
  meridian: { name: 'Meridian Company', short: 'Meridian' },
  riders: { name: 'Free Riders', short: 'Riders' },
};

export const PERKS = {
  company_rates: { faction: 'meridian', name: 'Company rates', desc: 'Meridian jobs pay 25% more.', at: 'Meridian +2' },
  enforcers: { faction: 'meridian', name: 'Company enforcers', desc: 'Meridian sends extra guards after you.', at: 'Meridian -2', bad: true },
  rider_intel: { faction: 'riders', name: 'Rider intel', desc: 'Caches and bounties are marked on your map.', at: 'Riders +2' },
  rider_cache: { faction: 'riders', name: 'Rider cache', desc: 'You ride out with a free bandage and a stick of dynamite.', at: 'Riders +4' },
  riders_shun: { faction: 'riders', name: 'Shunned', desc: 'The Free Riders will not hire you.', at: 'Riders -2', bad: true },
};

// ---- story -----------------------------------------------------------------
/** Shown once when a campaign starts. */
export const PROLOGUE = [
  { title: 'Forty years ago', text: 'Something fell out of the night sky and buried itself in the Red Country. The ranchers who saw it called it a falling star and went back to bed.' },
  { title: 'The Meridian Company', text: 'Meridian bought the land, sank the Calloway shaft straight down onto the thing, and started hauling pieces of it to the surface. What they learned from those pieces now walks the canyons on two legs: sentry units, scout walkers, machines that do not sleep or strike.' },
  { title: 'Mercy', text: 'Mercy is the last free town in the territory. The company wants its well, the bandits want its cattle, and after dark something walks out of the old mine that used to be people.' },
  { title: 'You', text: 'You are a drifter with a revolver and no better offer. The marshal is hiring. Take jobs, come back alive, spend what you earn in town, and find out what Meridian dug up before it finishes digging.' },
];

// Each chapter is one level. `level` is the generator spec (see js/gen).
// `goal` is the one-line "what do I do" shown in town; `recap` is the journal entry once it is done.
export const CHAPTERS = [
  {
    id: 'shipment', title: 'The Missing Shipment', giver: 'marshal', faction: 'meridian',
    goal: 'Recover the Meridian strongbox from the Coyle gang.',
    brief: 'The Coyle gang hit a Meridian freight wagon in Dry Fork canyon and dragged its strongbox back to their camp. The company is paying, and Mercy needs the money. Ride out, take the box from the bandit camp, and carry it to an exit.',
    hint: 'Follow the gold marker to the bandit camp. The strongbox is heavy: you cannot sprint while carrying it, so clear a path first.',
    level: { gen: 'canyon', size: [30, 24], theme: 'red', pois: ['bandit_camp', 'homestead', 'wreck', 'ruins'], objective: { kind: 'item', item: 'strongbox', at: 'bandit_camp' }, threat: 0.85, mix: { bandit: 7, gunman: 2, scout: 1 } },
    reward: { cash: 120, rep: { meridian: 1 }, prosperity: 1 },
    event: 'SHIPMENT_DELIVERED',
    outro: 'The lid came loose on the ride home. No gold inside: a fist-sized machine core, warm, ticking, lit from within. The manifest sends it to a place stamped in red: SITE 9. Nobody in Mercy has heard of it. A Free Rider at the saloon says she has.',
    recap: 'You took a Meridian strongbox back from the Coyle gang. Inside was a glowing machine core bound for somewhere called Site 9.',
  },
  {
    id: 'courier', title: "The Courier's Road", giver: 'rider', faction: 'riders',
    goal: "Find the dead courier's satchel at the Dry Fork rail station.",
    brief: 'The Free Riders are ranchers and outriders who will not sell to the company. One of their couriers was carrying a survey map of Site 9 when he was run down at the old Dry Fork rail station. His satchel is still there. So are the machines that killed him.',
    hint: 'This is your first look at Meridian machines. Sentry units hit hard at long range but aim slowly: move when the red line settles on you.',
    level: { gen: 'canyon', size: [32, 25], theme: 'red', pois: ['rail_station', 'homestead', 'bandit_camp', 'ruins', 'outpost'], objective: { kind: 'item', item: 'satchel', at: 'rail_station' }, threat: 1, mix: { bandit: 5, gunman: 2, guard: 5, scout: 2 } },
    reward: { cash: 130, rep: { riders: 1 }, prosperity: 1 },
    event: 'SATCHEL_DELIVERED',
    outro: 'The map shows a fenced compound two canyons east, and a line drawn from it straight to the Calloway mine. Site 9 is where the cores go. The Riders want to know what comes out.',
    recap: "You recovered a Free Rider courier's map. It marks Site 9, a hidden Meridian compound connected to the Calloway mine.",
  },
  {
    id: 'site9', title: 'Fences in the Desert', giver: 'rider', faction: 'riders',
    goal: 'Break into Site 9 and steal the ledger.',
    brief: 'Site 9 appears on no company map. It is where Meridian puts its machines together. Somewhere inside is a ledger: every core, every machine, and what they found at the bottom of the Calloway shaft. Take it.',
    hint: 'Scout walkers fire flares that bring every gun nearby. Kill them first, or stay out of their sight.',
    level: { gen: 'canyon', size: [32, 26], theme: 'red', pois: ['site9', 'outpost', 'bandit_camp', 'ruins', 'wreck'], objective: { kind: 'item', item: 'ledger', at: 'site9' }, threat: 1.1, mix: { guard: 7, scout: 3, enforcer: 2, gunman: 2, bandit: 3 } },
    reward: { cash: 160, rep: { riders: 1 } },
    event: 'EVIDENCE_SECURED',
    choice: 'ledger',
    outro: 'The ledger says it plainly. The Calloway shaft ends in the hull of a ship that is not from here. Meridian is cutting it up for parts. Forty miners went down to do the cutting and the company sealed the gate behind them. Decide who gets to read this.',
    recap: 'You stole the Site 9 ledger. Under the Calloway mine lies a ship from the sky. Meridian builds its machines from the wreck, and sealed forty miners inside.',
  },
  {
    id: 'relays', title: 'Cut the Strings', giver: 'marshal', faction: null,
    goal: 'Overload three signal relays in the Red Country.',
    brief: 'The ledger explains the machines. They do not think. Every one of them takes its orders from signal relays the company has planted across the canyon, and the relays listen to the ship. Overload three and every machine in this valley goes deaf. The gunsmith says she can do something with the wreckage, too.',
    hint: 'Relays are the tall humming masts. Overloading one is loud: expect company. Enforcer units close in fast and fire in long bursts.',
    level: { gen: 'canyon', size: [32, 26], theme: 'red', pois: ['outpost', 'outpost', 'ruins', 'homestead', 'wreck'], objective: { kind: 'burn', item: 'relay', count: 3 }, threat: 1.15, mix: { guard: 6, scout: 2, enforcer: 4, trooper: 3 } },
    reward: { cash: 180, prosperity: 1 },
    event: 'RELAYS_DOWN',
    outro: 'Three masts burning, and machines standing dead in the sand for a mile around. The gunsmith has already stripped one. She says the company guns run on the same light as the cores, and she can build you one.',
    recap: 'You burned out three signal relays. The machines take their orders from the buried ship. The gunsmith can now build energy weapons from salvage.',
  },
  {
    id: 'mine', title: 'The Calloway Mine', giver: 'marshal', faction: null,
    goal: 'Go down the Calloway mine and find the bore key.',
    brief: 'The ledger says the last Calloway crew locked the lower gate from the inside and kept the bore key. None of them came up. Claim jumpers hold the upper works now. Go down, find the key, and come back with your lamp still lit.',
    hint: 'It is dark below, so buy a lantern at the outfitter. Dynamiters throw from behind cover: keep moving. The pale things were miners once.',
    level: { gen: 'mine', size: [28, 26], theme: 'mine', objective: { kind: 'item', item: 'borekey', at: 'vault' }, threat: 1.25, mix: { bandit: 5, dynamiter: 5, gunman: 2, husk: 10, brute: 1 } },
    reward: { cash: 200, prosperity: 1 },
    event: 'KEY_FOUND',
    outro: 'The bore key is a hand of black metal that no smith made, cold enough to burn. It came off the ship. It fits a gate that opens only after dark.',
    recap: 'You brought the bore key up from the Calloway mine. It is a piece of the ship, and it opens the lower gate.',
  },
  {
    id: 'hollow', title: 'What They Dug Up', giver: 'rider', faction: null,
    goal: "Enter the Hollow and take the shard from the ship's heart.",
    brief: 'Past the lower gate is the hull. The miners who were sealed in are still down there, and still walking: the ship keeps them going the same way it keeps the machines going. Meridian calls the place the Hollow. At its heart is a shard of the ship\'s engine. Without it the ship cannot speak to anything. Bring it out.',
    hint: 'The ship copies you. Your echo walks your path and fires your shots two seconds late. Keep moving, and never stand where you just stood.',
    level: { gen: 'canyon', size: [28, 24], theme: 'hollow', night: true, pois: ['heart', 'ruins', 'ruins', 'camp_dead', 'ruins'], objective: { kind: 'item', item: 'shard', at: 'heart' }, threat: 1.3, mix: { walker: 13, husk: 6 } },
    reward: { cash: 260, prosperity: 1 },
    event: 'SHARD_TAKEN',
    outro: 'The shard hums in the saddlebag all the way home. With it gone the ship is going quiet, and the company knows. But Site 9 has enough cores stockpiled to build an army first, and its foundry is running day and night.',
    recap: "You carried the engine shard out of the Hollow. The ship is going quiet, but Site 9's foundry is still building machines from stockpiled cores.",
  },
  {
    id: 'foundry', title: 'The Foundry', giver: 'rider', faction: null,
    goal: 'Destroy the Overseer that runs the Site 9 foundry.',
    brief: 'Site 9 is building enforcers as fast as it can bolt them together, and one machine runs the whole line: Overseer Unit 01. It is the only thing out there that thinks for itself. Break it and the foundry stops. The Riders will hit the fence to draw the guards. You go for the Overseer.',
    hint: 'Energy weapons hit machines much harder than lead. The arc caster locks them up for a moment. The Overseer telegraphs every attack: step out of the line, then punish it.',
    level: { gen: 'canyon', size: [32, 26], theme: 'red', pois: ['site9', 'outpost', 'outpost', 'wreck', 'ruins'], objective: { kind: 'kill', enemy: 'overseer', at: 'site9' }, threat: 1.3, mix: { guard: 6, enforcer: 5, crusher: 2, trooper: 3, scout: 2 } },
    reward: { cash: 320, prosperity: 1 },
    event: 'OVERSEER_DEAD',
    outro: 'The line is dead and Site 9 is burning. By morning the telegraph has a message from Meridian. Foreman Harlan Voss is coming to Dry Fork himself, with everything the company has left, to collect its property.',
    recap: 'You destroyed the Overseer and stopped the foundry at Site 9. Foreman Voss is coming for the shard himself.',
  },
  {
    id: 'foreman', title: 'The Foreman', giver: 'marshal', faction: null, final: true,
    goal: 'Kill Foreman Harlan Voss at the Dry Fork depot.',
    brief: 'Harlan Voss sank the Calloway shaft. He signed the ledger. He has spent twenty years replacing himself with pieces of the ship, and there is not much man left. He has turned the Dry Fork depot into a fort and sent word that Mercy burns unless the shard is handed over. End it.',
    hint: 'Voss is more machine than man, so energy weapons bite. He telegraphs every attack: step out of the line, then punish him while he reloads.',
    level: { gen: 'canyon', size: [32, 25], theme: 'red', pois: ['depot', 'outpost', 'wreck', 'ruins', 'homestead'], objective: { kind: 'kill', enemy: 'foreman', at: 'depot' }, threat: 1.4, mix: { guard: 6, enforcer: 4, trooper: 3, dynamiter: 2, scout: 2, crusher: 1 } },
    reward: { cash: 500, prosperity: 2 },
    event: 'FOREMAN_DEAD',
    outro: 'Voss is dead and the depot is burning. The ship under the Calloway shaft is silent. Whatever it was, wherever it came from, it is somebody else\'s problem now. Tonight Mercy is still here.',
    recap: 'You killed Foreman Voss. The ship is silent and Mercy stands.',
  },
];

/** Repeatable side jobs. `after` is how many chapters must be done first. */
export const JOBS = {
  payroll: {
    id: 'payroll', title: 'Stolen Payroll', faction: 'meridian', after: 1,
    brief: "Meridian's payroll chest was lifted and stashed at an abandoned homestead. It is heavy. Haul it home.",
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['homestead', 'bandit_camp', 'ruins'], objective: { kind: 'item', item: 'payroll', at: 'homestead' }, threat: 1, mix: { bandit: 6, gunman: 3, scout: 1 } },
    reward: { cash: 110, rep: { meridian: 1 } }, requires: { repAbove: { meridian: -2 } },
  },
  stakes: {
    id: 'stakes', title: 'Pull Up the Survey Stakes', faction: 'riders', after: 1,
    brief: 'Meridian surveyors staked a new line straight through Rider land. Burn three of their stakes. The smoke will draw attention.',
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['outpost', 'ruins', 'homestead'], objective: { kind: 'burn', count: 3 }, threat: 1, mix: { guard: 5, scout: 2, bandit: 3 } },
    reward: { cash: 90, rep: { riders: 1, meridian: -1 } }, requires: { repAbove: { riders: -2 } },
  },
  medicine: {
    id: 'medicine', title: 'Medicine for Mercy', faction: null, after: 1,
    brief: 'The clinic is out of laudanum and clean bandages. A supply wagon went over in the canyon. Find three crates before the bandits sell them.',
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['wreck', 'bandit_camp', 'homestead'], objective: { kind: 'collect', item: 'medicine', count: 3 }, threat: 0.95, mix: { bandit: 6, gunman: 2, scout: 1 } },
    reward: { cash: 70, prosperity: 1 },
  },
  rustlers: {
    id: 'rustlers', title: 'Clear the Rustler Camp', faction: null, after: 2,
    brief: 'Rustlers have dug in at a canyon camp and are bleeding the ranches dry. Their boss is a big man who likes to run people down. Put him in the ground.',
    level: { gen: 'canyon', size: [28, 22], theme: 'red', pois: ['bandit_camp', 'homestead', 'ruins', 'wreck'], objective: { kind: 'kill', enemy: 'brute', at: 'bandit_camp' }, threat: 1.15, mix: { bandit: 7, gunman: 3, dynamiter: 1, scout: 1 } },
    reward: { cash: 150, prosperity: 1 },
  },
  salvage: {
    id: 'salvage', title: 'Scrap Run', faction: 'riders', after: 4,
    brief: 'With the relays down, dead machines are lying all over the Red Country with their cores still in them. The gunsmith pays for cores. So does everyone else, so the company has sent troopers to collect them first. Bring back three.',
    level: { gen: 'canyon', size: [28, 22], theme: 'red', pois: ['outpost', 'wreck', 'ruins', 'homestead'], objective: { kind: 'collect', item: 'core', count: 3 }, threat: 1.2, mix: { trooper: 4, enforcer: 3, guard: 4, scout: 2 } },
    reward: { cash: 170, rep: { riders: 1 } },
  },
  deep_claim: {
    id: 'deep_claim', title: 'Back Down the Shaft', faction: null, after: 5,
    brief: 'There is silver ore in the Calloway lower works and nobody left alive to claim it. Go down, fill your pockets, and get out.',
    level: { gen: 'mine', size: [28, 26], theme: 'mine', objective: { kind: 'item', item: 'payroll', at: 'vault' }, threat: 1.4, mix: { bandit: 4, dynamiter: 5, husk: 12, brute: 1 } },
    reward: { cash: 220 },
  },
  hollow_return: {
    id: 'hollow_return', title: 'Back Into the Hollow', faction: null, after: 6,
    brief: 'Collectors back east pay for pieces of the ship. Nobody asks what happens to the people who fetch them.',
    level: { gen: 'canyon', size: [28, 24], theme: 'hollow', night: true, pois: ['heart', 'ruins', 'ruins', 'camp_dead'], objective: { kind: 'item', item: 'shard', at: 'heart' }, threat: 1.6, mix: { walker: 15, husk: 8 } },
    reward: { cash: 260 },
  },
  bounty: {
    id: 'bounty', title: 'Wanted', faction: null, after: 0, needsBounty: true,
    brief: 'They killed one of ours and they are wearing what they took. Find them, finish it, and bring the effects home.',
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['bandit_camp', 'ruins', 'homestead'], objective: { kind: 'kill', enemy: 'bounty', at: 'bandit_camp' }, threat: 1.05, mix: { bandit: 5, gunman: 3, scout: 1 } },
    reward: { cash: 0 },
  },
};

// ---- Mercy -------------------------------------------------------------------
export const INVESTMENTS = {
  workshop: { name: "Gunsmith's workshop", cost: 120, prosperity: 1, effect: 'The gunsmith can fit upgrades to your guns.' },
  clinic: { name: 'Restock the clinic', cost: 80, prosperity: 1, effect: 'Treatment at the clinic is free, and you ride out with one more bandage.' },
  telegraph: { name: 'Repair the telegraph line', cost: 100, prosperity: 1, effect: 'Your map shows the whole canyon at the start of every ride.' },
  deputy: { name: 'Rebuild Deputy Tin', cost: 140, prosperity: 1, effect: 'A salvaged Meridian machine, rewired by the gunsmith. It rides out with every drifter, covers you in a fight, and cannot be killed, only knocked offline for a while.' },
  watchtower: { name: 'Raise a watchtower', cost: 150, prosperity: 1, needsProsperity: 3, effect: 'Lookouts buy you an extra minute and a half of daylight.' },
  coachline: { name: 'Reopen the coach line', cost: 180, prosperity: 2, needsProsperity: 4, effect: 'Loot you bring home sells for 20% more.' },
};

/** Kit rides with the drifter and is lost when they die. */
export const GEAR = {
  duster: { name: 'Oilcloth duster', cost: 80, desc: 'Take 20% less damage.' },
  boots: { name: 'Trail boots', cost: 60, desc: 'Sprint longer and move a little faster.' },
  bandolier: { name: 'Bandolier', cost: 90, desc: 'Carry far more ammunition and dynamite, and reload 20% faster.' },
  lantern: { name: 'Lantern', cost: 45, desc: 'See farther after sundown and underground.' },
  field_kit: { name: 'Field kit', cost: 50, desc: 'Bandages heal 70 instead of 45, and faster.' },
  spyglass: { name: 'Spyglass', cost: 70, desc: 'Enemies within 45 metres show on your map.' },
  charm: { name: "Rabbit's foot", cost: 130, needsProsperity: 2, desc: 'Once per ride, a killing blow leaves you standing with 1 health.' },
};

export const SUPPLIES = {
  cartridges: { name: 'Box of cartridges', cost: 6, qty: 24, field: 'cartridges', desc: '24 rounds for the revolver and the repeater.' },
  shells: { name: 'Box of shells', cost: 8, qty: 12, field: 'shells', desc: '12 shells for the coach gun.', needsGun: 'shotgun' },
  bandage: { name: 'Bandage', cost: 10, qty: 1, field: 'bandages', desc: 'Heals 45 health over two seconds.' },
  dynamite: { name: 'Stick of dynamite', cost: 12, qty: 1, field: 'dynamite', desc: 'Throw it, then be somewhere else.' },
};

export const CLINIC_PRICE = 20;

export const TRAITS = {
  steady: { name: 'Steady hand', desc: 'Aimed shots deal 20% more damage.' },
  fleet: { name: 'Fleet-footed', desc: 'Dodging and sprinting cost less stamina.' },
  leather: { name: 'Boot leather', desc: '+25 maximum health.' },
  scavenger: { name: 'Scavenger', desc: 'Loot is worth 30% more.' },
  loader: { name: 'Quick loader', desc: 'Reload 35% faster.' },
  nighteyes: { name: 'Night eyes', desc: 'See farther in the dark.' },
  coolhead: { name: 'Cool head', desc: 'Fanned and scattered shots spread 35% less.' },
  powder: { name: 'Powder monkey', desc: 'Dynamite hits 30% harder and you start each ride with one stick.' },
};

export const FIRST_NAMES = [
  'Ada', 'Silas', 'June', 'Eli', 'Hattie', 'Cole', 'Mae', 'Jesse', 'Ruth', 'Wyatt', 'Clara', 'Abel',
  'Nell', 'Gideon', 'Ida', 'Amos', 'Pearl', 'Levi', 'Opal', 'Rhett', 'Tobias', 'Della', 'Ezra', 'Winnie',
];
export const LAST_NAMES = [
  'Crane', 'Holloway', 'Vance', 'Merritt', 'Shaw', 'Pruitt', 'Lark', 'Dunmore', 'Keel', 'Ashby',
  'Rourke', 'Tate', 'Breck', 'Sutter', 'Winslow', 'Hale', 'Carver', 'Moss',
];
export const BIOS = [
  'Ran cattle until the drought took the herd.', 'Deserted the cavalry and never looked back.',
  'Owes money to half the saloons in the territory.', 'Came west to bury a brother and stayed.',
  'Used to drive the Mercy stagecoach.', 'Was a Meridian surveyor, once.', 'Nobody knows. Nobody asks.',
  'Wrote dime novels back east and wanted to see the real thing.', 'Grew up in Mercy when it still had a mayor.',
];
export const OUTLAW_FIRST = ['Silas', 'Jack', 'Dutch', 'Cyrus', 'Lem', 'Hob', 'Virgil', 'Sal', 'Moses', 'Ike'];
export const OUTLAW_NICK = ['Two-Bit', 'Snake-Eye', 'Gravedigger', 'Blackwater', 'Lucky', 'Red', 'Parson', 'Tin Cup'];
export const OUTLAW_LAST = ['Mercer', 'Pike', 'Granger', 'Coyle', 'Bramble', 'Stroud', 'Fenn', 'Larkin'];

/** Drifter looks: which body, hat and neckerchief colours. Index is stored on the character. */
export const DRIFTER_LOOKS = [
  { model: 'male-a', hat: '#8a623c', scarf: '#b5483a' },
  { model: 'female-a', hat: '#6f5136', scarf: '#d9a83a' },
  { model: 'male-b', hat: '#c9b48a', scarf: '#3f6e8c' },
  { model: 'female-f', hat: '#8a623c', scarf: '#b5483a' },
  { model: 'male-e', hat: '#5c4631', scarf: '#5b7f4b' },
  { model: 'female-d', hat: '#c9b48a', scarf: '#8e3428' },
  { model: 'male-f', hat: '#6f5136', scarf: '#d9a83a' },
  { model: 'female-b', hat: '#8a623c', scarf: '#3f6e8c' },
  { model: 'male-g', hat: '#3d342e', scarf: '#b5483a' },
  { model: 'female-c', hat: '#c9b48a', scarf: '#5b7f4b' },
  { model: 'male-d', hat: '#5c4631', scarf: '#d9a83a' },
  { model: 'female-e', hat: '#6f5136', scarf: '#8e3428' },
];

// ---- the town -----------------------------------------------------------------
export const SHOPS = {
  saloon: { name: 'Dry Fork Saloon', keeper: 'June Rourke', verb: 'See the job board', sign: 'SALOON' },
  store: { name: 'General Store', keeper: 'Hattie Pruitt', verb: 'Buy supplies', sign: 'GENERAL STORE' },
  gunsmith: { name: 'Gunsmith', keeper: 'Tess Shaw', verb: 'Look at the guns', sign: 'GUNSMITH' },
  outfitter: { name: 'Outfitter', keeper: 'Opal Lark', verb: 'Look at the gear', sign: 'OUTFITTER' },
  clinic: { name: 'Clinic', keeper: 'Doc Merritt', verb: 'See the doctor', sign: 'DOCTOR' },
  telegraph: { name: 'Telegraph Office', keeper: 'Unit E-7, "Eli"', verb: 'Read the wire', sign: 'TELEGRAPH' },
  hall: { name: 'Town Hall', keeper: 'Marshal Ada Quill', verb: 'Talk to the marshal', sign: 'TOWN HALL' },
  stable: { name: 'Livery Stable', keeper: 'Amos Keel', verb: 'Saddle up', sign: 'LIVERY' },
};

/** What townsfolk say. Keyed by role, then by how many chapters are done (last entry repeats). */
export const TALK = {
  marshal: [
    "Coyle's gang took a Meridian strongbox into Dry Fork canyon. I need someone who shoots straighter than they do. Bring it back and the company pays the town.",
    'You brought the box home, and I saw what was in it. That is no kind of gold. The Free Rider at the saloon knows where it was headed. Talk to her.',
    'Site 9. Eleven years I have been marshal here and nobody told me the company had a second set of books. Help the Rider get them.',
    'A ship. Under our feet, all this time. The ledger says the machines listen to relay masts. Burn three of them out and maybe this valley gets some quiet.',
    'The machines went still for a mile around. Now finish it: the Calloway crew kept a key to the lower gate. Go down the mine and get it.',
    'A key that cold has no business in a living hand. The Rider knows the way past the gate. Do what you have to.',
    'The ship has gone quiet, but Site 9 is still stamping out machines. The Riders have a plan. Hear them out.',
    'Voss is at the depot with everything the company has left. I would ride with you, but somebody has to keep the town standing. End it.',
    'You did what the law could not. Mercy will remember it. There is always more work on the board.',
  ],
  rider: [
    'Meridian pays in scrip and takes it back at the company store. Remember that when you carry their box. Talk to the marshal, she is the one hiring.',
    'One of ours carried a map out of the Red Country and never arrived. Dry Fork rail station. Bring back his satchel, and mind the machines.',
    'The map is good. Two canyons east, behind wire. Go in, find their ledger, and let us see what they are hiding.',
    'So now you know what is under the mine. The marshal has an idea about those relay masts. It is a good one.',
    'With the masts down the mine road is open. The marshal wants that key. So do we.',
    "The gate opens after dark. Past it is the hull. Take the shard from the ship's heart and get out. Do not listen to whatever follows you.",
    'The foundry at Site 9 has one machine that thinks: the Overseer. We will hit the fence and pull the guards. You kill it.',
    'Voss signed every page of that ledger. He does not get to walk away. The marshal is waiting on you.',
    'The Riders owe you. That is worth more than company scrip.',
  ],
  agent: [
    'The Meridian Company rewards initiative. Return our property unopened and you will find us generous.',
    'A satisfactory beginning. I trust the strongbox stayed shut. The company remembers its friends.',
    'There are places in this territory that do not concern you. I trust you understand me.',
    'Whatever you believe you read, it is company business. Name a price.',
    'Those relays were expensive. So are you becoming.',
    'You are meddling with an investment older and larger than this town.',
    'Return the shard. I am asking politely, which Mr Voss will not.',
    'Mr Voss does not negotiate. I would leave Mercy tonight, if I were you.',
    'The board has written off the Calloway works. For now.',
  ],
  barkeep: [
    'First one is free for anybody the marshal hires. She is outside the Town Hall. Jobs are on the board by the door.',
    'Folk are talking about you. Mostly good. The Rider in the corner has been asking after you.',
    'Heard the Riders have their eye on something east of here.',
    'A ship from the sky. I have poured drinks for forty years and that is the first thing to surprise me.',
    'Old Tin Deputy twitched this morning when the masts went down. Gave me a turn.',
    'Nobody drinks at the Calloway end of the bar any more.',
    'You look like you have not slept. Neither has anyone who came back from down there.',
    'Company men cleared out this morning. All of them.',
    'Sit. You have earned the good bottle.',
  ],
  townsfolk: [
    'Water is low and the company wants the well.',
    'You the new gun? Try not to die on the main street. It upsets the horses.',
    'Those sentry machines never blink. I counted once. Gave up at an hour.',
    'My brother went to work the Calloway shaft. That was four years ago.',
    'The machines just stopped, out past the ridge. Standing there like scarecrows.',
    'Mind the wind after sundown. It carries voices now.',
    'They say you walked into the dark and walked back out.',
    'If Voss comes, we are not running. Not again.',
    'Morning. It is a good one, for once.',
  ],
  undertaker: [
    'Every stone up there had a name and a horse. I keep the names. The horses wander back on their own.',
  ],
};

/** Telegraph wording for ledger events. */
export const TELEGRAMS = {
  CAMPAIGN_STARTED: () => 'MERCY NEEDS HANDS STOP MERIDIAN COMPANY PAYING FOR LOST FREIGHT STOP SEE THE MARSHAL STOP',
  DRIFTER_ARRIVED: (d) => `${d.name} RODE INTO MERCY TODAY STOP`,
  SHIPMENT_DELIVERED: () => 'MERIDIAN STRONGBOX RECEIVED STOP CONTENTS WERE NOT GOLD STOP MANIFEST NAMES SITE 9 STOP',
  SATCHEL_DELIVERED: () => 'SURVEY MAP RECOVERED STOP A FENCED COMPOUND MARKED SITE 9 STANDS IN THE RED COUNTRY STOP',
  EVIDENCE_SECURED: () => 'YOU HOLD THE SITE 9 LEDGER STOP A SHIP LIES UNDER THE CALLOWAY SHAFT STOP DECIDE WHO GETS TO READ IT STOP',
  EVIDENCE_EXPOSED: () => 'FREE RIDERS PRINT THE SITE 9 LEDGER STOP MERIDIAN DENIES EVERYTHING STOP',
  EVIDENCE_SOLD: () => 'MERIDIAN THANKS YOU FOR YOUR DISCRETION STOP 300 DOLLARS DEPOSITED STOP FORGET SITE 9 STOP',
  RELAYS_DOWN: () => 'THREE COMPANY RELAYS DESTROYED STOP MACHINES IN THE RED COUNTRY STANDING IDLE STOP GUNSMITH NOW BUILDS ENERGY WEAPONS STOP',
  KEY_FOUND: () => 'THE CALLOWAY BORE KEY IS OUT OF THE GROUND STOP THE LOWER GATE OPENS AFTER DARK STOP',
  SHARD_TAKEN: () => 'THE SHIP IS GOING QUIET STOP SITE 9 FOUNDRY RUNNING DAY AND NIGHT ON STOCKPILED CORES STOP',
  OVERSEER_DEAD: () => 'SITE 9 FOUNDRY DESTROYED STOP FOREMAN VOSS EN ROUTE TO DRY FORK DEPOT STOP HE WANTS WHAT YOU CARRIED OUT STOP',
  FOREMAN_DEAD: (d) => (d.exposed
    ? 'VOSS IS DEAD STOP NEWSPAPERS IN THREE STATES CARRY THE LEDGER STOP MERIDIAN STOCK IS WORTHLESS STOP MERCY STANDS STOP'
    : 'VOSS IS DEAD STOP THE COMPANY NAMES A NEW FOREMAN BY SPRING STOP MERCY STANDS FOR NOW STOP'),
  JOB_DONE: (d) => `JOB SETTLED STOP ${String(d.title).toUpperCase()} STOP`,
  DRIFTER_DIED: (d) => `${d.name} DID NOT COME BACK STOP KILLED BY ${String(d.killer).toUpperCase()} STOP`,
  DRIFTER_FLED: (d) => `${d.name} RODE BACK TO MERCY EMPTY HANDED STOP`,
  LOST_TO_HOLLOW: (d) => `${d.name} WALKED INTO THE DARK STOP THE HOLLOW KEEPS WHAT IT TAKES STOP`,
  BOUNTY_POSTED: (d) => `WANTED ${String(d.outlaw).toUpperCase()} STOP CARRYING THE EFFECTS OF ${d.victim} STOP`,
  BOUNTY_GREW: (d) => `${String(d.outlaw).toUpperCase()} NOW CARRIES THE EFFECTS OF ${d.victim} TOO STOP REWARD RAISED STOP`,
  BOUNTY_CLAIMED: (d) => `${String(d.outlaw).toUpperCase()} IS DEAD STOP THE EFFECTS OF ${d.victims} ARE HOME STOP`,
  BOUNTY_SLAIN_UNCLAIMED: (d) => `${String(d.outlaw).toUpperCase()} IS DEAD STOP WHAT THEY CARRIED IS STILL OUT THERE STOP`,
  INVESTED: (d) => `${String(d.name).toUpperCase()} STOP DONE STOP MERCY IS GRATEFUL STOP`,
};
