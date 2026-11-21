// A trip down the first stratum in the browser: the lift board, the doors, a floor, the next stop, back up.
//   node tests/route.mjs <three.min.js> <outDir>
import path from 'node:path';
import { serve, launch } from './harness.mjs';
const [,, three, out] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: 1280, height: 720 } });
const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
const D = (fn, a) => page.evaluate(fn, a);
const check = (ok, what) => { console.log((ok ? '· ok ' : '· FAIL ') + what); if (!ok) process.exitCode = 1; };
await page.goto(`${base}/?debug`);
await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
await page.click('[data-act="new"]');
await page.waitForSelector('.crawl-text');
await page.keyboard.press('Space');
await page.waitForSelector('[data-act="hire"]');
await page.click('[data-act="hire"][data-i="0"]');
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'town');
// the lift board
await D(() => { const s = window.LF_DEBUG.state(); const lift = s.interactables.find((i) => i.kind === 'ride'); s.player.x = lift.x; s.player.y = lift.y; });
await page.keyboard.press('KeyE');
await page.waitForSelector('.strata', { timeout: 30000 });
await shot('route-1-board');
await page.click('[data-p="route"][data-id="0"]');
await page.waitForSelector('.doors');
await shot('route-2-doors');
check(await D(() => document.querySelectorAll('.door').length >= 2), 'a choice of doors');
// take the story door, finish the floor, reach the lift
await page.click('.door-story');
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'ride' && window.LF_DEBUG.state()?.config.route, null, { timeout: 120000 });
await D(() => {
  const s = window.LF_DEBUG.state(), p = s.player;
  s.carried.items.push('strongbox');
  for (const e of s.enemies) { e.x = 40; e.y = 40; }
  p.hp = p.maxHp = 99999;
  const exit = s.interactables.find((i) => i.kind === 'exit'); p.x = exit.x; p.y = exit.y;
});
await page.keyboard.press('KeyE');
await page.waitForSelector('.doors', { timeout: 120000 });
await shot('route-3-next-stop');
check(await D(() => Boolean(document.querySelector('[data-act="goup"]'))), 'the way back up is offered');
await page.click('[data-act="goup"]');
await page.waitForSelector('[data-act="results-done"]', { timeout: 120000 });
await shot('route-4-results');
check(await D(() => window.LF_DEBUG.app.campaign.chapter === 1), 'chapter one counted');
console.log(problems.length ? problems.slice(0, 5).join('\n') : 'no page errors');
await browser.close(); server.close();
