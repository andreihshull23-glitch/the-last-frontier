// High-quality screenshots of the main places, for judging art changes:
//   node tests/looks.mjs <three.min.js> <outDir> [quality 0|1]
import path from 'node:path';
import { serve, launch } from './harness.mjs';
const [,, three, out, q = '1'] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: 1280, height: 720 } });
const D = (fn, arg) => page.evaluate(fn, arg);
const simT = () => D(() => window.LF_DEBUG.state()?.t ?? 0);
const wait = async (s) => { const t = await simT(); await page.waitForFunction((x) => (window.LF_DEBUG.state()?.t ?? 0) > x, t + s, { timeout: 240000 }); };
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
await page.goto(`${base}/?debug`);
await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
await page.click('[data-act="new"]');
await page.waitForSelector('.crawl-text');
await page.keyboard.press('Space');
await page.waitForSelector('[data-act="hire"]');
await page.click('[data-act="hire"][data-i="0"]');
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'town');
await D((qq) => window.LF_DEBUG.quality(qq), +q);
// the deck: down the concourse, then into the Low Tide
await D(() => { const p = window.LF_DEBUG.state().player; p.x = 14 * 32; p.y = 30 * 32; window.LF_DEBUG.face(0, 0.12); });
await wait(0.6); await shot('look-deck-1');
await D(() => { const p = window.LF_DEBUG.state().player; p.x = 52 * 32; p.y = 31 * 32; window.LF_DEBUG.face(-2.4, 0.08); });
await wait(0.6); await shot('look-deck-2');
// a district
await D(() => window.LF_DEBUG.ride('story:shipment'));
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'ride', null, { timeout: 120000 });
await D((qq) => { const L = window.LF_DEBUG; L.quality(qq); const s = L.state(); s.player.hp = s.player.maxHp = 99999; }, +q);
await wait(1.0); await shot('look-district-1');
await D(() => window.LF_DEBUG.face(Math.PI, 0.1));
await wait(0.5); await shot('look-district-2');
console.log(problems.length ? problems.slice(0, 5).join('\n') : 'ok');
await browser.close(); server.close();
