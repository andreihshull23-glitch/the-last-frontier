// Renders each piece of music offline and prints its loudness: node tests/music.mjs <three.min.js>
import { serve, launch } from './harness.mjs';
const [,, three] = process.argv;
const { server, base } = await serve();
const { browser, newPage } = await launch(three);
const { page } = await newPage({ viewport: { width: 200, height: 200 } });
await page.goto(`${base}/tests/music.html`);
await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
console.log(JSON.stringify(await page.evaluate('window.OUT'), null, 1));
await browser.close(); server.close();
