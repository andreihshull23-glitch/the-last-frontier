// node tests/actorview.mjs <out.png> <three.min.js> "<query>" [w] [h]
import { serve, launch } from './harness.mjs';
const [,, out, three, query = '', w = '1500', h = '800'] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: +w, height: +h } });
await page.goto(`${base}/tests/actorview.html?${query}`);
await page.waitForFunction('window.READY === true', null, { timeout: 100000 }).catch((e) => problems.push(String(e).slice(0, 200)));
const err = await page.evaluate('window.ERR || null'); if (err) console.log('PAGE ERROR:', err);
await page.screenshot({ path: out });
if (problems.length) console.log(problems.slice(0, 5).join('\n'));
await browser.close(); server.close();
