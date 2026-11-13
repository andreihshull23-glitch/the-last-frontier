// Boot, screen flow and the frame loop. rules.js owns the campaign; this file
// wires the rules, the sim, the renderer, input, audio, saving and the UI.
// Mercy and the rides are the same sim and the same third-person renderer.

import * as R from './rules.js';
import { CHAPTERS } from './content.js';
import { generateLevel } from './gen/index.js';
import { createSim, update, snapshot, restoreSim, nightFactor, haunted, focusPrompt, objectiveList, abandon } from './sim.js';
import { createAssets } from './gfx/assets.js';
import { createRenderer, webglAvailable } from './gfx/renderer.js';
import { toast } from './hud.js';
import { createControls } from './controls.js';
import { createAudio } from './audio.js';
import { createSaveManager } from './save.js';
import { createUI } from './ui.js';

const STEP = 1 / 60;
const RUN_SAVE_EVERY = 4;
const TURN_SPEED = 2.4;
const PITCH_SPEED = 1.1;
const SETTINGS_KEY = 'lf.settings';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const stage = document.getElementById('stage');
const canvas3d = document.getElementById('game3d');
const hudCanvas = document.getElementById('hud');
const uiRoot = document.getElementById('ui');
const panelEl = document.getElementById('panel');
const insetProbe = document.getElementById('inset-probe');
const debug = new URLSearchParams(location.search).has('debug');

const app = {
  campaign: null, sim: null, mode: 'boot', acc: 0, last: 0, endT: 0, resolved: false, runSaveT: 0, ambienceT: 0, stepT: 0,
  resume: null, pendingResults: null, pending: {}, dirty: false, townKey: '', migrated: false, titleT: 0,
  settings: readSettings(),
};

function readSettings() {
  const base = { sens: 1, invert: false, quality: 'auto', mute: false, shake: true, hints: true, pad: null, camera: 'shoulder' };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (raw && typeof raw === 'object') Object.assign(base, raw);
  } catch { /* preferences only */ }
  return base;
}

const assets = createAssets();
let renderer = null;
const audio = createAudio();
const saves = createSaveManager();
const controls = createControls(stage, {
  onPause: () => togglePause(),
  onCamera: () => { if (renderer && playing() && !ui.panel) { setSetting('camera', app.settings.camera === 'high' ? 'shoulder' : 'high'); toast(app.settings.camera === 'high' ? 'High camera: see the whole fight. V switches back.' : 'Shoulder camera. V switches back.'); } },
  onJournal: () => { if (playing() && app.campaign?.character && !ui.panel) { controls.releaseLock?.(); ui.openPanel('journal'); } },
  onMap: () => { if (renderer && playing() && !ui.panel) renderer.mapOpen = !renderer.mapOpen; },
  onLockLost: () => { if (app.mode === 'ride' && !ui.panel && app.sim?.state.phase === 'playing') ui.openPanel('pause'); },
});
const ui = createUI(uiRoot, panelEl, {
  audio,
  campaign: () => app.campaign,
  persist,
  saveStatus: () => saves.status,
  newCampaign,
  continueGame,
  enterTown,
  startRide,
  onPanelClose,
  onCampaignChange: () => { app.dirty = true; },
  settings: () => app.settings,
  pad: () => controls.pad,
  setSetting,
  inRide: () => app.mode === 'ride',
  rideTitle: () => app.sim?.state.config.title ?? 'The ride',
  objectives: () => (app.sim ? objectiveList(app.sim) : []),
  giveUp,
  quitToTitle,
});

const playing = () => (app.mode === 'town' || app.mode === 'ride') && Boolean(app.sim);

function setSetting(key, value) {
  app.settings[key] = value;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings)); } catch { /* preferences only */ }
  applySettings();
}
function applySettings() {
  const s = app.settings;
  controls.prefs.sens = s.sens;
  controls.prefs.invert = s.invert;
  controls.pad.setBinds(s.pad);
  audio.setMuted(s.mute);
  if (renderer) {
    renderer.shakeOn = s.shake;
    renderer.setCamera(s.camera === 'high' ? 'high' : 'shoulder');
    renderer.keyHints = s.hints;
    renderer.autoQuality = s.quality === 'auto';
    if (s.quality !== 'auto' && renderer.quality !== Number(s.quality)) renderer.setQuality(Number(s.quality));
  }
}

function persist() {
  if (app.campaign) saves.save(app.campaign);
}

function readInsets() {
  const cs = getComputedStyle(insetProbe);
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}
function onResize() {
  if (!renderer) return;
  const insets = readInsets();
  renderer.resize();
  renderer.insets = insets;
  controls.layout(renderer.view.w, renderer.view.h, insets);
}
window.addEventListener('resize', onResize);

// ------------------------------------------------------------------ flow

function newCampaign() {
  app.campaign = R.newCampaign();
  app.resume = null;
  app.pendingResults = null;
  saves.clearRun();
  persist();
  leaveStage();
  ui.show('hire');
}

function continueGame() {
  if (app.resume) {
    const sim = app.resume;
    app.resume = null;
    enterRide(sim);
    return;
  }
  if (app.pendingResults) {
    const summary = app.pendingResults;
    app.pendingResults = null;
    leaveStage();
    ui.show('results', { summary });
    return;
  }
  if (R.needsSuccessor(app.campaign)) { leaveStage(); ui.show('hire'); } else enterTown('trail');
}

function leaveStage() {
  controls.setEnabled(false);
  controls.releaseLock();
  app.mode = 'menu';
  app.sim = null;
  stage.hidden = true;
  audio.setAmbience({ on: false });
}

/** What the town depends on. When it changes, the town is rebuilt (a watchtower goes up, a grave is dug). */
const townKeyOf = (c) => `${c.investments.join(',')}|${c.prosperity}|${c.fallen.length}`;

function townUI() {
  const c = app.campaign;
  if (!c?.character) return { cash: 0, who: '', hint: '', giver: null, canRide: false };
  const ch = R.currentChapter(c);
  const who = `${c.character.name} · ${c.character.hp}/${R.maxHp(c.character)} health`;
  let hint, giver = null, flag = null;
  if (c.pendingChoice) { hint = 'The ledger is in your saddlebag. Talk to the marshal on the Town Hall porch.'; giver = 'marshal'; }
  else if (ch) {
    const name = ch.giver === 'rider' ? 'Nell Dunmore, outside the saloon' : 'the marshal, outside the Town Hall';
    hint = `Chapter ${c.chapter + 1} of ${CHAPTERS.length}: ${ch.goal} Talk to ${name}. Press J for the story so far.`;
    giver = ch.giver;
  } else hint = 'The story is finished. There is always work on the job board.';
  return { cash: c.cash, who, hint, giver, flag, canRide: R.availableMissions(c).length > 0 };
}

function enterTown(arrive = 'trail', keep = null) {
  const c = app.campaign;
  let sim;
  try {
    const config = R.townConfig(c, arrive);
    sim = createSim(config, generateLevel(config.level));
  } catch (err) {
    console.error(err);
    ui.show('title', { resume: false });
    ui.flash('Mercy could not be built. Reload the page to try again.');
    return;
  }
  if (keep) { sim.state.player.x = keep.x; sim.state.player.y = keep.y; sim.state.player.aim = keep.aim; }
  app.townKey = townKeyOf(c);
  app.dirty = false;
  beginStage(sim, 'town');
  if (keep) { renderer.yaw = keep.yaw; renderer.pitch = keep.pitch; }
}

function startRide(missionId) {
  const c = app.campaign;
  const seed = (Math.random() * 4294967296) >>> 0;
  const begun = R.beginExpedition(c, missionId, seed);
  if (!begun.ok) { ui.flash(begun.reason); return false; }
  let sim;
  try {
    sim = createSim(begun.config, generateLevel(begun.config.level));
  } catch (err) {
    console.error(err);
    R.abortExpedition(c, begun.config.expeditionId);
    ui.flash('The trail washed out before you left. Try that job again.');
    return false;
  }
  persist();
  audio.unlock();
  audio.play('chapter');
  enterRide(sim);
  return true;
}

function enterRide(sim) {
  beginStage(sim, 'ride');
  saveRun();
}

function beginStage(sim, mode) {
  app.sim = sim;
  app.mode = mode;
  app.acc = 0; app.last = 0; app.endT = 0; app.resolved = false; app.runSaveT = 0; app.pending = {};
  ui.hide();
  if (ui.panel) ui.closePanel();
  panelEl.hidden = true;
  stage.hidden = false;
  controls.setTown(mode === 'town');
  onResize();
  renderer.mapOpen = false;
  renderer.prepare(sim);
  applySettings();
  controls.setEnabled(true);
}

function saveRun() {
  const sim = app.sim;
  if (app.mode === 'ride' && sim && sim.state.phase === 'playing') saves.saveRun(sim.state.config.expeditionId, snapshot(sim));
}

function finishRide() {
  // The Descent: the lift goes down to the next floor, carrying what the drifter holds.
  const down = R.nextFloor(app.campaign, app.sim.state.config, app.sim.state.report);
  if (down) {
    try {
      const sim = createSim(down, generateLevel(down.level));
      renderer.dispose();
      audio.play('chapter');
      enterRide(sim);
      return;
    } catch (err) { console.error(err); /* fall through and settle what was earned */ }
  }
  const summary = R.resolveExpedition(app.campaign, app.sim.state.report);
  saves.clearRun();
  persist();
  leaveStage();
  if (ui.panel) ui.closePanel();
  renderer.dispose();
  if (summary.done && summary.story) audio.play('extracted');
  ui.show('results', { summary });
}

function giveUp() {
  if (app.mode !== 'ride' || !app.sim) return;
  abandon(app.sim);
  controls.setEnabled(true);
}

function quitToTitle() {
  persist();
  showTitle();
}

function showTitle() {
  // the title sits over a slow flight down Main Street
  let sim = null;
  try {
    const c = app.campaign && !R.needsSuccessor(app.campaign) ? app.campaign : null;
    const config = c ? R.townConfig(c) : { mode: 'town', seed: R.TOWN_SEED, level: { gen: 'town', seed: R.TOWN_SEED, prosperity: 2 }, objective: null,
      character: { name: 'Nobody', trait: 'steady', look: 0, hp: 100, maxHp: 100, gear: [], cartridges: 0, shells: 0, bandages: 0, dynamite: 0 }, armory: { guns: [], upgrades: [] }, intel: {} };
    sim = createSim(config, generateLevel(config.level));
  } catch (err) { console.warn('No town for the title screen', err); }
  controls.setEnabled(false);
  controls.releaseLock();
  app.sim = sim;
  app.mode = 'title';
  app.titleT = 0;
  if (sim) { stage.hidden = false; onResize(); renderer.prepare(sim); applySettings(); } else stage.hidden = true;
  ui.show('title', { resume: Boolean(app.resume), migrated: app.migrated });
}

// ------------------------------------------------------------------ panels and pause

function togglePause() {
  if (!playing()) return;
  if (renderer.mapOpen) { renderer.mapOpen = false; return; }
  if (ui.panel) ui.closePanel();
  else if (app.sim.state.phase === 'playing') openPanel('pause');
}

function openPanel(name, data) {
  controls.setEnabled(false);
  controls.releaseLock();
  if (app.mode === 'ride') saveRun();
  ui.openPanel(name, data);
}

function onPanelClose() {
  if (!playing()) return;
  // a purchase may have changed the drifter, the armory, or the town itself
  if (app.mode === 'town' && app.dirty) {
    const c = app.campaign, s = app.sim.state, p = s.player;
    if (townKeyOf(c) !== app.townKey) {
      enterTown('trail', { x: p.x, y: p.y, aim: p.aim, yaw: renderer.yaw, pitch: renderer.pitch });
      return;
    }
    const fresh = R.townConfig(c);
    s.config.character = fresh.character;
    s.config.armory = fresh.armory;
    s.config.giver = fresh.giver;
    for (const g of fresh.armory.guns) if (p.mags[g] === undefined) p.mags[g] = app.sim.cache.guns[g].mag;
    app.dirty = false;
  }
  controls.setEnabled(true);
  app.last = 0;
}

window.addEventListener('keydown', (e) => {
  if (ui.panel && (e.code === 'Escape' || (e.code === 'KeyP' && ui.panel === 'pause')) && !e.repeat) {
    e.preventDefault();
    e.stopImmediatePropagation();
    ui.closePanel();
  }
}, true);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.mode === 'ride') {
    saveRun();
    if (!ui.panel && app.sim?.state.phase === 'playing') openPanel('pause');
  }
});
window.addEventListener('pagehide', saveRun);
window.addEventListener('blur', () => {
  if (app.mode === 'ride' && !ui.panel && app.sim?.state.phase === 'playing') openPanel('pause');
});
hudCanvas.addEventListener('pointerdown', () => { if (renderer?.mapOpen) renderer.mapOpen = false; });
stage.addEventListener('pointerdown', (e) => {
  if (renderer?.mapOpen && (e.pointerType === 'touch' || e.pointerType === 'pen')) renderer.mapOpen = false;
}, true);

// ------------------------------------------------------------------ the loop

function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* not available in this frame */ }
}

function townInteract(e) {
  if (e.kind === 'shop') openPanel(e.shop === 'stable' ? 'jobs' : e.shop);
  else if (e.kind === 'board' || e.kind === 'ride') openPanel('jobs');
  else if (e.kind === 'talk') openPanel('talk', { role: e.role, name: e.name });
  else if (e.kind === 'grave') toast(renderer, e.text || 'A wooden marker.', 'info', true);
}

const SHOT_SOUND = { revolver: 'precise', fan: 'fan', rifle: 'rifleShot', shotgun: 'shotgunShot', smg: 'smgShot', longrifle: 'longShot', pulse: 'pulseShot', arc: 'arcShot', overcharge: 'overcharge' };

function dispatch(events) {
  const sim = app.sim;
  renderer.consume(events, sim);
  const p = sim.state.player;
  for (const e of events) {
    const vol = Number.isFinite(e.x) ? Math.max(0.12, 1 - Math.hypot(e.x - p.x, e.y - p.y) / 1100) : 1;
    switch (e.type) {
      case 'town_interact': townInteract(e); break;
      case 'shot': audio.play(e.heavy ? 'overcharge' : SHOT_SOUND[e.kind] || 'precise'); break;
      case 'arc': audio.play('zap', 0.7); break;
      case 'enemy_shot': audio.play(e.weapon, vol); break;
      case 'echo_shot': audio.play('echoShot'); break;
      case 'buddy_shot': audio.play('e_pistol', 0.5); break;
      case 'enemy_hit': audio.play('hit', 0.8); break;
      case 'target_hit': audio.play('target'); break;
      case 'enemy_killed': audio.play('kill'); if (e.boss) audio.play('extracted'); break;
      case 'player_hit': audio.play('hurt'); vibrate(30); break;
      case 'dodge': audio.play('dodge'); break;
      case 'dodged': audio.play('graze'); break;
      case 'reload_round': audio.play('reload'); break;
      case 'dry_fire': audio.play('dry'); break;
      case 'swap': audio.play('swap'); break;
      case 'throw': audio.play('throw', e.enemy ? vol : 1); break;
      case 'bomb_land': audio.play('fuse', vol); break;
      case 'explosion': audio.play('explosion', Math.max(0.3, vol)); vibrate(60); break;
      case 'charge': audio.play('charge', vol); break;
      case 'wake': audio.play('wake', vol); break;
      case 'boss_phase': audio.play('boss'); break;
      case 'loot': case 'pickup': audio.play(e.what === 'cash' || e.type === 'loot' ? 'cash' : 'loot'); break;
      case 'alert': audio.play('alert', vol); break;
      case 'flare': audio.play('flare'); break;
      case 'extract_start': audio.play('bell'); break;
      case 'echo_start': audio.play('echo'); break;
      case 'nightfall': audio.play('night'); break;
      case 'walkers': audio.play('howl'); break;
      case 'healed': audio.play('heal'); break;
      case 'player_died': audio.play('death'); vibrate(120); break;
      case 'ended': if (e.outcome === 'extracted') audio.play('extracted'); break;
      default: break;
    }
  }
}

function stepSim(sim, input) {
  update(sim, STEP, input);
  if (sim.events.length) {
    const events = sim.events.slice();
    sim.events.length = 0;
    dispatch(events);
  }
}

const EDGES = ['fire', 'alt', 'dodge', 'reload', 'heal', 'throw', 'interactPressed', 'pulse', 'jump'];

/** Look, aim through the crosshair, then step the sim with camera-relative movement. */
function advance(sim, dt) {
  const inp = controls.sample();
  const active = !ui.panel && !renderer.mapOpen;
  if (active) renderer.look(inp.lookX + inp.turn * TURN_SPEED * dt, inp.lookY - inp.pitch * PITCH_SPEED * dt);
  renderer.updateCamera(sim, dt);
  // Presses survive frames in which no fixed step runs (high refresh rates).
  for (const k of EDGES) if (inp[k]) app.pending[k] = true;
  if (inp.slot) app.pending.slot = inp.slot;
  if (inp.swap) app.pending.swap = inp.swap;
  if (active) {
    let aim = renderer.aimPoint(sim, null);
    // thumbs are less precise than a mouse: touch and controller shots bend to an enemy near the crosshair
    if ((app.pending.fire || inp.fireHeld) && (controls.mode === 'touch' || controls.mode === 'gamepad')) aim = renderer.assistTarget(sim) ?? aim;
    const move = renderer.moveToWorld(inp.fwd, inp.right);
    const base = { mx: move.mx, my: move.my, ax: aim.x, ay: aim.y, interactHeld: inp.interactHeld, fireHeld: inp.fireHeld, sprint: inp.sprint };
    app.acc += dt;
    let steps = 0;
    while (app.acc >= STEP && steps < 5 && !ui.panel) {
      app.prev = { x: sim.state.player.x, y: sim.state.player.y };
      stepSim(sim, steps === 0 ? { ...base, ...app.pending } : base);
      if (steps === 0) app.pending = {};
      app.acc -= STEP;
      steps += 1;
    }
    if (steps >= 5) app.acc = 0;
    // Draw the drifter between the last two steps, so motion is even at any refresh rate.
    {
      const q = sim.state.player, pv = app.prev, a = Math.min(1, app.acc / STEP);
      const jump = !pv || Math.hypot(q.x - pv.x, q.y - pv.y) > 60;
      renderer.playerPos = jump ? null : { x: pv.x + (q.x - pv.x) * a, y: pv.y + (q.y - pv.y) * a };
      renderer.updateCamera(sim, 0);
    }
    // footsteps
    const p = sim.state.player;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 40 && p.dodgeT <= 0) {
      app.stepT -= dt * (sp / 150);
      if (app.stepT <= 0) { app.stepT = 0.36; audio.play('step', p.sprinting ? 0.9 : 0.5); }
    }
  } else { app.pending = {}; renderer.playerPos = null; }
  return inp;
}

function frame(ts) {
  requestAnimationFrame(frame);
  try { frameBody(ts); app.frameErrors = 0; }
  catch (err) {
    // One bad frame must not freeze the game. Show what went wrong so it can be reported.
    console.error(err);
    app.frameErrors = (app.frameErrors || 0) + 1;
    if (app.frameErrors === 1 || app.frameErrors === 120) showProblem(err);
  }
}
function showProblem(err) {
  let el = document.getElementById('lf-problem');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lf-problem';
    el.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:50;max-width:70%;padding:6px 10px;background:rgba(40,10,10,.9);color:#ffd9c9;font:12px/1.35 ui-monospace,monospace;border:1px solid #b5483a;pointer-events:none';
    (document.getElementById('stage') || document.body).appendChild(el);
  }
  el.textContent = 'Something went wrong (' + String(err && err.message || err).slice(0, 160) + ') at ' + String(err && err.stack || '').split('\n')[1]?.trim().slice(0, 120);
  clearTimeout(showProblem.t);
  showProblem.t = setTimeout(() => el.remove(), 15000);
}
/** Controller button names for the on-screen prompts. */
function padNames() {
  const n = controls.pad.name;
  return { pulse: n('pulse'), jump: n('jump'), camera: n('camera'), use: n('interact'), reload: n('reload'), heal: n('heal'), map: n('map'), fire: n('fire'), alt: n('alt'), dodge: n('dodge'), throw: n('throw'), next: n('next'), journal: n('journal'), menu: n('pause'), sprint: n('sprint') };
}

/** The controller's menu cursor: the left stick moves it, A clicks what is under it. */
const cursor = { x: 0, y: 0, on: false, el: null, idle: 0 };
function showCursor(on) {
  if (on && !cursor.el) {
    const el = document.createElement('div');
    el.id = 'lf-cursor';
    el.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border:3px solid #e8a33d;border-radius:50%;background:rgba(232,163,61,.25);box-shadow:0 0 0 2px rgba(0,0,0,.6);z-index:60;pointer-events:none;will-change:transform';
    document.body.appendChild(el);
    cursor.el = el;
    cursor.x = innerWidth / 2; cursor.y = innerHeight / 2;
  }
  cursor.on = on;
  if (cursor.el) cursor.el.style.display = on ? 'block' : 'none';
}
window.addEventListener('mousemove', () => { if (cursor.on) showCursor(false); });

/** Drive menus and panels with a controller: the stick moves a cursor, the D-pad steps, A presses, B goes back. */
function padMenus(dt) {
  const nav = controls.padMenu();
  const inPanel = Boolean(ui.panel);
  if (!inPanel && playing()) { if (cursor.on) showCursor(false); return; }
  const rootEl = inPanel ? panelEl : uiRoot;
  if (!rootEl || rootEl.hidden) { if (cursor.on) showCursor(false); return; }
  const st = controls.padSticks();
  const scroller = inPanel ? panelEl.querySelector('.sheet') || panelEl : uiRoot;
  if (st) {
    if (st.lx || st.ly) {
      if (!cursor.on) showCursor(true);
      const speed = 950 * dt;
      cursor.x = Math.max(4, Math.min(innerWidth - 4, cursor.x + st.lx * speed));
      cursor.y = Math.max(4, Math.min(innerHeight - 4, cursor.y + st.ly * speed));
      // pushing against the top or bottom edge scrolls the page under the cursor
      if (cursor.y <= 30 && st.ly < 0) scroller.scrollBy(0, st.ly * 900 * dt);
      if (cursor.y >= innerHeight - 30 && st.ly > 0) scroller.scrollBy(0, st.ly * 900 * dt);
    }
    if (st.ry) scroller.scrollBy(0, st.ry * 1100 * dt);
  }
  if (cursor.on) {
    cursor.el.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
    const under = document.elementFromPoint(cursor.x, cursor.y)?.closest('button, input, select, a');
    if (under && rootEl.contains(under) && document.activeElement !== under) under.focus({ preventScroll: true });
  }
  if (nav.back || nav.menu) {
    if (inPanel) { if (playing()) togglePause(); else ui.closePanel(); }
    else rootEl.querySelector('[data-act="back"], [data-act="new-no"]')?.click();
    return;
  }
  const dir = nav.down || nav.right ? 1 : nav.up || nav.left ? -1 : 0;
  if (!dir && !nav.accept) return;
  const items = [...rootEl.querySelectorAll('button:not([disabled]), input, select')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  const cur = items[i];
  // left and right change a slider or a choice instead of moving on
  if (cur && (nav.left || nav.right) && (cur.type === 'range' || cur.tagName === 'SELECT')) {
    if (cur.type === 'range') cur.value = String(Number(cur.value) + (nav.right ? 1 : -1) * Number(cur.step || 1));
    else cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + (nav.right ? 1 : -1)));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (nav.accept) {
    const under = cursor.on ? document.elementFromPoint(cursor.x, cursor.y)?.closest('button, input, select, a') : null;
    const target = under && rootEl.contains(under) ? under : cur;
    if (target && !target.disabled) target.click();
    return;
  }
  if (cursor.on) showCursor(false); // the D-pad takes over from the cursor
  i = i < 0 ? (dir >= 0 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
  items[i].focus({ preventScroll: false });
  items[i].scrollIntoView?.({ block: 'nearest' });
}

function frameBody(ts) {
  const dt = app.last ? Math.min(0.1, (ts - app.last) / 1000) : 0;
  app.last = ts;
  // The controller can press a menu button that starts or ends a scene, so read it before looking at the scene.
  controls.padFrame(dt);
  padMenus(dt);
  const sim = app.sim;
  if (playing()) {
    const halted = Boolean(ui.panel) || renderer.mapOpen;
    const inp = advance(sim, dt);
    if (!halted && app.mode === 'ride') {
      app.runSaveT += dt;
      if (app.runSaveT > RUN_SAVE_EVERY) { app.runSaveT = 0; saveRun(); }
      if (sim.state.phase === 'ended') {
        app.endT += dt;
        if (!app.resolved && app.endT > 1.3) { app.resolved = true; finishRide(); }
      }
    }
    app.ambienceT -= dt;
    if (app.ambienceT <= 0 && playing()) {
      app.ambienceT = 0.5;
      audio.setAmbience({ on: true, night: app.mode === 'town' ? 0 : sim.level.dark ? 0.8 : nightFactor(sim.state), hollow: haunted(sim) });
    }
    if (playing() && app.sim === sim) {
      const fp = focusPrompt(sim);
      renderer.draw(sim, halted ? 0 : dt, {
        touch: controls.mode === 'touch',
        pad: controls.mode === 'gamepad' ? padNames() : null,
        touchUI: controls.touchUI(Boolean(fp && fp.kind !== 'extracting')),
        freeCursor: null,
        lockHint: controls.lockHint() && !halted,
        cameraUpdated: true,
        town: app.mode === 'town' ? townUI() : null,
      });
    }
  } else if (app.mode === 'title' && sim && renderer) {
    app.titleT += dt;
    renderer.cinematic(sim, app.titleT);
    renderer.draw(sim, dt, { cameraUpdated: true, noHud: true });
  }
}

// ------------------------------------------------------------------ boot

function restoreRun(json) {
  const state = typeof json === 'string' ? JSON.parse(json) : json;
  return restoreSim(state, generateLevel(state.config.level));
}

async function boot(hotData = {}) {
  ui.show('loading', { progress: 0 });
  if (!webglAvailable() || !window.THREE) {
    ui.setLoading(0, 'This game needs WebGL, and this browser or device does not offer it here. Try another browser, or turn hardware acceleration on.');
    return;
  }
  let loaded = null;
  try {
    const [, save] = await Promise.all([
      assets.load('assets/', (p) => ui.setLoading(p * 0.9)),
      saves.load().catch((err) => { console.error('Could not load the save', err); return null; }),
      document.fonts?.ready ? Promise.race([document.fonts.ready, sleep(1500)]) : null,
    ]);
    loaded = save;
    renderer = createRenderer(canvas3d, hudCanvas, assets);
  } catch (err) {
    console.error(err);
    ui.setLoading(0, 'The game could not load its models. Check your connection and reload the page.');
    return;
  }
  canvas3d.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ui.show('loading', { progress: 0, error: 'The graphics context was lost. Reload the page to carry on; your campaign is saved.' }); app.mode = 'menu'; stage.hidden = true; });
  ui.setLoading(1);
  onResize();
  applySettings();
  requestAnimationFrame(frame);

  app.campaign = loaded?.campaign ?? null;
  app.migrated = Boolean(loaded?.migrated);
  const active = app.campaign?.activeExpedition;
  if (active) {
    const json = hotData?.run ?? saves.loadRun(active.id);
    if (json) {
      try {
        const sim = restoreRun(json);
        if (sim.state.config.expeditionId === active.id && sim.state.phase === 'playing') app.resume = sim;
      } catch (err) {
        console.warn('Could not restore the ride', err);
      }
    }
    if (!app.resume) {
      app.pendingResults = R.resolveMissing(app.campaign);
      saves.clearRun();
      persist();
    }
  }
  if (app.migrated) persist();
  if (app.resume && hotData?.run) {
    const sim = app.resume;
    app.resume = null;
    enterRide(sim);
    return;
  }
  if (hotData?.town && app.campaign && !app.resume && !app.pendingResults && !R.needsSuccessor(app.campaign)) {
    enterTown('trail');
    return;
  }
  showTitle();
}

try {
  window.claude?.hot?.snapshot?.(() => ({
    run: app.mode === 'ride' && app.sim?.state.phase === 'playing' ? snapshot(app.sim) : null,
    town: app.mode === 'town',
  }));
} catch {
  // live updates are optional
}

if (debug) {
  window.LF_DEBUG = {
    app, rules: R, ui,
    renderer: () => renderer,
    state: () => app.sim?.state,
    sim: () => app.sim,
    peace() {
      if (!app.sim) return;
      app.sim.state.enemies = app.sim.state.enemies.filter((e) => e.kind === 'target');
      app.sim.state.warned.night = true;
      app.sim.state.nextWaveT = Infinity;
    },
    teleportTo(kind, pick) {
      const s = app.sim.state;
      const it = s.interactables.find((i) => i.kind === kind && (!pick || i.variant === pick || i.item === pick || i.shop === pick || i.role === pick));
      if (it) { s.player.x = it.x + 14; s.player.y = it.y + 4; }
      return Boolean(it);
    },
    quality: (q) => { app.settings.quality = q; applySettings(); },
    face(angle, pitch = 0.14) { if (renderer) { renderer.yaw = angle; renderer.pitch = pitch; } },
    hurt: (hp) => { app.sim.state.player.hp = hp; },
    setTime: (t) => { app.sim.state.t = t; },
    cash: (n) => { app.campaign.cash = n; persist(); },
    chapter: (n) => { app.campaign.chapter = n; persist(); },
    town: () => enterTown('trail'),
    ride: (id) => startRide(id),
    open: (name, data) => openPanel(name, data),
  };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
