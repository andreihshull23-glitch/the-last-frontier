// Screenshots of shots in flight for each gun: node tests/bolts.mjs <three.min.js> <outDir>
import path from 'node:path';
import { serve, launch } from './harness.mjs';
const [,, three, out] = process.argv;
const { server, base } = await serve();
const { browser, newPage } = await launch(three);
const { page } = await newPage({ viewport: { width: 1000, height: 600 } });
await page.goto(`${base}/?debug`);
await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
await page.click('[data-act="new"]');
await page.waitForSelector('.crawl-text');
await page.keyboard.press('Space');
await page.waitForSelector('[data-act="hire"]');
await page.click('[data-act="hire"][data-i="0"]');
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'town');
await page.evaluate(() => window.LF_DEBUG.ride('story:shipment'));
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'ride', null, { timeout: 120000 });
await page.evaluate(() => { const L = window.LF_DEBUG; L.quality(2); const s = L.state(); s.player.hp = s.player.maxHp = 99999; for (const e of s.enemies) { e.x = 40; e.y = 40; } });
for (const gun of ['revolver', 'rifle', 'shotgun', 'smg', 'pulse', 'rail']) {
  await page.evaluate((g) => {
    const L = window.LF_DEBUG, sim = L.sim(), s = L.state();
    if (!s.player.mags[g]) { s.player.mags[g] = 30; }
    s.player.gun = g; s.player.ammo.cartridges = 99; s.player.ammo.shells = 99;
    L.face(0, 0.05);
  }, gun);
  const t0 = await page.evaluate(() => window.LF_DEBUG.state().t);
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.waitForFunction((t) => window.LF_DEBUG.state().t > t + 0.35 && window.LF_DEBUG.state().bullets.length > 1, t0, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: path.join(out, `bolt-${gun}.png`) });
  await page.mouse.up();
}
console.log('done');
await browser.close(); server.close();
