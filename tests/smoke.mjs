// End-to-end smoke test in headless Chromium (WebGL through SwiftShader).
// Serves the project the way the Artifact host does, swaps the three.js CDN
// script for a local copy, then plays: title -> new campaign -> hire -> walk
// Mercy -> buy at a counter -> ride chapter 1 -> fight -> loot -> extract ->
// results -> back to town; then death and a successor, a reload mid-ride, the
// mine, the Hollow, the boss, and a phone layout.
// Usage: node tests/smoke.mjs [outDir] [path/to/three.min.js] [only]

import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, root } from './harness.mjs';

const out = path.resolve(process.argv[2] ?? path.join(root, 'tests', 'shots'));
const threeLocal = process.argv[3] ?? process.env.THREE_JS;
const only = process.argv[4] ? process.argv[4].split(',') : null;
fs.mkdirSync(out, { recursive: true });

const { server, base } = await serve();
const { browser, newPage, problems } = await launch(threeLocal);
const log = (...a) => console.log('·', ...a);
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const want = (name) => !only || only.includes(name);
let failed = 0;
const check = (ok, what) => { if (!ok) { failed++; console.log('✗', what); } else log('ok', what); };

async function open(options = {}) {
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 720 }, ...options });
  await page.goto(`${base}/?debug`);
  await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
  return { ctx, page };
}
const D = (page, fn, arg) => page.evaluate(fn, arg);
const waitMode = (page, mode, timeout = 60000) => page.waitForFunction((m) => window.LF_DEBUG.app.mode === m, mode, { timeout });
/** Wait until the sim clock passes `t` seconds (SwiftShader is slow, so never wait on wall time). */
const waitSim = (page, t, timeout = 240000) => page.waitForFunction((tt) => (window.LF_DEBUG.state()?.t ?? 0) >= tt, t, { timeout });
const simT = (page) => D(page, () => window.LF_DEBUG.state()?.t ?? 0);
async function startCampaign(page) {
  await page.click('[data-act="new"]');
  await page.waitForSelector('[data-act="hire"]');
  await page.click('[data-act="hire"][data-i="0"]');
  await waitMode(page, 'town');
  await D(page, () => window.LF_DEBUG.quality(2));
}

// ---------------------------------------------------------------- 1. title, hire, town
if (want('town')) {
  const { ctx, page } = await open();
  await shot(page, '01-title');
  check(await page.locator('h1.title').count() === 1, 'title screen is up');
  await page.click('[data-act="howto"]');
  await shot(page, '02-howto');
  await page.click('[data-act="back"]');
  await page.click('[data-act="new"]');
  await page.waitForSelector('[data-act="hire"]');
  await shot(page, '03-hire');
  await page.click('[data-act="hire"][data-i="0"]');
  await waitMode(page, 'town');
  await D(page, () => window.LF_DEBUG.quality(2));
  await waitSim(page, 0.6);
  await shot(page, '04-town');
  // walk east down the street
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  const t0 = await simT(page);
  await waitSim(page, t0 + 2.5);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const moved = await D(page, () => window.LF_DEBUG.state().player.x / 32);
  check(moved > 20, `walked down the street (x=${moved.toFixed(1)} m)`);
  await shot(page, '05-town-walk');
  // the general store counter
  await D(page, () => { window.LF_DEBUG.cash(600); window.LF_DEBUG.teleportTo('shop', 'store'); window.LF_DEBUG.face(-Math.PI / 2, 0.2); });
  const t1 = await simT(page);
  await waitSim(page, t1 + 0.4);
  await shot(page, '06-store-inside');
  await page.keyboard.press('KeyE');
  await page.waitForSelector('#panel .sheet.store', { timeout: 20000 });
  await shot(page, '07-store-panel');
  const before = await D(page, () => window.LF_DEBUG.app.campaign.character.bandages);
  await page.click('[data-p="buy"][data-id="bandage"]');
  const after = await D(page, () => window.LF_DEBUG.app.campaign.character.bandages);
  check(after === before + 1, 'bought a bandage at the counter');
  await page.click('[data-p="close"]');
  // gunsmith: buy the repeater
  await D(page, () => window.LF_DEBUG.open('gunsmith'));
  await page.waitForSelector('#panel .sheet.gunsmith');
  await page.click('[data-p="gun"][data-id="rifle"]');
  check(await D(page, () => window.LF_DEBUG.app.campaign.armory.guns.includes('rifle')), 'bought the repeater');
  await shot(page, '08-gunsmith-panel');
  await page.click('[data-p="close"]');
  // the marshal has the job
  await D(page, () => { window.LF_DEBUG.teleportTo('talk', 'marshal'); window.LF_DEBUG.face(-Math.PI / 2 - 0.5, 0.1); });
  const t2 = await simT(page);
  await waitSim(page, t2 + 0.4);
  await shot(page, '09-marshal');
  await page.keyboard.press('KeyE');
  await page.waitForSelector('#panel .sheet.talk', { timeout: 20000 });
  await shot(page, '10-talk-panel');
  await page.click('[data-p="pick"]');
  await page.waitForSelector('[data-p="ride"]');
  await shot(page, '11-briefing');
  await page.click('[data-p="ride"]');
  await waitMode(page, 'ride');
  await waitSim(page, 0.5);
  await shot(page, '12-ride-start');
  check(await D(page, () => window.LF_DEBUG.state().mode === 'ride'), 'riding chapter 1');

  // ---- fight the nearest enemy (park the mouse first: moving it turns the camera)
  await page.mouse.move(640, 360);
  await page.mouse.click(640, 360);
  await waitSim(page, (await simT(page)) + 0.3);
  await D(page, () => {
    const L = window.LF_DEBUG, s = L.state(), p = s.player;
    const sim = L.sim();
    const sorted = s.enemies.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    let e = sorted[0];
    p.maxHp = p.hp = 9999; // the drifter stands still here, so keep them alive
    // stand on open ground with a clear line to an enemy: try each enemy, a few distances, all round
    search: for (const cand of sorted) for (const dist of [200, 150, 260, 110]) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = cand.x + Math.cos(a) * dist, y = cand.y + Math.sin(a) * dist;
      let clear = true;
      for (let u = 0; u <= 12; u++) { const qx = x + (cand.x - x) * u / 12, qy = y + (cand.y - y) * u / 12; const ti = Math.floor(qy / 16) * sim.level.w + Math.floor(qx / 16); if (!sim.cache.nav[ti] || (sim.cache.flags[ti] & 6)) clear = false; }
      if (clear) { e = cand; p.x = x; p.y = y; L.face(a + Math.PI, 0.12); break search; }
    }
    window.__foe = e.id; window.__foeHp = e.hp;
    for (const o of s.enemies) if (o !== e) { o.x = 40; o.y = 40; }
  });
  const kills0 = await D(page, () => window.LF_DEBUG.state().kills);
  await page.mouse.down();
  const t3 = await simT(page);
  await waitSim(page, t3 + 0.7);
  await shot(page, '13-firefight');
  // keep the crosshair on the enemy: the camera sits 0.92 m to the right of the drifter
  for (let i = 1; i <= 10; i++) {
    await D(page, () => {
      const L = window.LF_DEBUG, s = L.state(), p = s.player, e = s.enemies.find((x) => x.id === window.__foe);
      if (!e || e.dead) return;
      const d = Math.hypot(e.x - p.x, e.y - p.y) / 32;
      L.face(Math.atan2(e.y - p.y, e.x - p.x) - Math.asin(Math.min(0.9, 0.92 / Math.max(1, d))), 0.12);
    });
    await waitSim(page, t3 + 0.7 + i * 0.5);
  }
  await page.mouse.up();
  const st = await D(page, () => { const s = window.LF_DEBUG.state(), f = s.enemies.find((e) => e.id === window.__foe); return { kills: s.kills, hp: s.player.hp, foe: f && !f.dead ? f.hp : 0, foe0: window.__foeHp }; });
  check(st.kills > kills0 || st.foe < st.foe0, `our shots land (kills ${st.kills}, foe ${st.foe0} -> ${st.foe})`);
  check(st.hp < 9999, `the enemy shoots back (hp ${st.hp})`);
  await shot(page, '14-after-fight');

  // ---- the objective, then the exit
  await D(page, () => { window.LF_DEBUG.peace(); window.LF_DEBUG.teleportTo('objective'); });
  await page.keyboard.down('KeyE');
  const t4 = await simT(page);
  await waitSim(page, t4 + 2.6);
  await page.keyboard.up('KeyE');
  check(await D(page, () => window.LF_DEBUG.state().carried.items.includes('strongbox')), 'picked up the strongbox');
  await shot(page, '15-objective');
  await D(page, () => window.LF_DEBUG.teleportTo('cache'));
  await page.keyboard.down('KeyE');
  const t5 = await simT(page);
  await waitSim(page, t5 + 1.2);
  await page.keyboard.up('KeyE');
  await shot(page, '16-cache');
  await D(page, () => { window.LF_DEBUG.teleportTo('exit', 'horse'); });
  const t6 = await simT(page);
  await waitSim(page, t6 + 0.3);
  await page.keyboard.press('KeyM');
  await shot(page, '17-map');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyE');
  await waitSim(page, t6 + 2.5);
  await shot(page, '18-extracting');
  await waitMode(page, 'menu', 240000);
  await page.waitForSelector('[data-act="results-done"]');
  await shot(page, '19-results');
  check(await D(page, () => window.LF_DEBUG.app.campaign.chapter === 1), 'chapter 1 settled');
  await page.click('[data-act="results-done"]');
  await waitMode(page, 'town');
  await waitSim(page, 0.4);
  await shot(page, '20-back-in-town');
  // pause and settings
  await page.keyboard.press('Escape');
  await page.waitForSelector('#panel .sheet.pause');
  await page.click('[data-p="open"][data-id="settings"]');
  await shot(page, '21-settings');
  await page.keyboard.press('Escape');
  await ctx.close();
}

// ---------------------------------------------------------------- 2. death, successor, resume after reload
if (want('death')) {
  const { ctx, page } = await open();
  await startCampaign(page);
  await D(page, () => window.LF_DEBUG.ride('story:shipment'));
  await waitMode(page, 'ride');
  await waitSim(page, 1);
  // reload mid-ride: the ride resumes from its snapshot
  const pos = await D(page, () => { const p = window.LF_DEBUG.state().player; p.x += 60; return { x: p.x, t: window.LF_DEBUG.state().t }; });
  await waitSim(page, pos.t + 4.6);
  await page.reload();
  await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
  await shot(page, '30-title-resume');
  await page.click('[data-act="continue"]');
  await waitMode(page, 'ride');
  const back = await D(page, () => window.LF_DEBUG.state().t);
  check(back >= pos.t + 3, `resumed the ride after a reload (t=${back.toFixed(1)})`);
  await D(page, () => window.LF_DEBUG.quality(2));
  // die
  await D(page, () => { const s = window.LF_DEBUG.state(); s.player.lastHitBy = { kind: 'gunman', name: 'a gunslinger' }; s.player.hp = 0; });
  await waitMode(page, 'menu', 240000);
  await page.waitForSelector('[data-act="results-done"]');
  await shot(page, '31-death');
  check(await D(page, () => window.LF_DEBUG.app.campaign.fallen.length === 1), 'the drifter is on Boot Hill');
  await page.click('[data-act="results-done"]');
  await page.waitForSelector('[data-act="hire"]');
  await shot(page, '32-successor');
  await page.click('[data-act="hire"][data-i="1"]');
  await waitMode(page, 'town');
  await D(page, () => { window.LF_DEBUG.quality(2); const p = window.LF_DEBUG.state().player; p.x = 96 * 32; p.y = 33 * 32; window.LF_DEBUG.face(-Math.PI / 2, 0.2); });
  await waitSim(page, 0.6);
  await shot(page, '33-boot-hill');
  await ctx.close();
}

// ---------------------------------------------------------------- 3. the other kinds of level
if (want('levels')) {
  const { ctx, page } = await open();
  await startCampaign(page);
  const tour = [
    ['story:relays', 3, '44-relays', 'near'],
    ['story:mine', 4, '40-mine', 'near'],
    ['story:hollow', 5, '41-hollow', 'near'],
    ['story:foundry', 6, '45-foundry', 'boss'],
    ['story:foreman', 7, '42-foreman', 'boss'],
    ['story:site9', 2, '43-site9', 'objective'],
  ];

  for (const [id, chapter, name, where] of tour) {
    await D(page, (n) => { const L = window.LF_DEBUG; L.chapter(n); L.app.campaign.armory.guns = ['rifle', 'shotgun', 'smg', 'longrifle', 'pulse', 'arc']; if (!L.app.campaign.investments.includes('deputy')) L.app.campaign.investments.push('deputy'); L.app.campaign.character.shells = 24; L.app.campaign.character.gear = ['lantern']; L.app.campaign.character.dynamite = 3; }, chapter);
    const ok = await D(page, (m) => window.LF_DEBUG.ride(m), id);
    check(ok, `started ${id}`);
    await waitMode(page, 'ride');
    await D(page, () => window.LF_DEBUG.quality(2));
    await waitSim(page, 0.8);
    await shot(page, `${name}-a`);
    await D(page, (w) => {
      const L = window.LF_DEBUG, s = L.state(), p = s.player; p.maxHp = p.hp = 99999; // staged fights must not end the ride
      let t;
      if (w === 'boss') t = s.enemies.find((e) => e.kind === 'foreman' || e.kind === 'overseer');
      else if (w === 'objective') t = s.interactables.find((i) => i.kind === 'objective');
      else t = s.enemies.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      const sim = L.sim();
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = t.x + Math.cos(a) * 250, y = t.y + Math.sin(a) * 250;
        const ti = Math.floor(y / 16) * sim.level.w + Math.floor(x / 16);
        if (sim.cache.nav[ti]) { p.x = x; p.y = y; L.face(a + Math.PI, 0.12); break; }
      }
    }, where);
    const t = await simT(page);
    await page.mouse.click(640, 360);
    await page.mouse.down();
    await waitSim(page, t + 2.2);
    await shot(page, `${name}-b`);
    await page.keyboard.press('KeyG');
    await waitSim(page, t + 4.2);
    await page.mouse.up();
    await shot(page, `${name}-c`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#panel .sheet.pause');
    await page.click('[data-p="giveup"]');
    await page.click('[data-p="giveup-yes"]');
    await waitMode(page, 'menu', 240000);
    await page.waitForSelector('[data-act="results-done"]');
    const dead = await D(page, () => window.LF_DEBUG.rules.needsSuccessor(window.LF_DEBUG.app.campaign));
    await page.click('[data-act="results-done"]');
    if (dead) { await page.waitForSelector('[data-act="hire"]'); await page.click('[data-act="hire"][data-i="0"]'); }
    await waitMode(page, 'town');
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 4. a phone
if (want('phone')) {
  const { ctx, page } = await open({ viewport: { width: 400, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await shot(page, '50-phone-title');
  await page.tap('[data-act="new"]');
  await page.waitForSelector('[data-act="hire"]');
  await shot(page, '51-phone-hire');
  await page.tap('[data-act="hire"][data-i="0"]');
  await waitMode(page, 'town');
  await D(page, () => window.LF_DEBUG.quality(2));
  await waitSim(page, 0.5);
  await page.touchscreen.tap(60, 600);
  await waitSim(page, 0.8);
  await shot(page, '52-phone-town');
  await D(page, () => window.LF_DEBUG.open('store'));
  await page.waitForSelector('#panel .sheet.store');
  await shot(page, '53-phone-store');
  await page.tap('[data-p="close"]');
  await D(page, () => window.LF_DEBUG.ride('story:shipment'));
  await waitMode(page, 'ride');
  await D(page, () => window.LF_DEBUG.quality(2));
  await waitSim(page, 0.8);
  await page.touchscreen.tap(60, 600);
  await waitSim(page, 1.2);
  await shot(page, '54-phone-ride');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal overflow on a phone');
  await ctx.close();
}

// ---------------------------------------------------------------- 5. controller, and the standalone page
if (want('pad')) {
  // a fake standard-mapping controller the test can drive
  const fakePad = () => {
    const pad = { id: 'Test Pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    window.__press = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; pad.timestamp++; };
    navigator.getGamepads = () => [pad, null, null, null];
  };
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(fakePad);
  // the standalone page wraps index.html for an ordinary browser tab
  await page.goto(`${base}/play.html?debug`);
  await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
  check(await page.locator('h1.title').count() === 1, 'play.html shows the title screen');
  await shot(page, '50-standalone-title');
  const frames = (n = 4) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const tap = async (i) => { await page.evaluate((b) => window.__press(b, true), i); await frames(2); await page.evaluate((b) => window.__press(b, false), i); await frames(2); }; // short, so slow test frames do not auto-repeat
  // menus: D-pad down focuses the first button, A presses it
  await tap(13);
  const focused = await page.evaluate(() => document.activeElement?.dataset?.act ?? null);
  check(focused === 'new', `the D-pad moves focus in menus (${focused})`);
  await tap(0);
  await page.waitForSelector('[data-act="hire"]');
  await tap(13); await tap(0);
  await waitMode(page, 'town');
  check(true, 'hired a drifter with the controller');
  await D(page, () => window.LF_DEBUG.quality(2));
  // walk with the left stick
  const x0 = await D(page, () => window.LF_DEBUG.state().player.x);
  const t0 = await simT(page);
  await page.evaluate(() => { window.__pad.axes[1] = -1; window.__pad.timestamp++; });
  await waitSim(page, t0 + 1.5);
  await page.evaluate(() => { window.__pad.axes[1] = 0; window.__pad.timestamp++; });
  const moved = await D(page, (x) => Math.abs(window.LF_DEBUG.state().player.x - x), x0);
  check(moved > 40, `the left stick walks (${moved.toFixed(0)} units)`);
  // look with the right stick
  const a0 = await D(page, () => window.LF_DEBUG.state().player.aim);
  await page.evaluate(() => { window.__pad.axes[2] = 1; window.__pad.timestamp++; });
  await waitSim(page, (await simT(page)) + 0.6);
  await page.evaluate(() => { window.__pad.axes[2] = 0; window.__pad.timestamp++; });
  const a1 = await D(page, () => window.LF_DEBUG.state().player.aim);
  check(Math.abs(a1 - a0) > 0.3, `the right stick turns (${(a1 - a0).toFixed(2)} rad)`);
  // fire with the right trigger
  await page.evaluate(() => window.__press(7, true));
  await waitSim(page, (await simT(page)) + 0.5);
  await page.evaluate(() => window.__press(7, false));
  const shot1 = await D(page, () => window.LF_DEBUG.state().player.shotT);
  check(shot1 > 0, 'the right trigger fires');
  await shot(page, '51-pad-town');
  // rebinding: open the menu with Menu, go to settings by mouse, bind Fire to RB (5) and fire with it
  await tap(9);
  await page.waitForSelector('#panel .sheet.pause');
  await page.click('[data-p="open"][data-id="settings"]');
  await page.click('[data-p="padbind"][data-id="fire"]');
  await tap(5);
  const name = await page.locator('[data-p="padbind"][data-id="fire"]').textContent();
  check(name.trim() === 'RB', `fire rebound in settings (${name.trim()})`);
  await shot(page, '52-pad-settings');
  await tap(1);                                  // B closes the panel
  await page.waitForFunction(() => !window.LF_DEBUG.ui.panel);
  const before = await D(page, () => window.LF_DEBUG.state().player.shotT);
  await frames(6);
  await page.evaluate(() => window.__press(5, true));
  await waitSim(page, (await simT(page)) + 0.5);
  await page.evaluate(() => window.__press(5, false));
  const after = await D(page, () => window.LF_DEBUG.state().player.shotT);
  check(after > before, 'the rebound button fires');
  await ctx.close();
}

await browser.close();
server.close();
const real = problems.filter((p) => !/Failed to load resource|fonts\.g|net::ERR/.test(p));
if (real.length) { console.log('PROBLEMS:'); for (const p of real.slice(0, 12)) console.log('  ', p); }
console.log(failed || real.length ? `FAILED (${failed} checks, ${real.length} errors)` : 'SMOKE OK');
process.exit(failed || real.length ? 1 : 0);
