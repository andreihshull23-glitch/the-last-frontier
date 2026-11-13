// Keyboard, mouse, touch and controller input for the third-person view.
//
// WASD moves relative to the camera and the mouse looks (pointer lock, or
// edge-turning with a free cursor where lock is refused). Touch: move stick on
// the left, drag to look on the right, buttons for everything else.

const MOVE_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const STICK_RADIUS = 56;
const MOUSE_SENS = 0.0024;
const TOUCH_SENS = 0.0065;
const EDGES = ['fire', 'alt', 'dodge', 'reload', 'heal', 'interact', 'throw', 'pulse', 'jump'];
const STICK_TURN = 1.35;   // right stick, as a multiple of the arrow-key turn rate
const STICK_PITCH = 1.7;

import { createGamepad } from './gamepad.js';

export function createControls(stage, hooks) {
  const pad = createGamepad();
  let padState = null;       // this frame's controller reading
  let padSprint = false;
  let padArmed = true;       // false until every button is released after a menu closes
  const keys = new Set();
  const arrows = new Set();
  const edge = Object.fromEntries(EDGES.map((k) => [k, false]));
  const mouse = { x: 0, y: 0, seen: false, down: false };
  const touch = { move: null, look: null, act: null, fire: null };
  const look = { x: 0, y: 0 };
  const prefs = { sens: 1, invert: false };
  let interactKey = false, sprintKey = false;
  let slot = 0, swap = 0;
  let mode = 'keyboard';
  let enabled = false;
  let town = false;
  let buttons = [];
  let size = { w: 1, h: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
  let locked = false;
  let lockAsked = false;
  let lockFailedAt = 0;
  let lockFailed = !stage.requestPointerLock;
  let lockTimer = 0;

  function layout(w, h, insets) {
    size = { w, h, insets };
    const R = w - insets.right, B = h - insets.bottom;
    const big = Math.min(44, Math.max(36, w * 0.05));
    const mapW = w < 640 ? 112 : 176;
    // Pause and map sit between the objectives panel and the minimap (see hud.js).
    const top = [
      { id: 'pause', label: 'II', x: R - 12 - mapW - 30, y: insets.top + 34, r: 18 },
      { id: 'map', label: 'MAP', x: R - 12 - mapW - 30, y: insets.top + 78, r: 18 },
    ];
    const ride = [
      { id: 'fire', label: 'FIRE', x: R - big - 18, y: B - big - 24, r: big },
      { id: 'dodge', label: 'DODGE', x: R - big * 2 - 70, y: B - 44, r: 30 },
      { id: 'alt', label: 'ALT', x: R - 46, y: B - big * 2 - 70, r: 27 },
      { id: 'act', label: 'ACT', x: R - big * 2 - 64, y: B - big * 2 - 56, r: 27 },
      { id: 'heal', label: 'HEAL', x: R - big * 2 - 130, y: B - 108, r: 22 },
      { id: 'reload', label: 'LOAD', x: R - 112, y: B - big * 2 - 132, r: 21 },
      { id: 'swap', label: 'GUN', x: R - 46, y: B - big * 2 - 134, r: 21 },
      { id: 'throw', label: 'DYN', x: R - big * 2 - 134, y: B - 48, r: 21 },
      { id: 'pulse', label: 'PULSE', x: R - big * 2 - 190, y: B - 100, r: 22 },
      { id: 'jump', label: 'JUMP', x: R - big * 2 - 126, y: B - 160, r: 21 },
    ];
    const walk = [{ id: 'act', label: 'ACT', x: R - big - 18, y: B - big - 24, r: big }];
    buttons = [...(town ? walk : ride), ...top].map((b) => ({ ...b, active: false, pointer: null }));
  }

  function clearAll() {
    keys.clear();
    arrows.clear();
    interactKey = false;
    sprintKey = false;
    mouse.down = false;
    touch.move = null; touch.look = null; touch.act = null; touch.fire = null;
    look.x = look.y = 0;
    slot = 0; swap = 0;
    for (const k of EDGES) edge[k] = false;
    for (const b of buttons) { b.active = false; b.pointer = null; }
  }

  // ---------------------------------------------------------------- pointer lock
  function requestLock() {
    if (lockFailed) return;
    const fail = () => { lockFailed = true; lockFailedAt = performance.now(); hooks.onLockFailed?.(); };
    try {
      // Raw movement (no OS pointer acceleration) where the browser offers it.
      let p;
      try { p = stage.requestPointerLock({ unadjustedMovement: true }); } catch { p = stage.requestPointerLock(); }
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          if (err && err.name === 'NotSupportedError') { const q = stage.requestPointerLock(); if (q && typeof q.catch === 'function') q.catch(fail); }
          else fail();
        });
      }
    } catch { fail(); return; }
    // Some embedded views ignore the request silently: fall back to a free cursor.
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => { if (!locked) fail(); }, 700);
  }
  document.addEventListener('pointerlockchange', () => {
    const was = locked;
    locked = document.pointerLockElement === stage;
    if (locked) clearTimeout(lockTimer);
    if (was && !locked) { mouse.down = false; lockAsked = false; hooks.onLockLost?.(); }
  });
  document.addEventListener('pointerlockerror', () => { lockFailed = true; lockFailedAt = performance.now(); hooks.onLockFailed?.(); });

  // ---------------------------------------------------------------- keyboard
  function onKeyDown(e) {
    if (!enabled) return;
    const move = MOVE_KEYS[e.code] || ARROWS[e.code];
    if (e.repeat && !move) {
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      return;
    }
    mode = 'keyboard';
    switch (e.code) {
      case 'Space': edge.dodge = true; break;
      case 'ShiftLeft': case 'ShiftRight': sprintKey = true; break;
      case 'KeyR': edge.reload = true; break;
      case 'KeyQ': case 'KeyH': edge.heal = true; break;
      case 'KeyE': edge.interact = true; interactKey = true; break;
      case 'KeyF': edge.alt = true; break;
      case 'KeyG': edge.throw = true; break;
      case 'KeyB': edge.pulse = true; break;
      case 'KeyC': edge.jump = true; break;
      case 'KeyV': hooks.onCamera?.(); break;
      case 'Digit1': slot = 1; break;
      case 'Digit2': slot = 2; break;
      case 'Digit3': slot = 3; break;
      case 'Digit4': slot = 4; break;
      case 'Digit5': slot = 5; break;
      case 'Digit6': slot = 6; break;
      case 'Digit7': slot = 7; break;
      case 'Digit8': slot = 8; break;
      case 'Digit9': slot = 9; break;
      case 'Digit0': slot = 10; break;
      case 'KeyJ': hooks.onJournal?.(); break;
      case 'KeyX': swap = 1; break;
      case 'KeyM': case 'Tab': hooks.onMap?.(); break;
      case 'Escape': case 'KeyP': hooks.onPause?.(); break;
      default:
        if (MOVE_KEYS[e.code]) keys.add(e.code);
        else if (ARROWS[e.code]) arrows.add(e.code);
        else return;
    }
    e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    arrows.delete(e.code);
    if (e.code === 'KeyE') interactKey = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprintKey = false;
  }

  // ---------------------------------------------------------------- pointer
  function local(e) {
    const rect = stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onPointerDown(e) {
    if (!enabled) return;
    const { x, y } = local(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      mode = 'touch';
      try { stage.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
      const b = buttons.find((btn) => Math.hypot(btn.x - x, btn.y - y) < btn.r + 10);
      if (b) {
        b.active = true;
        b.pointer = e.pointerId;
        if (b.id === 'act') { edge.interact = true; touch.act = e.pointerId; }
        else if (b.id === 'pause') hooks.onPause?.();
        else if (b.id === 'map') hooks.onMap?.();
        else if (b.id === 'swap') swap = 1;
        else if (b.id === 'fire') { edge.fire = true; touch.fire = e.pointerId; }
        else if (b.id === 'pulse') edge.pulse = true;
        else if (b.id === 'jump') edge.jump = true;
        else edge[b.id] = true;
      } else if (x < size.w * 0.4 && !touch.move) touch.move = { id: e.pointerId, ox: x, oy: y, x, y };
      else if (!touch.look) touch.look = { id: e.pointerId, x, y };
      e.preventDefault();
      return;
    }
    mode = 'keyboard';
    mouse.x = x; mouse.y = y; mouse.seen = true; mouse.inside = true;
    // Keys only reach the game while its frame has focus; a click always takes it back.
    try { window.focus(); } catch { /* not allowed here */ }
    // A capture that failed once (for example right after Esc) is worth another try on a later click.
    if (!locked && lockFailed && performance.now() - lockFailedAt > 1500) { lockFailed = false; lockAsked = false; }
    if (!locked && !lockFailed && !lockAsked) {
      // The first click only takes hold of the mouse. Clicks while that is pending count as shots.
      lockAsked = true;
      requestLock();
      // Only the very first click is spent on taking the mouse; a retry after a failure still shoots.
      if (!lockFailedAt) { e.preventDefault(); return; }
    }
    if (e.button === 0) { edge.fire = true; mouse.down = true; }
    if (e.button === 2) edge.alt = true;
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (e.pointerType === 'mouse') {
      // Every sample between frames counts; a single wild jump (some browsers send one as the pointer is captured) does not.
      // A fast flick is real input and is kept; only an absurd jump (some browsers send one as the pointer is captured) is cut down.
      let mx = Number(e.movementX) || 0, my = Number(e.movementY) || 0;
      if (Math.abs(mx) > 1200 || Math.abs(my) > 1200) { mx = 0; my = 0; }
      if (!locked) { const { x, y } = local(e); mouse.x = x; mouse.y = y; mouse.seen = true; mouse.inside = true; }
      // Without pointer capture the camera still follows the mouse; the screen edges keep it turning.
      const k = locked ? 1 : 1.5;
      look.x += mx * MOUSE_SENS * prefs.sens * k;
      look.y += my * MOUSE_SENS * prefs.sens * k * (prefs.invert ? -1 : 1);
      return;
    }
    const { x, y } = local(e);
    if (touch.move?.id === e.pointerId) { touch.move.x = x; touch.move.y = y; }
    else if (touch.look?.id === e.pointerId) {
      look.x += (x - touch.look.x) * TOUCH_SENS * prefs.sens;
      look.y += (y - touch.look.y) * TOUCH_SENS * prefs.sens * (prefs.invert ? -1 : 1);
      touch.look.x = x; touch.look.y = y;
    }
  }
  function onPointerUp(e) {
    if (e.pointerType === 'mouse') { if (e.button === 0) mouse.down = false; return; }
    if (touch.move?.id === e.pointerId) touch.move = null;
    if (touch.look?.id === e.pointerId) touch.look = null;
    for (const b of buttons) {
      if (b.pointer !== e.pointerId) continue;
      b.active = false;
      b.pointer = null;
      if (b.id === 'act') touch.act = null;
      if (b.id === 'fire') touch.fire = null;
    }
  }
  function onWheel(e) {
    if (!enabled) return;
    swap = e.deltaY > 0 ? 1 : -1;
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAll);
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerleave', () => { mouse.inside = false; });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('wheel', onWheel, { passive: false });

  function stick() {
    if (!touch.move) return null;
    const dx = touch.move.x - touch.move.ox, dy = touch.move.y - touch.move.oy;
    const l = Math.hypot(dx, dy);
    if (l <= 6) return { x: 0, y: 0, full: false };
    const m = Math.min(1, l / STICK_RADIUS);
    return { x: (dx / l) * m, y: (dy / l) * m, full: l > STICK_RADIUS * 1.35 };
  }

  /** Read the controller. main calls this once at the start of every frame, in play and in menus. */
  function padFrame(dt) {
    padState = pad.poll(dt);
    if (padState && padState.active) mode = 'gamepad';
    return padState;
  }
  /** Menu navigation presses for this frame (each is reported once). */
  function padMenu() {
    const nav = padState ? padState.nav : {};
    if (padState) padState.nav = {};
    return nav;
  }

  function sample() {
    let fwd = 0, right = 0;
    for (const k of keys) { right += MOVE_KEYS[k][0]; fwd -= MOVE_KEYS[k][1]; }
    const st = stick();
    let sprint = sprintKey;
    if (st && (st.x || st.y)) { right = st.x; fwd = -st.y; sprint = sprint || st.full; }
    let turn = 0, pitch = 0;
    for (const k of arrows) { turn += ARROWS[k][0]; pitch -= ARROWS[k][1]; }
    const free = mode === 'keyboard' && !locked && mouse.seen;
    // Edge turning only while the cursor is really over the game; a cursor that has left must not spin the camera.
    if (free && mouse.inside) {
      // Edge turning for a free cursor: the outer fifth of the screen turns the camera.
      const nx = (mouse.x - size.w / 2) / (size.w / 2);
      turn += Math.sign(nx) * Math.max(0, Math.min(1, (Math.abs(nx) - 0.82) / 0.16)) * 1.3;
      const ny = (mouse.y - size.h / 2) / (size.h / 2);
      pitch -= Math.sign(ny) * Math.max(0, Math.min(1, (Math.abs(ny) - 0.86) / 0.12)) * 0.6;
    }
    // controller: left stick moves, right stick looks, bound buttons do the rest
    // The button that closed a menu must not also act in the game: wait for the controller to be let go.
    if (padState && !padArmed && !padState.anyDown) padArmed = true;
    const g = enabled && padArmed && padState && !padState.capturing ? padState : null;
    let padFire = false, padUse = false;
    if (g) {
      if (g.move > 0) { right = g.lx; fwd = -g.ly; }
      else padSprint = false;
      turn += g.rx * STICK_TURN * prefs.sens;
      pitch += -g.ry * STICK_PITCH * prefs.sens * (prefs.invert ? -1 : 1);
      const P = g.pressed;
      if (P.has('sprint')) padSprint = !padSprint;
      if (g.move > 0.2 && padSprint) sprint = true;
      for (const k of ['fire', 'alt', 'dodge', 'reload', 'heal', 'interact', 'throw', 'pulse', 'jump']) if (P.has(k)) edge[k] = true;
      if (P.has('camera')) hooks.onCamera?.();
      if (P.has('next')) swap = 1;
      if (P.has('prev')) swap = -1;
      if (P.has('map')) hooks.onMap?.();
      if (P.has('journal')) hooks.onJournal?.();
      if (P.has('pause')) hooks.onPause?.();
      padFire = g.held.has('fire');
      padUse = g.held.has('interact');
      g.pressed = new Set();
    }
    const out = {
      fwd: Math.max(-1, Math.min(1, fwd)), right: Math.max(-1, Math.min(1, right)),
      lookX: look.x, lookY: look.y, turn, pitch,
      freeCursor: free ? { x: mouse.x, y: mouse.y } : null,
      fire: edge.fire, alt: edge.alt, dodge: edge.dodge, reload: edge.reload, heal: edge.heal, throw: edge.throw, pulse: edge.pulse, jump: edge.jump,
      interactPressed: edge.interact, interactHeld: interactKey || touch.act !== null || padUse,
      fireHeld: mouse.down || touch.fire !== null || padFire, sprint, slot, swap,
    };
    for (const k of EDGES) edge[k] = false;
    look.x = look.y = 0;
    slot = 0; swap = 0;
    return out;
  }

  return {
    layout,
    sample,
    padFrame,
    padMenu,
    pad,
    prefs,
    get mode() { return mode; },
    setTown(on) { town = Boolean(on); layout(size.w, size.h, size.insets); },
    setEnabled(on) { if (on && !enabled) padArmed = false; enabled = on; if (!on) clearAll(); },
    /** Stick positions this frame, for the menu cursor. */
    padSticks() { return padState && !padState.capturing ? { lx: padState.lx, ly: padState.ly, rx: padState.rx, ry: padState.ry } : null; },
    /** True when a click would take hold of the mouse for looking around. */
    lockHint() { return mode === 'keyboard' && !locked && !lockFailed; },
    releaseLock() {
      clearTimeout(lockTimer);
      if (document.pointerLockElement === stage) document.exitPointerLock?.();
    },
    touchUI(highlightAct) {
      if (mode !== 'touch') return null;
      const sticks = [];
      if (touch.move) {
        const dx = touch.move.x - touch.move.ox, dy = touch.move.y - touch.move.oy;
        const l = Math.hypot(dx, dy), m = Math.min(l, STICK_RADIUS);
        sticks.push({ ox: touch.move.ox, oy: touch.move.oy, x: touch.move.ox + (l ? (dx / l) * m : 0), y: touch.move.oy + (l ? (dy / l) * m : 0), radius: STICK_RADIUS });
      }
      const hint = town ? 'Left thumb: walk · Right thumb: look · ACT talks and trades' : 'Left thumb: move (push far to sprint) · Right thumb: look · FIRE shoots at the crosshair';
      return {
        sticks,
        buttons: buttons.map((b) => ({ ...b, highlight: b.id === 'act' && highlightAct })),
        hint: sticks.length || touch.look ? null : { text: hint, x: size.w / 2, y: size.h - size.insets.bottom - 12 },
      };
    },
  };
}
