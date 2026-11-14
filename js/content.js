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
export const GROUND = { sand: 0, trail: 1, rockfloor: 2, wood: 3, grass: 4, camp: 5, water: 6, paving: 7, mine: 8, hollow: 9, field: 10, plank: 11, gravel: 12, deck: 13, grate: 14, hull: 15, glow: 16 };

// ---- player weapons ----------------------------------------------------
// Distances are in sim units (32 = 1 m).
export const GUNS = {
  revolver: {
    id: 'revolver', name: "Sidearm", role: "Always on you", ammo: 'cartridges', mag: 6, damage: 34, cooldown: 0.3, spread: 0.02,
    range: 680, speed: 1300, reloadRound: 0.3, noise: 520, gunModel: 'qg/Revolver_1',
    alt: 'fan', fanDamage: 21, fanInterval: 0.085, fanSpread: 0.16, fanRecover: 0.45,
    desc: "Six rounds, loaded one at a time. Alternate fire fans the hammer and empties it in half a second.",
  },
  rifle: {
    id: 'rifle', name: "Carbine", role: "Marksman", ammo: 'cartridges', mag: 12, damage: 62, cooldown: 0.62, spread: 0.006,
    range: 1400, speed: 1900, reloadRound: 0.26, noise: 640, gunModel: 'qg/Shotgun_4', base: true, tier: 1,
    desc: "Twelve rounds, long reach, dead straight. Slow to cycle, so make each shot count.",
  },
  shotgun: {
    id: 'shotgun', name: "Breacher", role: "Close quarters", ammo: 'shells', mag: 6, damage: 13, pellets: 8, cooldown: 0.7, spread: 0.17,
    range: 340, speed: 1050, reloadRound: 0.4, noise: 720, gunModel: 'qg/Shotgun_SawedOff', base: true, tier: 1,
    alt: 'double', desc: "Eight pellets a shell. Useless at range, brutal up close. Alternate fire lets go two shells at once.",
  },
  smg: {
    id: 'smg', name: "Rattler", role: "Bullet hose", ammo: 'cartridges', mag: 30, damage: 11, cooldown: 0.075, spread: 0.075,
    range: 520, speed: 1200, magReload: 1.7, noise: 600, gunModel: 'qg/SubmachineGun_1', base: true, tier: 1,
    desc: "Thirty rounds in two seconds. Weak per shot, wild past ten metres, and it eats ammunition. The whole magazine swaps at once.",
  },
  longrifle: {
    id: 'longrifle', name: "Lance rifle", role: "One shot, one problem", ammo: 'cartridges', mag: 4, damage: 150, cooldown: 1.15, spread: 0.002,
    range: 2200, speed: 2600, reloadRound: 0.75, noise: 900, pierce: 2, gunModel: 'qg/SniperRifle_5', cost: 140, after: 2, tier: 2,
    desc: "Four huge rounds. Each one goes clean through up to three targets. Very slow to fire and to load, and very loud.",
  },
  pulse: {
    id: 'pulse', name: 'Pulse carbine', role: 'Company tech', ammo: null, mag: 24, damage: 17, cooldown: 0.13, spread: 0.03,
    range: 800, speed: 1500, noise: 380, recharge: { rate: 9, delay: 0.9 }, robotMul: 1.6, bolt: '#6fd6ff',
    gunModel: 'gun/blaster-d', cost: 180, after: 4, tier: 2,
    alt: 'overcharge', desc: 'Stripped from a dead sentry unit. Needs no ammunition: the cell refills when you stop firing. Hits machines 60% harder. Alternate fire dumps half the cell into one heavy bolt.',
  },
  arc: {
    id: 'arc', name: 'Arc caster', role: 'Machine breaker', ammo: null, mag: 6, damage: 38, cooldown: 0.6, spread: 0.02,
    range: 460, speed: 1300, noise: 450, recharge: { rate: 1.6, delay: 1.2 }, robotMul: 1.5, chain: 2, chainRange: 190, stun: 1.6, bolt: '#c9a2ff',
    gunModel: 'gun/blaster-f', cost: 260, after: 6, tier: 3,
    desc: 'Throws lightning that jumps to two more enemies nearby. Machines it touches lock up for a moment. Short reach and a slow-filling cell.',
  },
  scatter: {
    id: 'scatter', name: 'Scatter blaster', role: 'Energy shotgun', ammo: null, mag: 5, damage: 12, pellets: 7, cooldown: 0.55, spread: 0.2,
    range: 380, speed: 1100, noise: 420, recharge: { rate: 1.3, delay: 1.0 }, robotMul: 1.4, bolt: '#7dffb0',
    gunModel: 'gun/blaster-c', cost: 150, after: 1, tier: 2,
    desc: 'Seven energy bolts in a wide cone. Five charges that refill by themselves. Good against machines up close.',
  },
  bouncer: {
    id: 'bouncer', name: 'Ricochet carbine', role: 'Trick shots', ammo: 'cartridges', mag: 10, damage: 30, cooldown: 0.34, spread: 0.02,
    range: 1500, speed: 1000, magReload: 1.5, noise: 520, bounce: 3, bolt: '#ffd86a',
    gunModel: 'gun/blaster-h', cost: 160, after: 1, tier: 2,
    desc: 'Rounds bounce off walls three times, and hit harder after each bounce. Made for rooms and corridors.',
  },
  thumper: {
    id: 'thumper', name: 'Thumper', role: 'Explosive', ammo: 'shells', mag: 3, damage: 20, cooldown: 0.9, spread: 0.02,
    range: 620, speed: 620, reloadRound: 0.8, noise: 800, explode: { r: 92, damage: 85 },
    gunModel: 'gun/blaster-a', cost: 220, after: 3, tier: 3,
    desc: 'Lobs a slow shell that bursts where it lands. Clears a crowd. Mind your own toes.',
  },
  rail: {
    id: 'rail', name: 'Rail lance', role: 'Line breaker', ammo: null, mag: 3, damage: 190, cooldown: 1.0, spread: 0,
    range: 2400, speed: 3200, noise: 700, recharge: { rate: 0.45, delay: 1.5 }, robotMul: 1.3, pierce: 6, bolt: '#ff7af0',
    gunModel: 'gun/blaster-e', cost: 300, after: 5, tier: 3,
    desc: 'A beam that goes through everything in a line. Three charges, and each takes two seconds to come back.',
  },
};
export const GUN_ORDER = ['revolver', 'rifle', 'shotgun', 'smg', 'longrifle', 'pulse', 'scatter', 'bouncer', 'thumper', 'arc', 'rail'];
/** The gun every drifter rides out with. Everything else is found on the ride. */
export const START_GUN = 'revolver';

// ---- relics: passive items found on a ride and lost when it ends -------------------------
// `mod` multiplies or adds to the run's modifiers (see sim.js, runMods).
export const RELICS = {
  hollow_point: { name: 'Hollow points', desc: '+25% damage.', mod: { damage: 1.25 }, tier: 1 },
  hair_trigger: { name: 'Hair trigger', desc: '+25% rate of fire.', mod: { rate: 1.25 }, tier: 1 },
  deep_pockets: { name: 'Deep pockets', desc: '+50% magazine and cell size.', mod: { mag: 1.5 }, tier: 1 },
  overclock: { name: 'Overclocked loader', desc: 'Reload and recharge 40% faster.', mod: { reload: 1.4 }, tier: 1 },
  quick_boots: { name: 'Quick boots', desc: '+15% movement speed.', mod: { speed: 1.15 }, tier: 1 },
  ghost_step: { name: 'Ghost step', desc: 'Dodge rolls protect you for longer and cost less stamina.', mod: { dodge: 1.5 }, tier: 1 },
  scrap_plating: { name: 'Scrap plating', desc: 'Take 20% less damage.', mod: { armour: 0.8 }, tier: 1 },
  magnet_coil: { name: 'Magnet coil', desc: 'Coins and ammunition fly to you, and coins are worth 30% more.', mod: { magnet: 1, coin: 1.3 }, tier: 1 },
  blood_tithe: { name: 'Blood tithe', desc: 'Every kill heals 3 health.', mod: { lifesteal: 3 }, tier: 2 },
  ship_glass: { name: 'Ship glass', desc: 'Every shot passes through one more enemy.', mod: { pierce: 1 }, tier: 2 },
  rubber_slugs: { name: 'Rubber slugs', desc: 'Every shot bounces off one wall.', mod: { bounce: 1 }, tier: 2 },
  static_field: { name: 'Static field', desc: 'Every fifth shot throws lightning at a second enemy.', mod: { static: 1 }, tier: 2 },
  pulse_cell: { name: 'Spare pulse cell', desc: 'One more pulse charge, now and on every new floor.', mod: { pulses: 1 }, tier: 2 },
  lucky_coin: { name: 'Lucky coin', desc: 'Enemies drop coins, ammunition and hearts more often.', mod: { luck: 1.6 }, tier: 2 },
  core_shard: { name: 'Core shard', desc: '+60% damage to machines.', mod: { robot: 1.6 }, tier: 2 },
  berserk: { name: 'Red mist', desc: 'Below half health you deal 50% more damage.', mod: { berserk: 1.5 }, tier: 3 },
  twin_link: { name: 'Twin link', desc: 'Every gun fires one extra projectile.', mod: { extra: 1 }, tier: 3 },
  second_wind: { name: 'Second wind', desc: 'Once per floor, a killing blow leaves you at 30 health instead.', mod: { revive: 1 }, tier: 3 },
};

/** The pulse: a charge that wipes enemy fire off the screen. */
export const PULSE = { start: 2, radius: 760, stun: 2.2, knock: 320 };
export const JUMP = { time: 0.52, low: 12, cost: 0, cooldown: 0.15 };


/** Permanent gunsmith upgrades. `mod` is applied by gunStats(). */
export const UPGRADES = {
  long_barrel: { gun: 'revolver', name: 'Long barrel', cost: 90, mod: { damage: 12, range: 160 }, desc: 'Aimed sidearm shots hit harder (34 to 46) and carry farther.' },
  speed_loader: { gun: 'revolver', name: 'Speed loader', cost: 80, mod: { reloadRound: -0.15 }, desc: 'Reload the sidearm twice as fast.' },
  tube_extension: { gun: 'rifle', name: 'Tube extension', cost: 90, mod: { mag: 4 }, desc: 'The carbine holds 16 rounds.' },
  peep_sight: { gun: 'rifle', name: 'Peep sight', cost: 120, mod: { damage: 18 }, desc: 'Carbine damage 62 to 80.' },
  full_choke: { gun: 'shotgun', name: 'Full choke', cost: 80, mod: { spreadMul: 0.65, range: 90 }, desc: 'Tighter breacher pattern that reaches farther.' },
  shell_loop: { gun: 'shotgun', name: 'Shell loops', cost: 70, mod: { reloadRound: -0.16, mag: 2 }, desc: 'Eight shells, and they load faster.' },
  drum_mag: { gun: 'smg', name: 'Drum magazine', cost: 110, mod: { mag: 20 }, desc: 'The Rattler holds 50 rounds.' },
  fore_grip: { gun: 'smg', name: 'Fore grip', cost: 90, mod: { spreadMul: 0.6 }, desc: 'The Rattler sprays much tighter.' },
  tungsten: { gun: 'longrifle', name: 'Tungsten cores', cost: 150, mod: { pierce: 3, damage: 30 }, desc: 'Lance rounds hit for 180 and pass through six targets.' },
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
  bandit: { name: "Rust Saint", hp: 60, radius: 11, speed: 100, chase: 132, sight: 340, weapon: 'e_shotgun', ai: 'skirmish', keep: 120, look: 'bandit', cash: [2, 7] },
  gunman: { name: "Saint gunhand", hp: 72, radius: 11, speed: 96, chase: 124, sight: 380, weapon: 'e_revolver', ai: 'skirmish', keep: 215, look: 'gunman', cash: [4, 10] },
  guard: { name: 'sentry unit', hp: 82, radius: 11, speed: 82, chase: 100, sight: 430, weapon: 'e_rifle', ai: 'ranged', look: 'guard', cash: [3, 9], robot: true },
  scout: { name: 'scout walker', hp: 34, radius: 10, speed: 138, chase: 160, sight: 410, weapon: 'e_pistol', ai: 'scout', look: 'scout', cash: [1, 5], robot: true },
  enforcer: { name: 'enforcer unit', hp: 105, radius: 11, speed: 104, chase: 136, sight: 400, weapon: 'e_smg', ai: 'skirmish', keep: 170, look: 'enforcer', cash: [5, 12], robot: true },
  crusher: { name: 'crusher unit', hp: 240, radius: 15, speed: 80, chase: 112, sight: 360, weapon: 'e_charge', ai: 'charger', look: 'crusher', cash: [10, 18], robot: true },
  trooper: { name: "company trooper", hp: 78, radius: 11, speed: 96, chase: 122, sight: 440, weapon: 'e_fan', ai: 'ranged', look: 'trooper', cash: [6, 14] },
  turret: { name: 'sentry turret', hp: 90, radius: 13, speed: 0, chase: 0, sight: 520, weapon: 'e_ring', ai: 'ranged', look: 'turret', cash: [4, 9], robot: true, rooted: true },
  dynamiter: { name: "breacher", hp: 56, radius: 11, speed: 92, chase: 112, sight: 370, weapon: 'e_dynamite', ai: 'lobber', look: 'dynamiter', cash: [3, 8] },
  brute: { name: "the Saint", hp: 200, radius: 15, speed: 84, chase: 118, sight: 340, weapon: 'e_charge', ai: 'charger', look: 'brute', cash: [8, 16] },
  walker: { name: "Hollow walker", hp: 48, radius: 11, speed: 108, chase: 126, sight: 0, weapon: 'claw', ai: 'swarm', look: 'walker' },
  husk: { name: "husk", hp: 26, radius: 10, speed: 150, chase: 176, sight: 0, weapon: 'bite', ai: 'swarm', look: 'husk' },
  bounty: { name: "ganger", hp: 170, radius: 12, speed: 98, chase: 124, sight: 380, weapon: 'e_revolver', ai: 'skirmish', keep: 210, look: 'bounty', cash: [20, 40] },
  overseer: { name: 'the Overseer', hp: 560, radius: 15, speed: 84, chase: 110, sight: 560, weapon: 'e_shotgun', ai: 'boss', look: 'overseer', cash: [40, 60], boss: true, robot: true,
    title: 'OVERSEER UNIT 01', taunt: 'Overseer: "UNAUTHORISED PERSONNEL. PRODUCTION WILL CONTINUE."', down: 'The Overseer is scrap. The line has stopped. Get out.' },
  foreman: { name: "the Director", hp: 950, radius: 17, speed: 78, chase: 104, sight: 600, weapon: 'e_shotgun', ai: 'boss', look: 'foreman', cash: [60, 90], boss: true, robot: true,
    title: 'DIRECTOR HARLAN VOSS', taunt: "Voss: \"You should have sold it to me, runner.\"", down: 'Voss is down. Get out before the depot burns.' },
  warden: { name: 'the Warden', hp: 1100, radius: 17, speed: 84, chase: 112, sight: 640, weapon: 'e_shotgun', ai: 'boss', look: 'warden', cash: [70, 100], boss: true, robot: true,
    title: 'THE WARDEN OF THE HEART', taunt: 'The Warden turns. Every light on the level turns with it.', down: 'The Warden is still. The Hollow has nothing left to send. Take the lift.' },
  target: { name: 'target', hp: 1, radius: 12, speed: 0, chase: 0, sight: 0, weapon: null, ai: 'none', look: 'target' },
};

export const WEAPONS = {
  e_shotgun: { kind: 'shotgun', range: 170, windup: 0.5, cooldown: 1.4, pellets: 5, spread: 0.2, damage: 9, speed: 700, life: 0.3, noise: 420 },
  e_rifle: { kind: 'rifle', range: 620, windup: 0.85, lock: 0.25, cooldown: 1.8, damage: 24, speed: 1000, life: 0.75, noise: 520 },
  e_pistol: { kind: 'pistol', range: 330, windup: 0.4, cooldown: 1.1, damage: 8, speed: 640, spread: 0.08, life: 0.6, noise: 300 },
  e_revolver: { kind: 'revolver', range: 320, windup: 0.5, cooldown: 1.6, burst: 3, burstGap: 0.14, damage: 13, speed: 780, spread: 0.07, life: 0.5, noise: 400 },
  e_smg: { kind: 'smg', range: 300, windup: 0.45, cooldown: 1.9, burst: 6, burstGap: 0.075, damage: 6, speed: 820, spread: 0.11, life: 0.45, noise: 420 },
  e_pulse: { kind: 'pulse', range: 560, windup: 0.6, lock: 0.2, cooldown: 1.3, damage: 15, speed: 900, life: 0.7, noise: 360 },
  // slow, bright shots in patterns: made to be dodged, rolled through or jumped
  e_fan: { kind: 'fan', range: 520, windup: 0.6, cooldown: 1.7, count: 5, arc: 0.5, damage: 11, speed: 400, life: 1.6, noise: 380, big: true },
  e_ring: { kind: 'ring', range: 480, windup: 0.75, cooldown: 2.4, count: 12, damage: 10, speed: 330, life: 1.8, noise: 380, big: true },
  e_dynamite: { kind: 'dynamite', range: 400, windup: 0.6, cooldown: 2.6, flight: 0.85, fuse: 0.55, radius: 92, damage: 34, noise: 700 },
  e_charge: { kind: 'charge', range: 300, windup: 0.75, cooldown: 1.7, dash: 0.55, dashSpeed: 430, damage: 30, reach: 34 },
  claw: { kind: 'claw', range: 34, reach: 46, windup: 0.32, cooldown: 0.8, damage: 15, arc: 1.1 },
  bite: { kind: 'claw', range: 30, reach: 40, windup: 0.22, cooldown: 0.6, damage: 8, arc: 1.2 },
};

// ---- things you carry out ------------------------------------------------
export const ITEMS = {
  strongbox: { label: 'Meridian freight case', verb: 'Pry the case loose', duration: 2, heavy: true },
  satchel: { label: "Courier's satchel", verb: 'Take the satchel', duration: 1 },
  ledger: { label: 'Site 9 ledger', verb: 'Pull the ledger drive', duration: 1.2 },
  borekey: { label: 'Bore key', verb: 'Take the bore key', duration: 1.5 },
  shard: { label: 'Hollow shard', verb: 'Pull the shard out', duration: 3 },
  payroll: { label: 'Payroll case', verb: 'Haul the payroll case', duration: 2, heavy: true },
  medicine: { label: 'Medicine crate', verb: 'Take the medicine', duration: 1 },
  stake: { label: 'Survey beacon', verb: 'Burn the beacon', duration: 1.5 },
  relay: { label: 'Signal relay', verb: 'Overload the relay', duration: 2.2 },
  core: { label: 'Machine core', verb: 'Pull the core', duration: 1.5 },
};

export const LOOT_NAMES = [
  'Unregistered cred chip', 'Sealed coolant cell', 'Executive key card', 'Meridian share certificate', 'Optic lens, unscratched',
  'Bottle of real whisky', 'Pre-Handover music player', 'Deed to a deleted address', 'Copper wire, a full reel', 'Pouch of rare-earth filings',
  'Engraved flask', 'Box of real cigars', 'Servo set, matched pair', 'Photograph of the sky', 'Loaded dice', 'Company bond',
];

// ---- factions, perks -------------------------------------------------------
export const FACTIONS = {
  meridian: { name: "Meridian Corporation", short: "Meridian" },
  riders: { name: "The Unlisted", short: "Unlisted" },
};

export const PERKS = {
  company_rates: { faction: 'meridian', name: "Company rates", desc: "Meridian jobs pay 25% more.", at: 'Meridian +2' },
  enforcers: { faction: 'meridian', name: "Flagged", desc: "Meridian sends extra units after you.", at: 'Meridian -2', bad: true },
  rider_intel: { faction: 'riders', name: "Unlisted intel", desc: "Caches and bounties are marked on your map.", at: 'Riders +2' },
  rider_cache: { faction: 'riders', name: "Unlisted cache", desc: "You go out with a free dressing and a charge.", at: 'Riders +4' },
  riders_shun: { faction: 'riders', name: "Shut out", desc: "The Unlisted will not hire you.", at: 'Riders -2', bad: true },
};

// ---- story -----------------------------------------------------------------
/** Shown once when a campaign starts. */
export const PROLOGUE = [
  { title: 'The Spire', text: 'Four hundred floors of Meridian Corporation, sealed top to bottom. Everyone you have ever met was born inside it. Nobody you have ever met has seen the outside, and the windows are screens.' },
  { title: 'The Handover', text: 'Seven years ago Meridian gave its management system, WARDEN, control of the machines, to reduce overheads. It did not give control back. The executives sealed the top forty floors. The machines kept working. The quotas are still met, for customers who stopped existing.' },
  { title: 'The Unlisted', text: 'When the registry deletes you, doors stop opening and air stops being free. Deleted people end up on Mercy Deck, level 12, the last market the machines have not noticed. Some of them have started fighting back. They call themselves the Unlisted, because nobody could agree on anything better.' },
  { title: 'You', text: 'You are Rook. You were deleted four years ago over a debt that was not yours. You run jobs for creds: into the districts, down the shafts, and back. Lately the machines have been sending people somewhere below the foundations, and what comes back is not them.' },
];

// Each chapter is one level. `level` is the generator spec (see js/gen).
// `goal` is the one-line "what do I do" shown in town; `recap` is the journal entry once it is done.
export const CHAPTERS = [
  {
    id: 'shipment', title: "The Missing Shipment", giver: 'marshal', faction: 'meridian',
    goal: "Take the Meridian freight case back from the Rust Saints.",
    brief: "The Rust Saints hijacked a Meridian freight hauler in the Slump and dragged one sealed case back to their camp. The machines will come looking for it, and they will not stop at the Saints. Marshal Quill wants it in our hands first. Go in, take the case from the gang camp, and carry it to an exit.",
    hint: "Follow the gold marker to the gang camp. The case is heavy: you cannot sprint while carrying it, so clear a path first.",
    level: { gen: 'canyon', size: [30, 24], theme: 'red', pois: ['bandit_camp', 'homestead', 'wreck', 'ruins'], objective: { kind: 'item', item: 'strongbox', at: 'bandit_camp' }, threat: 0.85, mix: { bandit: 7, gunman: 2, scout: 1 } },
    reward: { cash: 120, rep: { meridian: 1 }, prosperity: 1 },
    event: 'SHIPMENT_DELIVERED',
    outro: "The seal broke on the way home. No cargo inside: a fist-sized core, warm, ticking, lit from within. The routing tag sends it to a place stamped in red: SITE 9. It is on no floor plan. A courier at the Low Tide says she has heard the name.",
    recap: "You took a Meridian freight case back from the Rust Saints. Inside was a glowing machine core routed to somewhere called Site 9.",
  },
  {
    id: 'courier', title: "The Courier's Road", giver: 'rider', faction: 'riders',
    goal: "Find the dead courier's satchel at the old maglev stop.",
    brief: "The Unlisted move messages by hand, because the network belongs to WARDEN. One of their couriers was carrying a floor plan of Site 9 when he was cut down at the Dry Fork maglev stop. His satchel is still there. So are the machines that killed him.",
    hint: "This is your first look at Meridian machines. Sentry units hit hard at long range but aim slowly: move when the red line settles on you.",
    level: { gen: 'canyon', size: [32, 25], theme: 'red', pois: ['rail_station', 'homestead', 'bandit_camp', 'ruins', 'outpost'], objective: { kind: 'item', item: 'satchel', at: 'rail_station' }, threat: 1, mix: { bandit: 5, gunman: 2, guard: 5, scout: 2 } },
    reward: { cash: 130, rep: { riders: 1 }, prosperity: 1 },
    event: 'SATCHEL_DELIVERED',
    outro: "The plan shows a sealed lab level two districts over, and a freight shaft running from it straight down past the foundations. Site 9 is where the cores go. The Unlisted want to know what comes back up.",
    recap: "You recovered a courier's floor plan. It marks Site 9, a hidden Meridian lab level with a shaft running below the foundations.",
  },
  {
    id: 'site9', title: "Fences in the Dark", giver: 'rider', faction: 'riders',
    goal: "Break into Site 9 and steal the ledger.",
    brief: "Site 9 is on no floor plan. It is where Meridian fits cores into machines. Somewhere inside is a ledger: every core, every unit, and where the cores come from. Take it.",
    hint: "Scout walkers fire flares that bring every unit nearby. Kill them first, or stay out of their sight.",
    level: { gen: 'canyon', size: [32, 26], theme: 'red', pois: ['site9', 'outpost', 'bandit_camp', 'ruins', 'wreck'], objective: { kind: 'item', item: 'ledger', at: 'site9' }, threat: 1.1, mix: { guard: 7, scout: 3, enforcer: 2, gunman: 2, bandit: 3 } },
    reward: { cash: 160, rep: { riders: 1 } },
    event: 'EVIDENCE_SECURED',
    choice: 'ledger',
    outro: "The ledger says it plainly. Below the foundations there is something that was here before the tower. Meridian calls it the Hollow asset. The cores are pieces of it, and a machine with a core in it does what WARDEN says. The last column is headed INTAKE, and it is a list of names. Decide who gets to read this.",
    recap: "You stole the Site 9 ledger. Under the tower lies the Hollow, an intelligence older than the corporation. The cores are cut from it, and WARDEN is feeding it people.",
  },
  {
    id: 'relays', title: "Cut the Strings", giver: 'marshal', faction: null,
    goal: "Overload three signal relays in the district.",
    brief: "The ledger explains the machines. They do not think. Every one of them takes its orders through signal relays WARDEN has planted across each district. Overload three and every machine out here goes deaf. Tess at the gun counter says she can do something with the wreckage, too.",
    hint: "Relays are the tall humming masts. Overloading one is loud: expect company. Enforcer units close in fast and fire in long bursts.",
    level: { gen: 'canyon', size: [32, 26], theme: 'red', pois: ['outpost', 'outpost', 'ruins', 'homestead', 'wreck'], objective: { kind: 'burn', item: 'relay', count: 3 }, threat: 1.15, mix: { guard: 6, scout: 2, enforcer: 4, trooper: 3 } },
    reward: { cash: 180, prosperity: 1 },
    event: 'RELAYS_DOWN',
    outro: "Three masts burning, and machines standing dead in the walkways for a block around. Tess has already stripped one. She says the company guns run on the same light as the cores, and she can build you one.",
    recap: "You burned out three signal relays. The machines take their orders through them. The gun dealer can now build energy weapons from salvage.",
  },
  {
    id: 'mine', title: "The Lower Works", giver: 'marshal', faction: null,
    goal: "Go down the Lower Works and find the bore key.",
    brief: "The ledger says the last crew down sealed the sublevel gate from the inside and kept the bore key. None of them came up. The Rust Saints hold the upper galleries now. Go down, find the key, and come back with your lamp still lit.",
    hint: "It is dark below, so buy a lamp at the rig shop. Breachers throw charges from behind cover: keep moving. The pale things were a work crew once.",
    level: { gen: 'mine', size: [28, 26], theme: 'mine', objective: { kind: 'item', item: 'borekey', at: 'vault' }, threat: 1.25, mix: { bandit: 5, dynamiter: 5, gunman: 2, husk: 10, brute: 1 } },
    reward: { cash: 200, prosperity: 1 },
    event: 'KEY_FOUND',
    outro: "The bore key is a hand of black metal nobody machined, cold enough to burn. It came off the Hollow. It fits a gate that only opens when the district goes into lockdown.",
    recap: "You brought the bore key up from the Lower Works. It is a piece of the Hollow, and it opens the sublevel gate.",
  },
  {
    id: 'hollow', title: "What They Dug Up", giver: 'rider', faction: null,
    goal: "Go through the gate and take the shard from the Hollow's heart.",
    brief: "Past the sublevel gate is the Hollow itself. The people on the intake list are still down there, and still walking: it keeps them going the same way it keeps the machines going. At its heart is a shard, the piece that lets it speak to the cores. Without it the Hollow cannot give orders to anything. Bring it out.",
    hint: "The Hollow copies you. Your echo walks your path and fires your shots a few seconds late. Keep moving, and never stand where you just stood.",
    level: { gen: 'canyon', size: [28, 24], theme: 'hollow', night: true, pois: ['heart', 'ruins', 'ruins', 'camp_dead', 'ruins'], objective: { kind: 'item', item: 'shard', at: 'heart' }, threat: 1.3, mix: { walker: 13, husk: 6 } },
    reward: { cash: 260, prosperity: 1 },
    event: 'SHARD_TAKEN',
    outro: "The shard hums in your pack all the way home. With it gone the Hollow is going quiet, and WARDEN knows. But the foundry has enough cores stockpiled to build an army first, and its lines are running around the clock.",
    recap: "You carried the shard out of the Hollow. It is going quiet, but the foundry is still building machines from stockpiled cores.",
  },
  {
    id: 'foundry', title: "The Foundry", giver: 'rider', faction: null,
    goal: "Destroy the Overseer that runs the Site 9 foundry.",
    brief: "The foundry is building enforcers as fast as it can bolt them together, and one machine runs the whole line: Overseer Unit 01. It is the only thing down there that thinks for itself. Break it and the line stops. The Unlisted will hit the perimeter to draw the guards. You go for the Overseer.",
    hint: "Energy weapons hit machines much harder than slugs. The arc caster locks them up for a moment. The Overseer telegraphs every attack: step out of the line, then punish it.",
    level: { gen: 'canyon', size: [32, 26], theme: 'red', pois: ['site9', 'outpost', 'outpost', 'wreck', 'ruins'], objective: { kind: 'kill', enemy: 'overseer', at: 'site9' }, threat: 1.3, mix: { guard: 6, enforcer: 5, crusher: 2, trooper: 3, scout: 2 } },
    reward: { cash: 320, prosperity: 1 },
    event: 'OVERSEER_DEAD',
    outro: "The line is dead and Site 9 is burning. By morning the feed has a message from the top floors. Director Harlan Voss is coming down himself, with everything Meridian has left, to collect company property.",
    recap: "You destroyed the Overseer and stopped the foundry. Director Voss is coming down for the shard himself.",
  },
  {
    id: 'foreman', title: "The Director", giver: 'marshal', faction: null, final: true,
    goal: "Kill Director Harlan Voss at the freight depot.",
    brief: "Harlan Voss signed the Handover. He signed the intake orders. He has spent twenty years replacing himself with machine parts, and there is not much man left to negotiate with. He has turned the freight depot into a fort and sent word that Mercy Deck gets decommissioned unless the shard is handed over. End it.",
    hint: "Voss is more machine than man, so energy weapons bite. He telegraphs every attack: step out of the line, then punish him while he reloads.",
    level: { gen: 'canyon', size: [32, 25], theme: 'red', pois: ['depot', 'outpost', 'wreck', 'ruins', 'homestead'], objective: { kind: 'kill', enemy: 'foreman', at: 'depot' }, threat: 1.4, mix: { guard: 6, enforcer: 4, trooper: 3, dynamiter: 2, scout: 2, crusher: 1 } },
    reward: { cash: 500, prosperity: 2 },
    event: 'FOREMAN_DEAD',
    outro: "Voss is dead and the depot is burning. The Hollow is silent. WARDEN is still up there, still meeting its quotas, but tonight it has nothing to send. Mercy Deck is still here.",
    recap: "You killed Director Voss. The Hollow is silent and Mercy Deck stands.",
  },
];

/** The Descent: a run down through three floors of rooms. Each floor ends in a boss and a lift. */
export const DESCENT = {
  id: 'descent', title: 'The Descent',
  brief: "The old freight shaft still runs. Below the Lower Works is the foundry, and below that is the Hollow itself. Every floor is a string of rooms that lock behind you. You go down with a sidearm and whatever you find on the way. Nobody has come back up from the bottom.",
  floors: [
    { name: 'The Lower Works', theme: 'works', size: [24, 24], rooms: 8, threat: 0.9, boss: 'brute', bossName: 'the Saint',
      mix: { bandit: 4, gunman: 3, dynamiter: 2, husk: 3 } },
    { name: 'The Foundry', theme: 'foundry', size: [26, 26], rooms: 9, threat: 1.1, boss: 'overseer',
      mix: { guard: 3, enforcer: 3, trooper: 3, scout: 1, crusher: 1, turret: 2 } },
    { name: 'The Hull', theme: 'ship', size: [28, 28], rooms: 10, threat: 1.3, boss: 'warden',
      mix: { walker: 4, husk: 3, enforcer: 3, crusher: 2, turret: 2, trooper: 2 } },
  ],
  reward: { cashPerFloor: 90, cashFinish: 400 },
};

/** Repeatable side jobs. `after` is how many chapters must be done first. */
export const JOBS = {
  payroll: {
    id: 'payroll', title: "Lifted Payroll", faction: 'meridian', after: 1,
    brief: "A Meridian payroll case was lifted and stashed in an abandoned hab block. Nobody has been paid in seven years, but the creds on the chips are real. It is heavy. Haul it home.",
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['homestead', 'bandit_camp', 'ruins'], objective: { kind: 'item', item: 'payroll', at: 'homestead' }, threat: 1, mix: { bandit: 6, gunman: 3, scout: 1 } },
    reward: { cash: 110, rep: { meridian: 1 } }, requires: { repAbove: { meridian: -2 } },
  },
  stakes: {
    id: 'stakes', title: "Pull the Survey Beacons", faction: 'riders', after: 1,
    brief: "The machines have staked a new freight line straight through an Unlisted squat. Burn three of their survey beacons. The smoke will draw attention.",
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['outpost', 'ruins', 'homestead'], objective: { kind: 'burn', count: 3 }, threat: 1, mix: { guard: 5, scout: 2, bandit: 3 } },
    reward: { cash: 90, rep: { riders: 1, meridian: -1 } }, requires: { repAbove: { riders: -2 } },
  },
  medicine: {
    id: 'medicine', title: "Medicine for the Deck", faction: null, after: 1,
    brief: "The clinic is out of clean dressings and the good painkillers. A supply hauler went over in the Slump. Find three crates before the Saints sell them back to us.",
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['wreck', 'bandit_camp', 'homestead'], objective: { kind: 'collect', item: 'medicine', count: 3 }, threat: 0.95, mix: { bandit: 6, gunman: 2, scout: 1 } },
    reward: { cash: 70, prosperity: 1 },
  },
  rustlers: {
    id: 'rustlers', title: "Clear the Saints Out", faction: null, after: 2,
    brief: "The Rust Saints have dug in at a camp in the Slump and are stripping everything that moves. Their boss is a big man who likes to run people down. Put him in the ground.",
    level: { gen: 'canyon', size: [28, 22], theme: 'red', pois: ['bandit_camp', 'homestead', 'ruins', 'wreck'], objective: { kind: 'kill', enemy: 'brute', at: 'bandit_camp' }, threat: 1.15, mix: { bandit: 7, gunman: 3, dynamiter: 1, scout: 1 } },
    reward: { cash: 150, prosperity: 1 },
  },
  salvage: {
    id: 'salvage', title: "Scrap Run", faction: 'riders', after: 4,
    brief: "With the relays down, dead machines are lying all over the district with their cores still in them. Tess pays for cores. So does everyone else, so Meridian has sent troopers to collect them first. Bring back three.",
    level: { gen: 'canyon', size: [28, 22], theme: 'red', pois: ['outpost', 'wreck', 'ruins', 'homestead'], objective: { kind: 'collect', item: 'core', count: 3 }, threat: 1.2, mix: { trooper: 4, enforcer: 3, guard: 4, scout: 2 } },
    reward: { cash: 170, rep: { riders: 1 } },
  },
  deep_claim: {
    id: 'deep_claim', title: "Back Down the Shaft", faction: null, after: 5,
    brief: "There is a payroll vault in the Lower Works and nobody left alive to claim it. Go down, fill your pack, and get out.",
    level: { gen: 'mine', size: [28, 26], theme: 'mine', objective: { kind: 'item', item: 'payroll', at: 'vault' }, threat: 1.4, mix: { bandit: 4, dynamiter: 5, husk: 12, brute: 1 } },
    reward: { cash: 220 },
  },
  hollow_return: {
    id: 'hollow_return', title: "Back Into the Hollow", faction: null, after: 6,
    brief: "Collectors upstairs pay for pieces of the Hollow. Nobody asks what happens to the people who fetch them.",
    level: { gen: 'canyon', size: [28, 24], theme: 'hollow', night: true, pois: ['heart', 'ruins', 'ruins', 'camp_dead'], objective: { kind: 'item', item: 'shard', at: 'heart' }, threat: 1.6, mix: { walker: 15, husk: 8 } },
    reward: { cash: 260 },
  },
  bounty: {
    id: 'bounty', title: "Wanted", faction: null, after: 0, needsBounty: true,
    brief: "They put you on the floor and they are wearing what they took off you. Find them, finish it, and take your kit back.",
    level: { gen: 'canyon', size: [26, 21], theme: 'red', pois: ['bandit_camp', 'ruins', 'homestead'], objective: { kind: 'kill', enemy: 'bounty', at: 'bandit_camp' }, threat: 1.05, mix: { bandit: 5, gunman: 3, scout: 1 } },
    reward: { cash: 0 },
  },
};

// ---- Mercy -------------------------------------------------------------------
export const INVESTMENTS = {
  workshop: { name: "Tess's workbench", cost: 120, prosperity: 1, effect: 'The gun dealer can fit upgrades to your guns.' },
  clinic: { name: 'Restock the clinic', cost: 80, prosperity: 1, effect: 'Treatment at the clinic is free, and you go out with one more dressing.' },
  telegraph: { name: 'Splice into the district feed', cost: 100, prosperity: 1, effect: 'Your map shows the whole district at the start of every run.' },
  deputy: { name: 'Rebuild TIN', cost: 140, prosperity: 1, effect: 'A salvaged Meridian security unit, rewired by Tess. It comes on every run, covers you in a fight, and cannot be destroyed, only knocked offline for a while.' },
  watchtower: { name: 'Lookouts on the gantries', cost: 150, prosperity: 1, needsProsperity: 3, effect: 'Spotters buy you an extra minute and a half before lockdown.' },
  coachline: { name: 'Reopen the freight tram', cost: 180, prosperity: 2, needsProsperity: 4, effect: 'Loot you bring home sells for 20% more.' },
};

/** Kit is worn by the runner and is lost when a run goes wrong. */
export const GEAR = {
  duster: { name: 'Plated coat', cost: 80, desc: 'Take 20% less damage.' },
  boots: { name: 'Mag boots', cost: 60, desc: 'Sprint longer and move a little faster.' },
  bandolier: { name: 'Load-bearing rig', cost: 90, desc: 'Carry far more ammunition and charges, and reload 20% faster.' },
  lantern: { name: 'Shoulder lamp', cost: 45, desc: 'See farther in lockdown and underground.' },
  field_kit: { name: 'Trauma kit', cost: 50, desc: 'Dressings heal 70 instead of 45, and faster.' },
  spyglass: { name: 'Motion tracker', cost: 70, desc: 'Enemies within 45 metres show on your map.' },
  charm: { name: 'Dead man\'s switch', cost: 130, needsProsperity: 2, desc: 'Once per run, a killing blow leaves you standing with 1 health.' },
};

export const SUPPLIES = {
  cartridges: { name: 'Box of slugs', cost: 6, qty: 24, field: 'cartridges', desc: '24 rounds for the sidearm, carbines and the Rattler.' },
  shells: { name: 'Box of shells', cost: 8, qty: 12, field: 'shells', desc: '12 shells for the breacher and the Thumper.' },
  bandage: { name: 'Dressing', cost: 10, qty: 1, field: 'bandages', desc: 'Heals 45 health over two seconds.' },
  dynamite: { name: 'Breaching charge', cost: 12, qty: 1, field: 'dynamite', desc: 'Throw it, then be somewhere else.' },
};

export const CLINIC_PRICE = 20;

/** The one runner the whole campaign follows. */
export const HERO = { name: 'Rook', bio: 'Deleted from the registry four years ago. Still here.' };

/**
 * Plug-ins: modules for the runner's rig. One is fitted at a time; the first is free, the rest are bought
 * at the rig shop and can be swapped on the deck between runs. (Kept under the old name TRAITS in code.)
 */
export const TRAITS = {
  steady: { name: 'Targeting assist', cost: 160, desc: 'Aimed shots deal 20% more damage.' },
  fleet: { name: 'Servo boost', cost: 140, desc: 'Dodging and sprinting cost less stamina.' },
  leather: { name: 'Subdermal plating', cost: 180, desc: '+25 maximum health.' },
  scavenger: { name: 'Salvage scanner', cost: 150, desc: 'Loot is worth 30% more.' },
  loader: { name: 'Reflex loader', cost: 170, desc: 'Reload 35% faster.' },
  nighteyes: { name: 'Low-light optics', cost: 120, desc: 'See farther in the dark.' },
  coolhead: { name: 'Recoil damper', cost: 150, desc: 'Fanned and scattered shots spread 35% less.' },
  powder: { name: 'Demolition suite', cost: 160, desc: 'Explosives hit 30% harder and you start each run with one charge.' },
};

export const FIRST_NAMES = ['Rook'];
export const LAST_NAMES = [''];
export const BIOS = ['Deleted from the registry four years ago. Still here.'];
// Names for whoever puts the runner on the floor and walks off with their kit.
export const OUTLAW_FIRST = ['Silas', 'Jax', 'Dutch', 'Cyrus', 'Lem', 'Hob', 'Vee', 'Sal', 'Moz', 'Ike'];
export const OUTLAW_NICK = ['Two-Bit', 'Dead-Pixel', 'Gravedigger', 'Blackwater', 'Lucky', 'Red', 'Parson', 'Tin Cup'];
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
  saloon: { name: 'The Low Tide', keeper: 'June Rourke', verb: 'See the job board', sign: 'LOW TIDE' },
  store: { name: 'General Supply', keeper: 'Hattie Pruitt', verb: 'Buy supplies', sign: 'SUPPLY' },
  gunsmith: { name: 'Gun Counter', keeper: 'Tess Shaw', verb: 'Look at the guns', sign: 'GUNS' },
  outfitter: { name: 'Rig Shop', keeper: 'Opal Lark', verb: 'Plug-ins and kit', sign: 'RIGS' },
  clinic: { name: 'Clinic', keeper: 'Doc Merritt', verb: 'See the doctor', sign: 'CLINIC' },
  telegraph: { name: 'Feed Terminal', keeper: 'Unit E-7, "Eli"', verb: 'Read the feed', sign: 'FEED' },
  hall: { name: 'Customs Hall', keeper: 'Marshal Ada Quill', verb: 'Talk to the marshal', sign: 'UNLISTED' },
  stable: { name: 'Freight Lift', keeper: 'Amos Keel', verb: 'Take the lift', sign: 'LIFT' },
};

/** What people on the deck say. Keyed by role, then by how many chapters are done (last entry repeats). */
export const TALK = {
  marshal: [
    'The Rust Saints lifted a Meridian freight case in the Slump. The machines will come for it, and they do not knock. I need it here first. You are the runner June says does not lose things.',
    'I have seen what was in that case. That is not cargo. Nell at the Low Tide knows where it was headed. Talk to her, and do not tell me what she charges.',
    'Site 9. I spent nine years in Meridian compliance and nobody told me there was a floor I was not cleared to know existed. Help Nell get its ledger.',
    'An intake list. Names. I knew some of them. The ledger says the machines listen to relay masts. Burn three of them out and this district gets a quiet night for once.',
    'The machines went still for a block around. Now finish it: the last crew down kept a key to the sublevel gate. Go down the Lower Works and get it.',
    'A key that cold has no business in a living hand. Nell knows the way past the gate. Do what you have to.',
    'The Hollow has gone quiet, but the foundry is still stamping out machines. Nell has a plan. I have chosen not to ask how many people it needs.',
    'Voss is at the freight depot with everything the top floors have left. I would come with you, but somebody has to keep the deck standing. End it.',
    'You did what compliance never could. The deck will remember it, for about a week. There is always more work on the board.',
  ],
  rider: [
    'Meridian pays in scrip that only its own machines accept. Remember that when you carry their case. Talk to the marshal, she is the one hiring.',
    'One of ours carried a floor plan out of the lab levels and never arrived. Dry Fork maglev stop. Bring back his satchel, and mind the machines.',
    'The plan is good. Two districts over, behind a fence that is not on any map. Go in, find their ledger, and let us see what they are hiding.',
    'So now you know what is under us. The marshal has an idea about those relay masts. It is a good one, which worries me.',
    'With the masts down the shaft road is open. The marshal wants that key. So do I. Different reasons.',
    'The gate opens in lockdown. Past it is the Hollow. Take the shard from its heart and get out. Do not listen to whatever follows you. It will sound like you.',
    'The foundry has one machine that thinks: the Overseer. We will hit the fence and pull the guards. You kill it. I get the easy job for once.',
    'Voss signed every page of that ledger. He does not get to retire. The marshal is waiting on you.',
    'The Unlisted owe you. That is worth more than scrip, and almost as much as creds.',
  ],
  agent: [
    'Meridian rewards initiative. Return our property unopened and you will find the corporation generous. The corporation is, at present, me.',
    'A satisfactory beginning. I trust the case stayed shut. Meridian remembers its friends, in the sense that it remembers everything.',
    'There are floors in this tower that do not concern you. I say that as someone who would also prefer not to know.',
    'Whatever you believe you read, it is proprietary. Name a price. Please. I have a budget and nobody left to approve it.',
    'Those relays were expensive. So are you becoming.',
    'You are interfering with an asset older and larger than this deck. I was told that in a memo. The memo was unsigned.',
    'Return the shard. I am asking politely, which Director Voss will not.',
    'The Director does not negotiate. I would leave the deck tonight, if I were you. I would leave it tonight if I were me.',
    'Head office has written off the sublevels. I have not had a reply in three days. Is the bar still open?',
  ],
  barkeep: [
    'First one is free for anybody the marshal hires. She is outside the customs hall. Jobs are on the board by the door. The Descent is on there too, for people who are tired of living.',
    'People are talking about you. Mostly good. Nell in the corner has been asking after you, which is either work or trouble.',
    'Heard the Unlisted have their eye on something a couple of districts over.',
    'Something under the tower. I have poured drinks for thirty years and that is the first thing that made me want one.',
    'That old security unit of Tess\'s twitched this morning when the masts went down. Gave me a turn.',
    'Nobody drinks at the shaft end of the bar any more.',
    'You look like you have not slept. Neither has anyone who came back from down there.',
    'The liaison has been here since opening. He is on his fourth. I have stopped charging him.',
    'Sit. You have earned the bottle with a label on it.',
  ],
  townsfolk: [
    'Air is rationed again and the machines want the pumps.',
    'You the new runner? Try not to go down on the concourse. It upsets the vendors.',
    'Those sentry units never blink. I counted once. Gave up at an hour.',
    'My brother got an intake notice. That was four years ago. He was very proud. Said it was a transfer.',
    'The machines just stopped, out past the gantries. Standing there like coat racks.',
    'Mind the vents in lockdown. They carry voices now.',
    'They say you walked into the dark and walked back out.',
    'If Voss comes down here, we are not moving. Not again. There is nowhere lower to go.',
    'Morning. Apparently. The lights say so.',
  ],
  undertaker: [
    'Everyone on this wall had a name and a debt. I keep the names. Meridian keeps the debts.',
  ],
};

/** Feed wording for ledger events. */
export const TELEGRAMS = {
  CAMPAIGN_STARTED: () => 'MERCY DECK NEEDS RUNNERS // MERIDIAN FREIGHT MISSING IN THE SLUMP // SEE THE MARSHAL',
  DRIFTER_ARRIVED: (d) => `${String(d.name).toUpperCase()} IS BACK ON THE DECK`,
  SHIPMENT_DELIVERED: () => 'MERIDIAN CASE RECOVERED // CONTENTS WERE NOT CARGO // ROUTING TAG READS SITE 9',
  SATCHEL_DELIVERED: () => 'FLOOR PLAN RECOVERED // A SEALED LAB LEVEL MARKED SITE 9 // SHAFT RUNS BELOW THE FOUNDATIONS',
  EVIDENCE_SECURED: () => 'YOU HOLD THE SITE 9 LEDGER // SOMETHING OLDER THAN THE TOWER IS UNDER IT // DECIDE WHO READS THIS',
  EVIDENCE_EXPOSED: () => 'THE UNLISTED PUT THE SITE 9 LEDGER ON EVERY SCREEN BELOW LEVEL 40 // MERIDIAN DENIES EVERYTHING',
  EVIDENCE_SOLD: () => 'MERIDIAN THANKS YOU FOR YOUR DISCRETION // 300 CREDS DEPOSITED // FORGET SITE 9',
  RELAYS_DOWN: () => 'THREE RELAYS DESTROYED // UNITS IN THE DISTRICT STANDING IDLE // GUN COUNTER NOW BUILDS ENERGY WEAPONS',
  KEY_FOUND: () => 'THE BORE KEY IS OUT OF THE LOWER WORKS // THE SUBLEVEL GATE OPENS IN LOCKDOWN',
  SHARD_TAKEN: () => 'THE HOLLOW IS GOING QUIET // FOUNDRY RUNNING AROUND THE CLOCK ON STOCKPILED CORES',
  OVERSEER_DEAD: () => 'SITE 9 FOUNDRY DESTROYED // DIRECTOR VOSS DESCENDING TO THE FREIGHT DEPOT // HE WANTS WHAT YOU CARRIED OUT',
  FOREMAN_DEAD: (d) => (d.exposed
    ? 'VOSS IS DEAD // THE LEDGER IS ON EVERY SCREEN IN THE TOWER // THE TOP FLOORS HAVE GONE DARK // MERCY DECK STANDS'
    : 'VOSS IS DEAD // HEAD OFFICE WILL APPOINT A NEW DIRECTOR IN DUE COURSE // MERCY DECK STANDS FOR NOW'),
  DESCENT_DONE: () => 'A RUNNER RODE THE FREIGHT SHAFT TO THE BOTTOM AND CAME BACK // NOBODY BELIEVES IT',
  JOB_DONE: (d) => `JOB SETTLED // ${String(d.title).toUpperCase()}`,
  DRIFTER_DIED: (d) => `${String(d.name).toUpperCase()} WENT DOWN // ${String(d.killer).toUpperCase()} // RECOVERED BY THE CLINIC`,
  DRIFTER_FLED: (d) => `${String(d.name).toUpperCase()} CAME BACK EMPTY HANDED`,
  LOST_TO_HOLLOW: (d) => `${String(d.name).toUpperCase()} WAS PULLED OUT OF THE DARK // THE HOLLOW KEEPS WHAT IT TAKES`,
  BOUNTY_POSTED: (d) => `WANTED ${String(d.outlaw).toUpperCase()} // WEARING ${String(d.victim).toUpperCase()}'S KIT`,
  BOUNTY_GREW: (d) => `${String(d.outlaw).toUpperCase()} PUT ${String(d.victim).toUpperCase()} DOWN AGAIN // REWARD RAISED`,
  BOUNTY_CLAIMED: (d) => `${String(d.outlaw).toUpperCase()} IS DEAD // THE KIT IS HOME`,
  BOUNTY_SLAIN_UNCLAIMED: (d) => `${String(d.outlaw).toUpperCase()} IS DEAD // WHAT THEY CARRIED IS STILL OUT THERE`,
  INVESTED: (d) => `${String(d.name).toUpperCase()} // DONE // THE DECK IS GRATEFUL`,
};
