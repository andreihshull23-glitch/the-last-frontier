// The title screen's backdrop: a slow pan from left to right along the story, drawn on a 2D canvas in
// layers that move at different speeds. The Spire, WARDEN, the Unlisted, Mercy Deck, the freight lift,
// the Hollow, then round again. Each scene is painted once to its own canvas; only small things move
// (the eye's scan, the lift car, flicker, rain). Presentation only: reads nothing from the game.

const H = 720, SCENE_W = 1150;
const NEON = { pink: '#ff3fa4', cyan: '#3fe0ff', amber: '#ffb43f', gold: '#ffd23f', red: '#ff2e4a', violet: '#a070ff', green: '#5dff9a' };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function glowText(c, text, x, y, col, size, align = 'center') {
  c.font = `700 ${size}px "Jersey 15", "Arial Narrow", Impact, sans-serif`;
  c.textAlign = align; c.shadowColor = col; c.shadowBlur = size * 0.6; c.fillStyle = col; c.fillText(text, x, y);
  c.shadowBlur = 0;
}
function caption(c, title, sub, x) {
  c.textAlign = 'left';
  c.font = '700 13px ui-monospace, Menlo, Consolas, monospace'; c.fillStyle = 'rgba(232,236,255,.75)';
  c.fillText(title, x, H - 92);
  c.font = '500 11px ui-monospace, Menlo, Consolas, monospace'; c.fillStyle = 'rgba(154,159,202,.7)';
  c.fillText(sub, x, H - 74);
  c.fillStyle = 'rgba(255,63,164,.8)'; c.fillRect(x, H - 112, 28, 3);
}

/** The Meridian Spire: one tower filling the frame, lit floors, the executives' crown burning gold. */
function sceneSpire() {
  const cv = canvas(SCENE_W, H), c = cv.getContext('2d'), r = rng(4);
  const x0 = 380, w = 360;
  const body = c.createLinearGradient(x0, 0, x0 + w, 0);
  body.addColorStop(0, '#0d0c1e'); body.addColorStop(0.5, '#1b1838'); body.addColorStop(1, '#0a0918');
  c.fillStyle = body; c.fillRect(x0, 40, w, H);
  c.beginPath(); c.moveTo(x0 + 40, 40); c.lineTo(x0 + w / 2, -60); c.lineTo(x0 + w - 40, 40); c.fill();
  for (let y = 150; y < H - 40; y += 9) for (let x = x0 + 14; x < x0 + w - 14; x += 11) {
    if (r() < 0.38) { c.fillStyle = r() < 0.15 ? 'rgba(63,224,255,.55)' : `rgba(255,${180 + r() * 50},${120 + r() * 60},${0.25 + r() * 0.45})`; c.fillRect(x, y, 6, 4); }
  }
  // the top forty floors: sealed, gold, out of reach
  const crown = c.createLinearGradient(0, 40, 0, 150);
  crown.addColorStop(0, 'rgba(255,210,63,.95)'); crown.addColorStop(1, 'rgba(255,150,40,.25)');
  c.fillStyle = crown; c.fillRect(x0 + 10, 48, w - 20, 100);
  for (let y = 56; y < 146; y += 8) { c.fillStyle = 'rgba(40,20,0,.55)'; c.fillRect(x0 + 10, y, w - 20, 2); }
  c.shadowColor = NEON.gold; c.shadowBlur = 40; c.fillStyle = 'rgba(255,210,63,.3)'; c.fillRect(x0 + 10, 48, w - 20, 100); c.shadowBlur = 0;
  glowText(c, 'MERIDIAN', x0 + w / 2, 200, NEON.cyan, 34);
  caption(c, 'THE MERIDIAN SPIRE', '400 floors. Sealed. Nobody alive has been outside.', 90);
  return cv;
}

/** WARDEN: a wall of screens and, in the middle, the eye. */
function sceneWarden() {
  const cv = canvas(SCENE_W, H), c = cv.getContext('2d'), r = rng(9);
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 9; gx++) {
    const x = 160 + gx * 96, y = 90 + gy * 72;
    c.fillStyle = '#07070f'; c.fillRect(x - 3, y - 3, 90, 66);
    c.fillStyle = `rgba(${120 + r() * 80},10,${30 + r() * 30},${0.25 + r() * 0.35})`; c.fillRect(x, y, 84, 60);
    c.fillStyle = 'rgba(255,60,80,.35)';
    for (let k = 0; k < 4; k++) c.fillRect(x + 6, y + 8 + k * 12, 20 + r() * 50, 3);
  }
  caption(c, 'WARDEN', 'Given the machines "to reduce overheads". It never gave them back.', 90);
  return cv;
}
function drawEye(c, x, y, t) {
  const R = 120;
  const g = c.createRadialGradient(x, y, 0, x, y, R * 1.6);
  g.addColorStop(0, 'rgba(255,40,70,.55)'); g.addColorStop(1, 'rgba(255,40,70,0)');
  c.fillStyle = g; c.fillRect(x - R * 2, y - R * 2, R * 4, R * 4);
  c.fillStyle = '#100208'; c.beginPath(); c.ellipse(x, y, R, R * 0.55, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = NEON.red; c.lineWidth = 4; c.stroke();
  const px = x + Math.sin(t * 0.7) * R * 0.45;
  c.fillStyle = NEON.red; c.shadowColor = NEON.red; c.shadowBlur = 30;
  c.beginPath(); c.arc(px, y, R * 0.24, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(px, y, R * 0.07, 0, Math.PI * 2); c.fill();
  // the scan line sweeping the wall
  const sy = y - 260 + ((t * 120) % 520);
  c.fillStyle = 'rgba(255,46,74,.18)'; c.fillRect(140, sy, 880, 4);
}

/** The Unlisted: rows of people, struck off. */
function sceneUnlisted() {
  const cv = canvas(SCENE_W, H), c = cv.getContext('2d'), r = rng(21);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 13; k++) {
    const x = 120 + k * 72 + (row % 2) * 36, base = 300 + row * 120, s = 0.8 + row * 0.12;
    c.fillStyle = `rgba(${18 + row * 10},${16 + row * 8},${40 + row * 12},1)`;
    c.beginPath(); c.arc(x, base - 74 * s, 13 * s, 0, Math.PI * 2); c.fill();
    c.fillRect(x - 17 * s, base - 60 * s, 34 * s, 62 * s);
    if (r() < 0.55) {   // a registry tag, struck out
      c.fillStyle = 'rgba(232,236,255,.5)';
      for (let b = 0; b < 7; b++) c.fillRect(x - 12 * s + b * 3.6 * s, base - 46 * s, (b % 3 ? 1.5 : 2.5) * s, 12 * s);
      c.strokeStyle = 'rgba(255,46,74,.9)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 15 * s, base - 30 * s); c.lineTo(x + 15 * s, base - 50 * s); c.stroke();
    }
  }
  c.save(); c.translate(820, 240); c.rotate(-0.18);
  c.strokeStyle = NEON.red; c.lineWidth = 6; c.strokeRect(-150, -46, 300, 92);
  glowText(c, 'DELETED', 0, 24, NEON.red, 66); c.restore();
  caption(c, 'THE UNLISTED', 'Struck off the registry. No air credits, no doors, not legally seen.', 90);
  return cv;
}

/** Mercy Deck: stalls under neon. */
function sceneDeck() {
  const cv = canvas(SCENE_W, H), c = cv.getContext('2d'), r = rng(33);
  c.fillStyle = '#0c0b1a'; c.fillRect(0, 150, SCENE_W, H - 150);
  c.fillStyle = '#141327'; c.fillRect(0, H - 170, SCENE_W, 170);
  const stalls = [['LOW TIDE', NEON.pink], ['SUPPLY', NEON.amber], ['CUSTOMS', NEON.cyan], ['GUNS', NEON.red], ['CLINIC', NEON.green]];
  stalls.forEach(([name, col], k) => {
    const x = 70 + k * 210, w = 180;
    c.fillStyle = '#07060f'; c.fillRect(x, 250, w, H - 420);
    const gl = c.createLinearGradient(0, 300, 0, H - 170); gl.addColorStop(0, 'rgba(255,226,192,.22)'); gl.addColorStop(1, 'rgba(255,226,192,.02)');
    c.fillStyle = gl; c.fillRect(x + 8, 300, w - 16, H - 470);
    c.fillStyle = '#05050b'; c.fillRect(x - 6, 200, w + 12, 58);
    glowText(c, name, x + w / 2, 242, col, 32);
    c.fillStyle = col; c.fillRect(x, 262, w, 3); c.fillRect(x, H - 172, w, 3);
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.1})`; c.fillRect(x + 20 + i * 26, 360 + (i % 2) * 40, 16, 30); }
    c.fillStyle = '#05050b'; c.fillRect(x + w / 2 - 9, H - 250, 18, 80); c.beginPath(); c.arc(x + w / 2, H - 262, 12, 0, Math.PI * 2); c.fill();
  });
  for (let k = 0; k < 9; k++) { const x = 40 + k * 130; c.strokeStyle = '#1d1c33'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 150); c.lineTo(x, 190); c.stroke(); c.fillStyle = 'rgba(255,240,216,.85)'; c.shadowColor = '#ffe2c0'; c.shadowBlur = 20; c.fillRect(x - 8, 190, 16, 5); c.shadowBlur = 0; }
  caption(c, 'MERCY DECK · LEVEL 12', 'The last free market in the tower. Not on any current floor plan.', 90);
  return cv;
}

/** The freight lift shaft: girders, cables; the car is drawn live. */
function sceneLift() {
  const cv = canvas(SCENE_W, H), c = cv.getContext('2d');
  c.fillStyle = '#08070f'; c.fillRect(420, 0, 320, H);
  for (let y = -20; y < H; y += 60) { c.strokeStyle = '#1e1c30'; c.lineWidth = 6; c.beginPath(); c.moveTo(420, y); c.lineTo(740, y + 60); c.moveTo(740, y); c.lineTo(420, y + 60); c.stroke(); }
  c.fillStyle = '#16152a'; c.fillRect(410, 0, 14, H); c.fillRect(736, 0, 14, H);
  for (let y = 40; y < H; y += 120) { c.fillStyle = 'rgba(255,180,63,.6)'; c.fillRect(424, y, 312, 3); }
  caption(c, 'THE FREIGHT LIFT', 'The only way off the deck. Down to the jobs, and further.', 90);
  return cv;
}
function drawLiftCar(c, x0, t) {
  const y = ((t * 40) % (H + 260)) - 220;
  c.fillStyle = '#2a2c40'; c.fillRect(x0 + 555, -10, 3, y + 10); c.fillRect(x0 + 602, -10, 3, y + 10);
  c.fillStyle = 'rgba(20,20,36,.95)'; c.fillRect(x0 + 470, y, 220, 150);
  c.strokeStyle = NEON.gold; c.lineWidth = 4; c.strokeRect(x0 + 470, y, 220, 150);
  c.fillStyle = 'rgba(255,226,192,.18)'; c.fillRect(x0 + 476, y + 10, 208, 134);
  c.fillStyle = 'rgba(255,180,63,.7)'; for (let k = 0; k < 18; k++) c.fillRect(x0 + 480 + k * 11.5, y + 16, 2, 126);
  c.fillStyle = '#05050b'; c.fillRect(x0 + 572, y + 74, 16, 70); c.beginPath(); c.arc(x0 + 580, y + 64, 11, 0, Math.PI * 2); c.fill();
}

/** The Hollow: a cavern under the foundations, a violet core, and the people it kept. */
function sceneHollow() {
  const cv = canvas(SCENE_W, H), c = cv.getContext('2d'), r = rng(51);
  const g = c.createRadialGradient(600, 430, 10, 600, 430, 420);
  g.addColorStop(0, 'rgba(160,112,255,.65)'); g.addColorStop(0.35, 'rgba(90,50,180,.25)'); g.addColorStop(1, 'rgba(10,6,24,0)');
  c.fillStyle = g; c.fillRect(0, 0, SCENE_W, H);
  c.fillStyle = '#06040e';
  c.beginPath(); c.moveTo(0, 0); for (let x = 0; x <= SCENE_W; x += 40) c.lineTo(x, 70 + r() * 120); c.lineTo(SCENE_W, 0); c.fill();
  c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= SCENE_W; x += 40) c.lineTo(x, H - 120 - r() * 70); c.lineTo(SCENE_W, H); c.fill();
  // cracks of light
  c.strokeStyle = 'rgba(185,168,255,.55)'; c.lineWidth = 2;
  for (let k = 0; k < 9; k++) { let x = 600, y = 430; c.beginPath(); c.moveTo(x, y); const a = r() * Math.PI * 2; for (let s = 0; s < 8; s++) { x += Math.cos(a + (r() - 0.5)) * 30; y += Math.sin(a + (r() - 0.5)) * 30; c.lineTo(x, y); } c.stroke(); }
  // husks, standing where they stopped
  for (let k = 0; k < 7; k++) {
    const x = 160 + k * 130 + (k > 3 ? 120 : 0), base = H - 150, s = 0.9 + r() * 0.3;
    c.fillStyle = '#0b0718'; c.beginPath(); c.arc(x, base - 76 * s, 12 * s, 0, Math.PI * 2); c.fill(); c.fillRect(x - 15 * s, base - 62 * s, 30 * s, 64 * s);
    c.fillStyle = 'rgba(185,168,255,.9)'; c.fillRect(x - 6 * s, base - 79 * s, 3, 2); c.fillRect(x + 3 * s, base - 79 * s, 3, 2);
  }
  caption(c, 'THE HOLLOW', 'Older than the corporation, and awake. WARDEN has been feeding it people.', 90);
  return cv;
}
function drawCore(c, x0, t) {
  const p = 0.6 + Math.sin(t * 1.7) * 0.25;
  c.fillStyle = `rgba(200,180,255,${p})`; c.shadowColor = '#b9a8ff'; c.shadowBlur = 50;
  c.beginPath(); c.moveTo(x0 + 600, 360); c.lineTo(x0 + 640, 430); c.lineTo(x0 + 600, 500); c.lineTo(x0 + 560, 430); c.closePath(); c.fill(); c.shadowBlur = 0;
}

export function createTitleScroll() {
  let el = null, raf = 0, last = 0, t = 0, scenes = null, sky = null, near = null;
  const drops = Array.from({ length: 160 }, (_, i) => ({ x: (i * 97) % 1600, y: (i * 233) % 900, s: 600 + (i % 7) * 60 }));
  function build() {
    scenes = [
      { cv: sceneSpire(), live: null },
      { cv: sceneWarden(), live: (c, x) => drawEye(c, x + 590, 330, t) },
      { cv: sceneUnlisted(), live: null },
      { cv: sceneDeck(), live: null },
      { cv: sceneLift(), live: (c, x) => drawLiftCar(c, x, t) },
      { cv: sceneHollow(), live: (c, x) => drawCore(c, x, t) },
    ];
    sky = new Image(); sky.src = 'assets/sky/city.jpg';
    // the near layer: girders and cables, black against everything
    near = canvas(2400, H);
    const c = near.getContext('2d'), r = rng(77);
    c.fillStyle = '#020207';
    for (let x = 0; x < 2400; x += 300 + r() * 200) { c.fillRect(x, 0, 26 + r() * 20, H); for (let y = 30; y < H; y += 70) c.fillRect(x - 8, y, 50, 6); }
    c.strokeStyle = '#05050c'; c.lineWidth = 4;
    for (let k = 0; k < 8; k++) { const x = r() * 2400; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 150, 120 + r() * 80, x + 300 + r() * 200, 0); c.stroke(); }
    c.fillRect(0, H - 26, 2400, 26);
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
    t += dt;
    const W = el.clientWidth, Hh = el.clientHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(Hh * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(Hh * dpr); }
    const c = el.getContext('2d');
    const k = el.height / H;           // scene pixels to screen pixels
    c.setTransform(1, 0, 0, 1, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, el.height);
    g.addColorStop(0, '#05040f'); g.addColorStop(0.6, '#140c2c'); g.addColorStop(1, '#0a0716');
    c.fillStyle = g; c.fillRect(0, 0, el.width, el.height);
    const cam = t * 90;                // scene pixels per second, panning right
    // far: the city panorama's horizon band
    if (sky?.complete && sky.naturalWidth) {
      const bandY = sky.naturalHeight * 0.28, bandH = sky.naturalHeight * 0.26;
      const sw = sky.naturalWidth, dw = sw * (el.height * 0.55 / bandH);
      const off = -((cam * 0.15 * k) % dw);
      c.globalAlpha = 0.55;
      for (let x = off; x < el.width; x += dw) c.drawImage(sky, 0, bandY, sw, bandH, x, el.height * 0.18, dw, el.height * 0.55);
      c.globalAlpha = 1;
    }
    // mid: the story, scene after scene
    const total = SCENE_W * scenes.length;
    const mid = cam * 0.55;
    c.setTransform(k, 0, 0, k, 0, 0);
    const viewW = el.width / k;
    for (let i = 0; i < scenes.length; i++) {
      const base = (((i * SCENE_W - mid) % total) + total) % total;
      for (const sx of [base, base - total]) {
        if (sx > viewW || sx < -SCENE_W) continue;
        const S = scenes[i];
        c.drawImage(S.cv, sx, 0);
        if (S.live) S.live(c, sx);
      }
    }
    // near: girders, faster
    const nx = -((cam * 1.1) % 2400);
    for (let x = nx; x < viewW; x += 2400) c.drawImage(near, x, 0);
    // rain
    c.strokeStyle = 'rgba(160,184,232,.18)'; c.lineWidth = 1;
    c.beginPath();
    for (const d of drops) { const y = (d.y + t * d.s) % 900 - 60, x = (d.x - t * 40) % 1600; const xx = x < 0 ? x + 1600 : x; c.moveTo(xx, y); c.lineTo(xx - 4, y + 22); }
    c.stroke();
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  return {
    /** Start panning, on a canvas placed just before `before` (so it sits underneath it). */
    start(before) {
      if (raf) return;
      if (!scenes) build();
      if (!el) { el = document.createElement('canvas'); el.className = 'title-scroll'; el.setAttribute('aria-hidden', 'true'); }
      if (el.nextSibling !== before) before.parentNode.insertBefore(el, before);
      el.hidden = false;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (el) el.hidden = true; },
  };
}
