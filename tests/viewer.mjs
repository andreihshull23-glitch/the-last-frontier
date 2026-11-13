// Renders a contact sheet of baked models: node tests/viewer.mjs <out.png> <three.min.js> "<query>" [w] [h]
import { serve, launch } from './harness.mjs';
const [,, out, three, query = 'm=cave/*', w = '1500', h = '950'] = process.argv;
const { server, base } = await serve();
const { browser, newPage, problems } = await launch(three);
const { page } = await newPage({ viewport: { width: +w, height: +h } });
await page.goto(`${base}/tests/viewer.html?${query}`);
await page.waitForFunction('window.READY === true', null, { timeout: 90000 }).catch((e) => problems.push(String(e).slice(0, 200)));
const err = await page.evaluate('window.ERR || null'); if (err) console.log('PAGE ERROR:', err);
await page.screenshot({ path: out });
if (problems.length) console.log(problems.join('\n'));
await browser.close(); server.close();
