// Plays the three floors of the Descent in headless Chromium and writes screenshots:
//   node tests/descent.mjs <three.min.js> <outDir>
import { serve, launch } from './harness.mjs';

const [, , three, out] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 500)));
await page.goto(`${base}/?debug`);
await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
await page.click('[data-act="new"]');
await page.waitForSelector('[data-act="hire"]');
await page.click('[data-act="hire"][data-i="0"]');
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'town');
const ok = await page.evaluate(() => { const L = window.LF_DEBUG; L.quality(2); L.chapter(1); return L.ride('descent:descent'); });
console.log('started', ok);
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'ride');
const wait = async (dt) => {
  const t = await page.evaluate((d) => window.LF_DEBUG.state().t + d, dt);
  await page.waitForFunction((tt) => window.LF_DEBUG.state().t >= tt, t, { timeout: 240000 });
};
for (let floor = 1; floor <= 3; floor++) {
  await wait(0.6);
  await page.screenshot({ path: `${out}/d${floor}-a-start.png` });
  // walk into a fight
  await page.evaluate(() => {
    const L = window.LF_DEBUG, s = L.state(), lv = L.sim().level;
    const r = lv.rooms.find((q) => q.role === 'combat');
    s.player.maxHp = s.player.hp = 99999;
    s.player.x = (r.x0 + r.x1) / 2; s.player.y = r.y1 - 90;
    L.face(-Math.PI / 2, 0.14);
  });
  await wait(1.6);
  await page.screenshot({ path: `${out}/d${floor}-b-shoulder.png` });
  await page.keyboard.press('KeyV');
  await wait(1.2);
  await page.screenshot({ path: `${out}/d${floor}-c-high.png` });
  await page.keyboard.press('KeyV');
  const info = await page.evaluate(() => {
    const L = window.LF_DEBUG, s = L.state();
    return { floor: s.floor, rooms: s.rooms.map((r) => r.state).join(','), enemies: s.enemies.filter((e) => !e.dead).length, bullets: s.bullets.length, name: L.sim().level.name };
  });
  console.log(JSON.stringify(info));
  // the shop, then down the lift
  await page.evaluate(() => {
    const L = window.LF_DEBUG, s = L.state(), lv = L.sim().level;
    for (const e of s.enemies) e.dead = true;
    const r = lv.rooms.find((q) => q.role === 'shop');
    s.player.x = (r.x0 + r.x1) / 2; s.player.y = (r.y0 + r.y1) / 2 + 80;
    s.coin = 200;
    L.face(-Math.PI / 2, 0.2);
  });
  await wait(0.8);
  await page.screenshot({ path: `${out}/d${floor}-d-shop.png` });
  await page.evaluate(() => {
    const s = window.LF_DEBUG.state();
    s.targetKilled = true;
    const lift = s.interactables.find((i) => i.kind === 'exit');
    s.player.x = lift.x; s.player.y = lift.y;
  });
  await wait(0.3);
  await page.keyboard.press('KeyE');
  if (floor < 3) await page.waitForFunction((f) => window.LF_DEBUG.app.mode === 'ride' && window.LF_DEBUG.state().floor === f + 1, floor, { timeout: 240000 });
  else {
    await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'menu', null, { timeout: 240000 });
    await page.screenshot({ path: `${out}/d4-results.png` });
  }
}
const real = problems.filter((p) => !/Failed to load|fonts|net::/.test(p));
console.log('errors', errs.length ? errs.slice(0, 3).join('\n') : 'none');
if (real.length) console.log(real.slice(0, 4).join('\n'));
await browser.close();
server.close();
process.exit(errs.length || real.length ? 1 : 0);
