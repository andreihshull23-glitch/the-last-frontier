// Screen-space HUD drawn on a 2D canvas above the 3D view: objectives, map,
// vitals, weapons, markers over things in the world, prompts and toasts.
import { TILE as TS, PX, MACRO, ENEMIES, GUNS, GUN_ORDER, ITEMS, SOLID, ROCK, WATER, INDOOR, GROUND } from './content.js';
import { PLAYER, CLOCK, clockTime, nightFactor, objectiveList, objectiveDone, unsecuredValue, focusPrompt, bossState, currentGun, angleDiff } from './sim.js';

export const FONT_DISPLAY = '"Big Shoulders Display", "Arial Narrow", "Helvetica Neue", sans-serif';
export const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const U = 1 / PX;
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SHORT = { revolver: 'REV', rifle: 'RIF', shotgun: 'SHG', smg: 'SMG', longrifle: 'LNG', pulse: 'PLS', arc: 'ARC' };
const TONE = { story: '#e8a33d', good: '#a9c98f', bad: '#e2735c', warn: '#e8a33d', info: '#ece1cb' };
const INK = '#ece1cb', DUST = '#a89a84', LAMP = '#e8a33d', BLOOD = '#e2735c', SAGE = '#a9c98f', HOLLOW = '#b9a8ff';

export function toast(r, text, tone = 'story', long = false) {
  if (!text) return;
  if (r.toasts.some((t) => t.text === text && t.age < 1.5)) return;
  r.toasts.push({ text, tone, age: 0, life: long ? 7 : 4 });
  if (r.toasts.length > 4) r.toasts.shift();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(14,12,11,0.72)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(236,225,203,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = wd; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
function label(ctx, text, x, y, color, font, align = 'center') {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---- the map -----------------------------------------------------------------

/** One pixel per tile: rock, ground, buildings, water. Cached per level. */
function baseMap(r, sim) {
  const L = sim.level;
  if (r.mapBase && r.mapBaseFor === L) return r.mapBase;
  const c = document.createElement('canvas');
  c.width = L.w; c.height = L.h;
  const g = c.getContext('2d');
  const img = g.createImageData(L.w, L.h);
  const dark = L.theme === 'mine' || L.theme === 'hollow';
  for (let i = 0; i < L.w * L.h; i++) {
    const f = L.flags[i], gr = L.ground[i];
    let col;
    if (f & ROCK) col = dark ? [30, 26, 30] : [92, 58, 44];
    else if (f & WATER) col = [70, 130, 150];
    else if (f & SOLID && L.hgt[i] >= 20) col = dark ? [120, 104, 96] : [70, 52, 40];
    else if (f & INDOOR) col = [176, 132, 92];
    else if (gr === GROUND.trail || gr === GROUND.plank || gr === GROUND.gravel) col = dark ? [120, 104, 110] : [226, 196, 150];
    else if (gr === GROUND.grass) col = dark ? [90, 84, 120] : [190, 176, 118];
    else col = dark ? [98, 86, 104] : [206, 172, 128];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  r.mapBase = c; r.mapBaseFor = L; r.mapFog = null;
  return c;
}

/** The base map with unexplored canyon cells blacked out. Rebuilt when more is explored. */
function foggedMap(r, sim) {
  const L = sim.level, s = sim.state;
  const base = baseMap(r, sim);
  let seen = 0;
  for (let i = 0; i < s.explored.length; i++) seen += s.explored[i];
  if (r.mapFog && r.mapFogSeen === seen && r.mapFogFor === L) return r.mapFog;
  const c = r.mapFog && r.mapFogFor === L ? r.mapFog : document.createElement('canvas');
  c.width = L.w; c.height = L.h;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.fillStyle = '#131216';
  for (let my = 0; my < L.mh; my++) for (let mx = 0; mx < L.mw; mx++) {
    if (!s.explored[my * L.mw + mx]) g.fillRect(mx * MACRO, my * MACRO, MACRO, MACRO);
  }
  r.mapFog = c; r.mapFogSeen = seen; r.mapFogFor = L;
  return c;
}

function drawMapMarkers(ctx, sim, x, y, sc, big, ui) {
  const s = sim.state, p = s.player;
  const done = objectiveDone(s);
  const at = (wx, wy) => [x + (wx / TS) * sc, y + (wy / TS) * sc];
  for (const it of s.interactables) {
    if (!it.known || (it.done && it.kind !== 'exit')) continue;
    const [mx, my] = at(it.x, it.y);
    if (it.kind === 'exit') {
      ctx.strokeStyle = SAGE; ctx.lineWidth = big ? 2.5 : 1.5; ctx.globalAlpha = done ? 1 : 0.7;
      ctx.beginPath(); ctx.arc(mx, my, big ? 6 : 3.5, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      if (big) label(ctx, 'EXIT', mx, my - 10, SAGE, `700 11px ${FONT_MONO}`);
    } else if (it.kind === 'objective') {
      const k = big ? 6 : 4;
      ctx.fillStyle = LAMP;
      ctx.beginPath(); ctx.moveTo(mx, my - k); ctx.lineTo(mx + k, my); ctx.lineTo(mx, my + k); ctx.lineTo(mx - k, my); ctx.closePath(); ctx.fill();
    } else if (it.kind === 'cache' && (it.seen || big)) {
      ctx.fillStyle = 'rgba(232,163,61,0.7)';
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    } else if (it.kind === 'shop' || it.kind === 'board') {
      ctx.fillStyle = LAMP;
      ctx.fillRect(mx - 2, my - 2, 4, 4);
    } else if (it.kind === 'ride') {
      ctx.strokeStyle = SAGE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, big ? 6 : 3.5, 0, TAU); ctx.stroke();
    } else if (it.kind === 'talk' && ui?.town?.giver === it.role) {
      label(ctx, '!', mx, my + 4, LAMP, `900 ${big ? 18 : 13}px ${FONT_DISPLAY}`);
    }
  }
  for (const e of s.enemies) {
    if (e.dead || ENEMIES[e.kind].ai === 'none') continue;
    const [mx, my] = at(e.x, e.y);
    if (e.target || e.kind === 'bounty') {
      if (!e.known) continue;
      ctx.fillStyle = BLOOD;
      ctx.fillRect(mx - 3, my - 3, 6, 6);
    } else if (e.spotted) {
      ctx.fillStyle = e.kind === 'walker' || e.kind === 'husk' ? HOLLOW : BLOOD;
      ctx.beginPath(); ctx.arc(mx, my, big ? 3 : 2, 0, TAU); ctx.fill();
    }
  }
  const [px, py] = at(p.x, p.y);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.aim);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(big ? 9 : 6, 0); ctx.lineTo(big ? -5 : -3.5, big ? -5 : -3.5); ctx.lineTo(big ? -2 : -1.5, 0); ctx.lineTo(big ? -5 : -3.5, big ? 5 : 3.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawMinimap(r, ctx, sim, right, top, maxW, maxH, ui) {
  const L = sim.level;
  const sc = Math.min(maxW / L.w, maxH / L.h);
  const w = L.w * sc, h = L.h * sc;
  const x = right - w, y = top;
  panel(ctx, x - 4, y - 4, w + 8, h + 8);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(foggedMap(r, sim), x, y, w, h);
  drawMapMarkers(ctx, sim, x, y, sc, false, ui);
  return { x, y, w, h };
}

function drawBigMap(r, ctx, sim, ui) {
  const { w, h } = r.view;
  const L = sim.level, s = sim.state;
  ctx.fillStyle = 'rgba(10,9,8,0.86)';
  ctx.fillRect(0, 0, w, h);
  const sc = Math.min((w - 60) / L.w, (h - 130) / L.h);
  const mw = L.w * sc, mh = L.h * sc;
  const x = (w - mw) / 2, y = (h - mh) / 2 + 14;
  panel(ctx, x - 6, y - 6, mw + 12, mh + 12);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(foggedMap(r, sim), x, y, mw, mh);
  ctx.imageSmoothingEnabled = true;
  for (const z of L.zones) {
    if (z.indoor && s.mode !== 'town') continue;
    const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2;
    const mx = Math.floor(cx / (TS * MACRO)), my = Math.floor(cy / (TS * MACRO));
    if (!s.explored[my * L.mw + mx]) continue;
    label(ctx, z.name.toUpperCase(), x + (cx / TS) * sc, y + (z.y0 / TS) * sc - 4, INK, `700 ${w < 640 ? 9 : 11}px ${FONT_MONO}`);
  }
  drawMapMarkers(ctx, sim, x, y, sc, true, ui);
  label(ctx, (L.name || 'MAP').toUpperCase(), w / 2, y - 22, LAMP, `900 ${w < 640 ? 22 : 30}px ${FONT_DISPLAY}`);
  const legend = s.mode === 'town' ? 'YOU ▸   SHOPS ■   RIDE OUT ○' : 'YOU ▸   OBJECTIVE ◆   EXIT ○   CACHE ▪   ENEMY ●';
  label(ctx, legend, w / 2, y + mh + 26, DUST, `600 ${w < 640 ? 9.5 : 11}px ${FONT_MONO}`);
  label(ctx, r.touch ? 'TAP MAP TO CLOSE' : 'M OR TAB TO CLOSE', w / 2, y + mh + 44, DUST, `500 10px ${FONT_MONO}`);
}

// ---- world-space overlays --------------------------------------------------------

function edgeScale(ox, oy, dx, dy, b) {
  let k = Infinity;
  if (dx > 0) k = Math.min(k, (b.right - ox) / dx); else if (dx < 0) k = Math.min(k, (b.left - ox) / dx);
  if (dy > 0) k = Math.min(k, (b.bottom - oy) / dy); else if (dy < 0) k = Math.min(k, (b.top - oy) / dy);
  return k;
}

/** A marker pinned to a place in the world: on it when visible, else an arrow at the screen edge. */
function marker(r, ctx, x, y, height, b, color, shape, text, alpha = 1) {
  const { w, h } = r.view;
  const q = r.locate(x, y, height);
  const ox = w / 2, oy = h / 2;
  let dx, dy, on = false;
  if (q.front) {
    on = q.x > b.left && q.x < b.right && q.y > b.top && q.y < b.bottom;
    dx = q.x - ox; dy = q.y - oy;
  } else { dx = q.dx; dy = q.dy; }
  ctx.globalAlpha = alpha;
  if (on) {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (shape === 'ring') { ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, TAU); ctx.stroke(); }
    else if (shape === 'bang') label(ctx, '!', q.x, q.y + 8, color, `900 26px ${FONT_DISPLAY}`);
    else { ctx.beginPath(); ctx.moveTo(q.x, q.y - 8); ctx.lineTo(q.x + 7, q.y); ctx.lineTo(q.x, q.y + 8); ctx.lineTo(q.x - 7, q.y); ctx.closePath(); ctx.fill(); }
    if (text) label(ctx, text, q.x, q.y - 14, color, `600 11px ${FONT_MONO}`);
  } else {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const k = edgeScale(ox, oy, dx, dy, b);
    if (Number.isFinite(k) && k > 0) {
      const ex = ox + dx * k, ey = oy + dy * k;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (text) label(ctx, text, clamp(ex - dx * 26, b.left + 20, b.right - 20), clamp(ey - dy * 22 + 4, b.top + 12, b.bottom - 4), color, `600 10px ${FONT_MONO}`);
    }
  }
  ctx.globalAlpha = 1;
}

function drawWorldOverlays(r, ctx, sim, dt, b, ui) {
  const s = sim.state, p = s.player;
  const town = s.mode === 'town';
  // enemy state above heads; a fresh "!" shows through walls nearby
  for (const e of s.enemies) {
    if (e.dead) continue;
    const def = ENEMIES[e.kind];
    if (def.ai === 'none') continue;
    const mark = r.marks.get(e.id);
    if (mark) { mark.t -= dt; if (mark.t <= 0) r.marks.delete(e.id); }
    const dist = Math.hypot(e.x - p.x, e.y - p.y) * U;
    const visible = Boolean(e.spotted);
    if (!visible && !(mark?.kind === '!' && dist < 26)) continue;
    const tall = 2.05 * (e.r > 14 ? 1.5 : 1);
    const q = r.project(e.x * U, tall, e.y * U);
    if (!q.front) continue;
    const suspicious = e.suspicion > 0.05 && e.suspicion < 1 && e.state !== 'engage' && e.state !== 'dormant';
    let top = q.y;
    if (visible && e.hp < e.maxHp && !def.boss && dist < 46) {
      const bw = 38, f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(q.x - bw / 2 - 1, q.y - 4, bw + 2, 6);
      ctx.fillStyle = def.ai === 'swarm' ? HOLLOW : BLOOD; ctx.fillRect(q.x - bw / 2, q.y - 3, bw * f, 4);
      top -= 10;
    }
    if (suspicious && visible) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(q.x, top - 8, 7, 0, TAU); ctx.stroke();
      ctx.strokeStyle = LAMP; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(q.x, top - 8, 7, -Math.PI / 2, -Math.PI / 2 + TAU * e.suspicion); ctx.stroke();
    } else {
      const lab = mark?.kind ?? (e.state === 'investigate' || e.state === 'search' ? '?' : null);
      if (lab) label(ctx, lab, q.x, top - 2, lab === '!' ? BLOOD : LAMP, `900 22px ${FONT_DISPLAY}`);
    }
    if ((e.kind === 'bounty' || e.target) && visible && !def.boss) label(ctx, e.name ?? (e.kind === 'brute' ? 'Rustler boss' : 'Outlaw'), q.x, top - 22, BLOOD, `700 11px ${FONT_MONO}`);
  }
  // people in town
  if (town) {
    for (const n of s.npcs) {
      const d = Math.hypot(n.x - p.x, n.y - p.y) * U;
      const giver = ui.town?.giver === n.role;
      if (d > 11 && !giver) continue;
      const q = r.project(n.x * U, 2.2, n.y * U);
      if (!q.front) continue;
      if (d <= 11) {
        ctx.globalAlpha = clamp((11 - d) / 3, 0, 1);
        label(ctx, n.name, q.x, q.y, INK, `600 11px ${FONT_MONO}`);
        ctx.globalAlpha = 1;
      }
    }
  }
  // objectives, exits and people worth finding
  const done = objectiveDone(s);
  for (const it of s.interactables) {
    if (!it.known || it.done) continue;
    const dist = Math.round(Math.hypot(it.x - p.x, it.y - p.y) * U);
    if (it.kind === 'objective') marker(r, ctx, it.x, it.y, 1.6, b, LAMP, 'diamond', `${dist}m`);
    else if (it.kind === 'exit') marker(r, ctx, it.x, it.y, 2.4, b, SAGE, 'ring', done ? `EXIT ${dist}m` : `${dist}m`, done ? 1 : 0.55);
    else if (it.kind === 'ride' && ui.town?.canRide) marker(r, ctx, it.x, it.y, 2.6, b, SAGE, 'ring', dist > 6 ? `RIDE OUT ${dist}m` : '', 0.9);
    else if (it.kind === 'talk' && ui.town?.giver === it.role) marker(r, ctx, it.x, it.y, 2.75, b, LAMP, 'bang', dist > 9 ? `${dist}m` : '');
    else if (it.kind === 'shop' && ui.town?.flag === it.shop) marker(r, ctx, it.x, it.y, 2.6, b, LAMP, 'bang', dist > 9 ? `${dist}m` : '');
  }
  for (const e of s.enemies) {
    if (e.dead || !(e.target || e.kind === 'bounty') || !e.known || ENEMIES[e.kind].boss) continue;
    marker(r, ctx, e.x, e.y, 2.6, b, BLOOD, 'diamond', `${Math.round(Math.hypot(e.x - p.x, e.y - p.y) * U)}m`);
  }
  // numbers that float up from hits and pickups
  r.floaters = r.floaters.filter((pt) => (pt.life -= dt) > 0);
  for (const pt of r.floaters) {
    pt.z += dt * 0.8;
    const q = r.project(pt.x * U, pt.z, pt.y * U);
    if (!q.front) continue;
    ctx.globalAlpha = clamp(pt.life / pt.max * 1.6, 0, 1);
    label(ctx, pt.text, q.x, q.y, pt.color, `700 ${pt.size}px ${FONT_MONO}`);
    ctx.globalAlpha = 1;
  }
}

// ---- panels ----------------------------------------------------------------------

function drawClock(ctx, s, x, y, compact, align) {
  const bonus = s.config.sundownBonus ?? 0;
  const tt = clockTime(s);
  const night = CLOCK.night + bonus;
  const n = nightFactor(s);
  const w = compact ? 96 : 150;
  const x0 = align === 'right' ? x - w : x - w / 2;
  const t = clamp(tt / night, 0, 1);
  ctx.strokeStyle = 'rgba(236,225,203,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y + 10); ctx.lineTo(x0 + w, y + 10); ctx.stroke();
  ctx.fillStyle = n >= 1 ? '#c9cfe8' : t > 0.7 ? '#ff7a4a' : '#ffd27a';
  ctx.beginPath(); ctx.arc(x0 + w * t, y + 10 - Math.sin(Math.PI * (1 - t * 0.5)) * 6, n >= 1 ? 3.5 : 4.5, 0, TAU); ctx.fill();
  const remain = night - tt;
  let text;
  if (remain > 0) text = `SUNDOWN ${Math.floor(remain / 60)}:${String(Math.floor(remain % 60)).padStart(2, '0')}`;
  else text = 'NIGHT';
  label(ctx, text, align === 'right' ? x0 + w : x0 + w / 2, y + 26, remain <= 0 ? HOLLOW : remain < 60 ? LAMP : INK, `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`, align === 'right' ? 'right' : 'center');
}

function drawWeapons(r, ctx, sim, right, bottom, compact) {
  const s = sim.state, p = s.player;
  const g = currentGun(sim);
  const owned = GUN_ORDER.filter((k) => p.mags[k] !== undefined);
  const town = s.mode === 'town';
  const energy = !g.ammo;
  const W = Math.max(compact ? 188 : 250, 74 + owned.length * (compact ? 40 : 46)), H = owned.length > 1 || p.dynamite > 0 ? 66 : 46;
  const x = right - W, y = bottom - H;
  panel(ctx, x, y, W, H);
  ctx.textAlign = 'left';
  ctx.fillStyle = LAMP;
  ctx.font = `800 ${compact ? 14 : 16}px ${FONT_DISPLAY}`;
  ctx.fillText(g.name.toUpperCase(), x + 10, y + 19);
  // rounds in the gun
  const mag = Math.floor(p.mags[p.gun]);
  const n = g.mag, pipW = Math.min(9, (W - 20 - (compact ? 40 : 52)) / n);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i < mag ? (energy ? (g.bolt || '#6fd6ff') : g.ammo === 'shells' ? '#d0573f' : '#d6a84a') : 'rgba(236,225,203,0.14)';
    ctx.fillRect(x + 10 + i * pipW, y + 27, Math.max(1, pipW - (pipW > 4 ? 2 : 1)), 9);
  }
  const reserve = energy ? 'CELL' : town ? '∞' : `+${p.ammo[g.ammo]}`;
  ctx.textAlign = 'right';
  ctx.font = `600 ${compact ? 11 : 12}px ${FONT_MONO}`;
  ctx.fillStyle = energy ? (g.bolt || INK) : !town && p.ammo[g.ammo] === 0 ? BLOOD : INK;
  ctx.fillText(reserve, x + W - 10, y + 36);
  ctx.fillStyle = DUST;
  ctx.font = `500 10px ${FONT_MONO}`;
  ctx.fillText(energy ? (mag < g.mag ? 'recharging' : 'charged') : p.reloading ? 'loading' : mag === 0 ? 'EMPTY' : !r.touch && r.keyHints ? `[${r.pad ? r.pad.reload : 'R'}]` : '', x + W - 10, y + 19);
  if (H > 46) {
    let sx = x + 10;
    ctx.textAlign = 'left';
    ctx.font = `600 10px ${FONT_MONO}`;
    for (const k of owned) {
      const cur = k === p.gun;
      const text = `${owned.indexOf(k) + 1} ${SHORT[k] || k.slice(0, 3).toUpperCase()}${owned.length <= 3 ? ' ' + Math.floor(p.mags[k]) : ''}`;
      const tw = ctx.measureText(text).width + 10;
      ctx.fillStyle = cur ? 'rgba(232,163,61,0.22)' : 'rgba(236,225,203,0.06)';
      ctx.fillRect(sx, y + H - 21, tw, 15);
      ctx.fillStyle = cur ? LAMP : DUST;
      ctx.fillText(text, sx + 5, y + H - 10);
      sx += tw + 4;
    }
    if (!town) {
      ctx.textAlign = 'right';
      ctx.fillStyle = p.dynamite > 0 ? '#e2735c' : 'rgba(236,225,203,0.3)';
      ctx.fillText(`DYN ${p.dynamite}`, x + W - 10, y + H - 10);
    }
  }
  return { x, y, w: W, h: H };
}

function drawCrosshair(ctx, c, r, sim) {
  const p = sim.state.player;
  const g = currentGun(sim);
  const base = g.pellets ? 13 : g.id === 'rifle' ? 5 : 7;
  const open = base + r.kick * 7 + (p.fanQueue > 0 ? 8 : 0) + (p.sprinting ? 8 : 0);
  ctx.strokeStyle = p.mags[p.gun] === 0 ? BLOOD : INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(c.x + dx * open, c.y + dy * open); ctx.lineTo(c.x + dx * (open + 6), c.y + dy * (open + 6)); }
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(c.x - 1, c.y - 1, 2, 2);
  if (r.hitMarker > 0) {
    ctx.strokeStyle = `rgba(255,243,196,${r.hitMarker / 0.14})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(c.x + dx * 5, c.y + dy * 5); ctx.lineTo(c.x + dx * 11, c.y + dy * 11); }
    ctx.stroke();
  }
  if (p.reloading) {
    ctx.strokeStyle = LAMP; ctx.lineWidth = 2;
    const a0 = r.time * 7;
    ctx.beginPath(); ctx.arc(c.x, c.y, open + 12, a0, a0 + 1.6); ctx.stroke();
  }
}

function drawTouchUI(ctx, ui) {
  for (const st of ui.sticks) {
    ctx.strokeStyle = 'rgba(236,225,203,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(st.ox, st.oy, st.radius, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(236,225,203,0.4)';
    ctx.beginPath(); ctx.arc(st.x, st.y, 22, 0, TAU); ctx.fill();
  }
  for (const b of ui.buttons) {
    ctx.fillStyle = b.active ? 'rgba(232,163,61,0.55)' : 'rgba(14,12,11,0.55)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = b.highlight ? LAMP : 'rgba(236,225,203,0.45)';
    ctx.lineWidth = b.highlight ? 2.5 : 1.5;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `800 ${b.r > 30 ? 14 : 11}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x, b.y + 4);
  }
  if (ui.hint) { ctx.font = `500 11px ${FONT_MONO}`; ctx.fillStyle = 'rgba(236,225,203,0.6)'; ctx.textAlign = 'center'; ctx.fillText(ui.hint.text, ui.hint.x, ui.hint.y); }
}

// ---- the frame ---------------------------------------------------------------------

export function drawHUD(r, ctx, sim, dt, ui = {}) {
  const s = sim.state, p = s.player;
  const { w, h } = r.view;
  const ins = r.insets;
  const town = s.mode === 'town';
  const compact = w < 640, narrow = w < 900;
  const left = 12 + ins.left, top = 12 + ins.top, right = w - 12 - ins.right, bottom = h - 12 - ins.bottom;

  if (r.vignette) ctx.drawImage(r.vignette, 0, 0, w, h);
  if (!town && (p.hurtT > 0 || p.hp < p.maxHp * 0.3)) {
    const pulse = p.hp < p.maxHp * 0.3 ? 0.18 + Math.sin(r.time * 6) * 0.08 : 0;
    const alpha = Math.max(pulse, (p.hurtT / 0.3) * 0.32);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(150,20,10,0)'); g.addColorStop(1, `rgba(150,20,10,${alpha})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  r.hitDirs = r.hitDirs.filter((d) => (d.t -= dt) > 0);
  for (const d of r.hitDirs) {
    const rel = angleDiff(r.yaw, d.a);
    ctx.strokeStyle = `rgba(226,90,60,${Math.min(1, d.t) * 0.9})`;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.17, rel - Math.PI / 2 - 0.32, rel - Math.PI / 2 + 0.32); ctx.stroke();
  }

  // ---- top left: the job (or the town) ----
  const lineH = compact ? 15 : 17;
  const mapMaxW = compact ? 112 : 176, mapMaxH = compact ? 90 : 132;
  const panelW = compact ? Math.max(150, Math.min(236, right - mapMaxW - left - 58)) : 300;
  let panelH;
  ctx.font = `500 ${compact ? 10.5 : 11.5}px ${FONT_MONO}`;
  if (town) {
    const t = ui.town || {};
    const hintLines = t.hint ? wrap(ctx, t.hint, panelW - 20).slice(0, 3) : [];
    panelH = 48 + hintLines.length * lineH + 4;
    panel(ctx, left, top, panelW, panelH);
    ctx.textAlign = 'left';
    ctx.fillStyle = LAMP; ctx.font = `800 ${compact ? 15 : 17}px ${FONT_DISPLAY}`;
    ctx.fillText('MERCY', left + 10, top + 20);
    ctx.textAlign = 'right'; ctx.fillStyle = SAGE; ctx.font = `700 ${compact ? 12 : 14}px ${FONT_MONO}`;
    ctx.fillText(`$${t.cash ?? 0}`, left + panelW - 10, top + 20);
    ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = `500 ${compact ? 10.5 : 11.5}px ${FONT_MONO}`;
    ctx.fillText(truncate(ctx, t.who || '', panelW - 20), left + 10, top + 38);
    ctx.fillStyle = DUST;
    hintLines.forEach((l, i) => ctx.fillText(l, left + 10, top + 38 + (i + 1) * lineH));
  } else {
    const objs = objectiveList(sim);
    const value = unsecuredValue(s);
    const names = [...new Set(s.carried.items)].map((k) => ITEMS[k]?.label).filter(Boolean);
    const extra = value > 0 || names.length || s.carried.effects ? 1 : 0;
    panelH = 30 + objs.length * lineH + extra * (lineH + 4) + 6;
    panel(ctx, left, top, panelW, panelH);
    ctx.textAlign = 'left';
    ctx.fillStyle = LAMP; ctx.font = `800 ${compact ? 15 : 17}px ${FONT_DISPLAY}`;
    ctx.fillText(truncate(ctx, (s.config.title ?? 'The ride').toUpperCase(), panelW - 20), left + 10, top + 20);
    ctx.font = `500 ${compact ? 10.5 : 11.5}px ${FONT_MONO}`;
    objs.forEach((o, i) => {
      const y = top + 38 + i * lineH;
      ctx.strokeStyle = o.done ? SAGE : 'rgba(236,225,203,0.6)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(left + 10.5, y - 8.5, 8, 8);
      if (o.done) { ctx.fillStyle = SAGE; ctx.fillRect(left + 12, y - 7, 5, 5); }
      ctx.fillStyle = o.done ? SAGE : o.optional || o.dim ? DUST : INK;
      ctx.fillText(truncate(ctx, o.text, panelW - 34), left + 25, y);
    });
    if (extra) {
      const bits = [];
      if (value > 0) bits.push(`$${value}`);
      bits.push(...names.map((n) => n.toLowerCase()));
      if (s.carried.effects) bits.push('effects');
      ctx.fillStyle = LAMP;
      ctx.fillText(truncate(ctx, `UNSECURED ${bits.join(' · ')}`, panelW - 20), left + 10, top + 38 + objs.length * lineH + 4);
    }
  }

  // ---- top right: map and clock ----
  const mm = drawMinimap(r, ctx, sim, right, top, mapMaxW, mapMaxH, ui);
  if (!town && !s.noClock) {
    if (narrow) drawClock(ctx, s, right, top + mm.h + 12, true, 'right');
    else drawClock(ctx, s, w / 2, top + 4, false, 'center');
  }
  if (!r.touch && r.keyHints && !compact) label(ctx, `[${r.pad ? r.pad.map : 'M'}] MAP`, right, top + mm.h + (narrow && !town && !s.noClock ? 54 : 20), DUST, `500 10px ${FONT_MONO}`, 'right');

  // ---- vitals ----
  const barW = compact ? 118 : r.touch ? 160 : 210;
  const vitalsX = left, vitalsY = r.touch ? top + panelH + 10 : bottom - 58;
  let stackY = narrow ? Math.max(top + panelH, r.touch ? vitalsY + 58 : 0, top + mm.h + 34) + 12 : top + 44;
  const bounds = { left: left + 14, right: right - 14, top: narrow ? stackY + 8 : top + 74, bottom: r.touch ? bottom - 16 : bottom - 78 };

  drawWorldOverlays(r, ctx, sim, dt, bounds, ui);

  // boss
  const boss = bossState(sim);
  if (boss) {
    const bw = Math.min(460, w - 60), bx = w / 2 - bw / 2, by = narrow ? stackY : top + 44;
    if (narrow) stackY += 40; else stackY = Math.max(stackY, by + 40);
    label(ctx, boss.name.toUpperCase(), w / 2, by + 10, BLOOD, `800 14px ${FONT_DISPLAY}`);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 1, by + 15, bw + 2, 10);
    ctx.fillStyle = '#b8402e'; ctx.fillRect(bx, by + 16, bw * clamp(boss.hp / boss.maxHp, 0, 1), 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (const f of [1 / 3, 2 / 3]) ctx.fillRect(bx + bw * f - 1, by + 16, 2, 8);
  }

  if (s.extract.active) {
    const bw = Math.min(330, w - 40), bx = w / 2 - bw / 2, by = stackY;
    stackY += 44;
    panel(ctx, bx, by, bw, 34);
    const left2 = Math.max(0, PLAYER.extractTime - s.extract.t);
    label(ctx, `LEAVING · ${left2.toFixed(1)}s · STAY IN THE CIRCLE`, w / 2, by + 15, SAGE, `800 14px ${FONT_DISPLAY}`);
    ctx.fillStyle = 'rgba(169,201,143,0.25)'; ctx.fillRect(bx + 10, by + 22, bw - 20, 5);
    ctx.fillStyle = SAGE; ctx.fillRect(bx + 10, by + 22, (bw - 20) * (s.extract.t / PLAYER.extractTime), 5);
  }

  // toasts
  let ty = stackY + (narrow ? 0 : 14);
  for (const t of r.toasts) t.age += dt;
  r.toasts = r.toasts.filter((t) => t.age < t.life);
  ctx.textAlign = 'center';
  ctx.font = `500 ${compact ? 11.5 : 13}px ${FONT_MONO}`;
  for (const t of r.toasts) {
    const a = clamp(Math.min(t.age * 5, (t.life - t.age) * 2), 0, 1);
    const lines = wrap(ctx, t.text, Math.min(w - 40, 540));
    const bh = lines.length * 17 + 10;
    ctx.globalAlpha = a;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24;
    ctx.fillStyle = 'rgba(14,12,11,0.82)'; ctx.fillRect(w / 2 - bw / 2, ty, bw, bh);
    ctx.fillStyle = TONE[t.tone] ?? TONE.story; ctx.fillRect(w / 2 - bw / 2, ty, 3, bh);
    ctx.fillStyle = INK;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, ty + 18 + i * 17));
    ctx.globalAlpha = 1;
    ty += bh + 6;
  }

  // place name
  if (r.banner) {
    r.banner.life -= dt;
    if (r.banner.life <= 0) r.banner = null;
    else {
      ctx.globalAlpha = clamp(Math.min((r.banner.max - r.banner.life) * 3, r.banner.life * 2), 0, 1) * 0.92;
      label(ctx, r.banner.text, w / 2, h * 0.74, INK, `900 ${compact ? 22 : 32}px ${FONT_DISPLAY}`);
      ctx.globalAlpha = 1;
    }
  }

  // vitals panel
  if (!town) {
    panel(ctx, vitalsX, vitalsY, barW + 20, 58);
    ctx.fillStyle = 'rgba(226,115,92,0.2)'; ctx.fillRect(vitalsX + 10, vitalsY + 10, barW, 9);
    ctx.fillStyle = p.hp < p.maxHp * 0.3 ? '#ff6a4a' : '#d0573f'; ctx.fillRect(vitalsX + 10, vitalsY + 10, barW * clamp(p.hp / p.maxHp, 0, 1), 9);
    ctx.fillStyle = 'rgba(232,163,61,0.2)'; ctx.fillRect(vitalsX + 10, vitalsY + 23, barW, 4);
    ctx.fillStyle = p.sprinting ? '#ffd27a' : LAMP; ctx.fillRect(vitalsX + 10, vitalsY + 23, barW * (p.stamina / PLAYER.stamina), 4);
    ctx.font = `600 ${compact ? 10 : 11}px ${FONT_MONO}`;
    ctx.textAlign = 'left'; ctx.fillStyle = INK;
    ctx.fillText(`${Math.ceil(p.hp)}/${p.maxHp}`, vitalsX + 10, vitalsY + 44);
    ctx.fillStyle = SAGE; ctx.textAlign = 'right';
    ctx.fillText(`${p.bandages} bandage${p.bandages === 1 ? '' : 's'}${r.keyHints && !r.touch ? ` [${r.pad ? r.pad.heal : 'Q'}]` : ''}`, vitalsX + 10 + barW, vitalsY + 44);
  }

  // weapons
  const wp = r.touch ? { x: vitalsX + barW + 26, y: vitalsY } : null;
  if (wp) drawWeapons(r, ctx, sim, wp.x + (compact ? 188 : 250), wp.y + 66, compact);
  else drawWeapons(r, ctx, sim, right, bottom, compact);

  const cross = ui.freeCursor ?? { x: w / 2, y: h / 2 };
  if (s.phase === 'playing' && !r.mapOpen) drawCrosshair(ctx, cross, r, sim);

  // what the action key does here
  const fp = focusPrompt(sim);
  if (fp && s.phase === 'playing' && !r.mapOpen) {
    const key = r.touch ? 'ACT' : r.pad ? r.pad.use : 'E';
    const text = fp.kind === 'extracting' ? `[${key}] Cancel` : `[${key}] ${fp.hold ? 'Hold: ' : ''}${fp.label}`;
    ctx.font = `600 13px ${FONT_MONO}`;
    const tw = ctx.measureText(text).width + 18;
    const y = h * 0.63;
    ctx.fillStyle = 'rgba(14,12,11,0.82)'; ctx.fillRect(w / 2 - tw / 2, y - 14, tw, 22);
    ctx.textAlign = 'center'; ctx.fillStyle = INK; ctx.fillText(text, w / 2, y + 1);
    if (fp.progress > 0 && fp.kind !== 'extracting') {
      ctx.strokeStyle = LAMP; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cross.x, cross.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(fp.progress, 0, 1)); ctx.stroke();
    }
  }

  if (ui.touchUI && !r.mapOpen) drawTouchUI(ctx, ui.touchUI);
  if (!r.touch && r.keyHints && s.t < 22 && w >= 1000 && !r.mapOpen) {
    ctx.globalAlpha = clamp((22 - s.t) / 3, 0, 1) * 0.85;
    const P = r.pad;
    const hint = P
      ? (town
        ? `Left stick walk · Right stick look · ${P.sprint} sprint · ${P.use} talk and trade · ${P.journal} journal · ${P.map} map · ${P.menu} menu`
        : `Left stick move · Right stick look · ${P.fire} fire · ${P.alt} alt fire · ${P.dodge} dodge · ${P.reload} reload · ${P.next} next gun · ${P.throw} dynamite · ${P.heal} bandage · ${P.use} use`)
      : town
      ? 'WASD walk · Mouse look · Shift sprint · E talk and trade · J journal · M map · Esc menu'
      : 'WASD move · Shift sprint · Space dodge · Click fire · Right-click alt fire · 1-7 guns · G dynamite · R reload · Q bandage · E use';
    label(ctx, hint, w / 2, bottom - (town ? 6 : 4), INK, `500 11px ${FONT_MONO}`);
    ctx.globalAlpha = 1;
  }
  if (ui.lockHint && s.phase === 'playing' && !r.mapOpen) {
    ctx.font = `800 20px ${FONT_DISPLAY}`;
    const text = 'CLICK TO LOOK AROUND';
    const tw = ctx.measureText(text).width + 30;
    const y = h * 0.82;
    ctx.fillStyle = 'rgba(14,12,11,0.8)'; ctx.fillRect(w / 2 - tw / 2, y - 23, tw, 34);
    ctx.textAlign = 'center'; ctx.fillStyle = LAMP; ctx.fillText(text, w / 2, y);
  }
  if (r.mapOpen) drawBigMap(r, ctx, sim, ui);

  if (s.phase === 'dying' || s.phase === 'ended') {
    r.deathFade = Math.min(1, r.deathFade + dt * 0.8);
    const out = s.report?.outcome;
    const good = out === 'extracted' || out === 'fled';
    ctx.fillStyle = good ? `rgba(10,8,7,${r.deathFade})` : `rgba(30,4,2,${s.phase === 'dying' ? r.deathFade * 0.7 : 0.7 + r.deathFade * 0.3})`;
    ctx.fillRect(0, 0, w, h);
    if (s.phase === 'ended') {
      ctx.globalAlpha = clamp(r.deathFade * 1.5, 0, 1);
      const text = out === 'extracted' ? 'RIDING FOR MERCY' : out === 'fled' ? 'TURNED BACK' : 'DEAD IN THE RED COUNTRY';
      label(ctx, text, w / 2, h / 2, good ? SAGE : BLOOD, `900 ${Math.round(clamp(w * 0.085, 30, 84))}px ${FONT_DISPLAY}`);
      ctx.globalAlpha = 1;
    }
  }
}
