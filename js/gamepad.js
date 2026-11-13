// Controller input through the browser Gamepad API (standard mapping).
// One poll per frame gives stick positions, which actions are held, and which
// were pressed this frame. Buttons are rebindable; the bindings are plain data.

/** Actions a controller button can be bound to, in the order Settings lists them. */
export const PAD_ACTIONS = [
  ['fire', 'Fire'],
  ['alt', 'Alternate fire'],
  ['dodge', 'Dodge roll'],
  ['sprint', 'Sprint (toggle)'],
  ['reload', 'Reload'],
  ['interact', 'Use / talk'],
  ['heal', 'Bandage'],
  ['throw', 'Dynamite'],
  ['next', 'Next gun'],
  ['prev', 'Previous gun'],
  ['map', 'Map'],
  ['journal', 'Journal'],
  ['pause', 'Menu'],
];

/** Default layout, as button indices of the standard mapping. */
export const PAD_DEFAULTS = {
  fire: 7, alt: 6, dodge: 0, sprint: 10, reload: 2, interact: 3, heal: 1,
  throw: 5, next: 4, prev: 14, map: 8, journal: 12, pause: 9,
};

const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
export const padButtonName = (i) => (i === undefined || i === null || i < 0 ? 'unbound' : NAMES[i] ?? `Button ${i}`);

const DEADZONE = 0.18;
/** Remove the dead zone and ease the response so small pushes are precise. */
function shape(x, y) {
  const l = Math.hypot(x, y);
  if (l < DEADZONE) return [0, 0, 0];
  const m = Math.min(1, (l - DEADZONE) / (1 - DEADZONE));
  const k = (m * m * 0.6 + m * 0.4) / l;
  return [x * k, y * k, m];
}

export function createGamepad() {
  let binds = { ...PAD_DEFAULTS };
  let prev = [];
  let capture = null;       // { action, done } while Settings waits for a button
  let navHeld = 0, navDir = null;
  let available = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  let seenId = '';

  function read() {
    if (!available) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch { available = false; return null; } // blocked by the host page
    if (!pads) return null;
    for (const p of pads) if (p && p.connected && p.buttons.length >= 4) return p;
    return null;
  }

  /**
   * Read the controller. Call exactly once per frame; `dt` is used for menu auto-repeat.
   * Returns null when no controller is connected.
   */
  function poll(dt = 0) {
    const p = read();
    if (!p) { prev = []; return null; }
    seenId = p.id || 'Controller';
    const down = p.buttons.map((b) => b.pressed || b.value > 0.45);
    // Call once per frame: a press is reported on the frame the button goes down.
    const edge = down.map((d, i) => d && !prev[i]);
    prev = down;

    if (capture) {
      const i = edge.findIndex(Boolean);
      if (i >= 0) {
        const c = capture;
        capture = null;
        // one button, one action: whatever had this button loses it
        for (const k of Object.keys(binds)) if (binds[k] === i && k !== c.action) binds[k] = -1;
        binds[c.action] = i;
        c.done({ ...binds });
      }
      return { active: false, capturing: true, held: new Set(), pressed: new Set(), lx: 0, ly: 0, rx: 0, ry: 0, move: 0, nav: {} };
    }

    const held = new Set(), pressed = new Set();
    for (const [action, i] of Object.entries(binds)) {
      if (i < 0) continue;
      if (down[i]) held.add(action);
      if (edge[i]) pressed.add(action);
    }
    const [lx, ly, move] = shape(p.axes[0] || 0, p.axes[1] || 0);
    const [rx, ry] = shape(p.axes[2] || 0, p.axes[3] || 0);

    // menu navigation: D-pad or left stick, with auto-repeat; A accepts, B goes back
    const ax = down[15] || lx > 0.6 ? 1 : down[14] || lx < -0.6 ? -1 : 0;
    const ay = down[13] || ly > 0.6 ? 1 : down[12] || ly < -0.6 ? -1 : 0;
    const dir = ay ? (ay > 0 ? 'down' : 'up') : ax ? (ax > 0 ? 'right' : 'left') : null;
    const nav = { accept: edge[0], back: edge[1], menu: edge[9] };
    if (dir !== navDir) { navDir = dir; navHeld = 0; if (dir) nav[dir] = true; }
    else if (dir) { navHeld += dt; if (navHeld > 0.38) { navHeld -= 0.12; nav[dir] = true; } }

    const active = down.some(Boolean) || move > 0 || Math.hypot(rx, ry) > 0;
    return { active, capturing: false, held, pressed, lx, ly, rx, ry, move, nav };
  }

  return {
    poll,
    get available() { return available; },
    /** Name of the connected controller, or '' if none has been seen. */
    get id() { return read() ? seenId : ''; },
    get binds() { return { ...binds }; },
    setBinds(b) { binds = { ...PAD_DEFAULTS, ...(b && typeof b === 'object' ? b : {}) }; },
    /** Wait for the next button press and bind it to `action`. */
    capture(action, done) { capture = { action, done }; },
    cancelCapture() { capture = null; },
    get capturing() { return capture?.action ?? null; },
    name: (action) => padButtonName(binds[action]),
  };
}
