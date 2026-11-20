// Screenshots of hits, kills and Rook taking damage, for judging blood, oil and sparks:
//   node tests/gore.mjs <three.min.js> <outDir>
import path from 'node:path';
import { serve, launch } from './harness.mjs';
const [,, three, out] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: 1100, height: 640 } });
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
const simT = () => page.evaluate(() => window.LF_DEBUG.state().t);
const wait = async (sec) => { const t = await simT(); await page.waitForFunction((x) => window.LF_DEBUG.state().t > x, t + sec, { timeout: 240000 }); };
await page.evaluate(() => {
  const L = window.LF_DEBUG, s = L.state(), p = s.player;
  L.quality(1);
  p.hp = p.maxHp = 99999;
  L.face(0, 0.06);
  const a = p.aim;
  // a person and a machine a few metres ahead, one to each side; everyone else far away
  const live = s.enemies.filter((e) => !e.dead);
  const human = live.find((e) => !['scout', 'guard', 'enforcer', 'crusher', 'turret'].includes(e.kind));
  const robot = live.find((e) => ['scout', 'guard', 'enforcer'].includes(e.kind));
  for (const e of live) if (e !== human && e !== robot) { e.x = 40; e.y = 40; }
  for (const [e, side] of [[human, 1], [robot, -1]]) {
    if (!e) continue;
    e.x = p.x + Math.cos(a) * 150 - Math.sin(a) * 26 * side; e.y = p.y + Math.sin(a) * 150 + Math.cos(a) * 26 * side;
    e.hp = e.maxHp = 260; e.state = 'engage';
  }
  p.mags.revolver = 99; p.ammo.cartridges = 999;
});
await page.mouse.move(550, 320);
await page.mouse.down();
await wait(0.9);
await page.screenshot({ path: path.join(out, 'gore-1-hits.png') });
await wait(2.2);
await page.mouse.up();
await wait(0.6);
await page.screenshot({ path: path.join(out, 'gore-2-kills.png') });
await page.evaluate(() => { const L = window.LF_DEBUG; L.face(Math.PI, 0.3); });
await wait(0.5);
await page.screenshot({ path: path.join(out, 'gore-3-rook.png') });
console.log(problems.length ? problems.slice(0, 5).join('\n') : 'ok');
await browser.close(); server.close();
