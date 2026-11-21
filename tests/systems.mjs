// Screenshots of the run's new systems: the meters, WARDEN's read, a tower system, the Override bracket,
// a hacked machine, an overclock, and the cargo screen. node tests/systems.mjs <three.min.js> <outDir>
import path from 'node:path';
import { serve, launch } from './harness.mjs';
const [,, three, out] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: 1280, height: 720 } });
const D = (fn, arg) => page.evaluate(fn, arg);
const wait = async (sec) => { const t = await D(() => window.LF_DEBUG.state().t); await page.waitForFunction((x) => window.LF_DEBUG.state().t > x, t + sec, { timeout: 240000 }); };
await page.goto(`${base}/?debug`);
await page.waitForFunction(() => window.LF_DEBUG && window.LF_DEBUG.app.mode === 'title', null, { timeout: 120000 });
await page.click('[data-act="new"]');
await page.waitForSelector('.crawl-text');
await page.keyboard.press('Space');
await page.waitForSelector('[data-act="hire"]');
await page.click('[data-act="hire"][data-i="0"]');
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'town');
await D(() => window.LF_DEBUG.ride('story:shipment'));
await page.waitForFunction(() => window.LF_DEBUG.app.mode === 'ride', null, { timeout: 120000 });
await D(() => {
  const L = window.LF_DEBUG, s = L.state(), p = s.player;
  L.quality(1);
  p.hp = p.maxHp = 99999; p.hack = 85;
  s.warden.level = 2; s.warden.focus = 'close';
  for (let i = 0; i < 7; i++) s.carried.loot.push({ name: `Corporate find ${i}`, value: 10 + i * 9, bulk: i % 3 + 1 });
  // a machine and a generator in front of Rook
  L.face(0, 0.08);
  const a = p.aim;
  const live = s.enemies.filter((e) => !e.dead);
  const robot = live.find((e) => ['scout', 'guard', 'enforcer'].includes(e.kind)) || live[0];
  for (const e of live) if (e !== robot) { e.x = 40; e.y = 40; }
  robot.x = p.x + Math.cos(a) * 170; robot.y = p.y + Math.sin(a) * 170; robot.hp = robot.maxHp = 400; robot.state = 'idle';
  const gen = s.interactables.find((i) => i.kind === 'infra' && i.sys !== 'chute');
  if (gen) { gen.x = p.x + Math.cos(a + 0.6) * 140; gen.y = p.y + Math.sin(a + 0.6) * 140; gen.seen = gen.known = true; }
});
await wait(0.6);
await page.screenshot({ path: path.join(out, 'sys-1-hud.png') });
await page.keyboard.press('KeyT');
await wait(0.8);
await page.screenshot({ path: path.join(out, 'sys-2-hacked.png') });
await page.keyboard.press('KeyZ');
await wait(0.5);
await page.screenshot({ path: path.join(out, 'sys-3-overclock.png') });
await D(() => { const p = window.LF_DEBUG.state().player; p.oc = 0.05; });
await wait(0.5);
await page.screenshot({ path: path.join(out, 'sys-4-crash.png') });
// extract with too much: the cargo screen
await D(() => {
  const s = window.LF_DEBUG.state(), p = s.player;
  for (let i = 0; i < 6; i++) s.carried.loot.push({ name: `Server blade ${i}`, value: 45, bulk: 3 });
  const exit = s.interactables.find((i) => i.kind === 'exit');
  for (const e of s.enemies) { e.x = 40; e.y = 40; }
  p.x = exit.x; p.y = exit.y;
});
await page.keyboard.press('KeyE');
await page.waitForSelector('.cargo-list', { timeout: 120000 });
await page.screenshot({ path: path.join(out, 'sys-5-cargo.png') });
await page.click('[data-act="cargo-done"]');
await page.waitForSelector('[data-act="results-done"]', { timeout: 60000 });
await page.screenshot({ path: path.join(out, 'sys-6-results.png') });
console.log(problems.length ? problems.slice(0, 5).join('\n') : 'ok');
await browser.close(); server.close();
