// Developer tool — quick screenshot of a page: node scripts/shot.mjs <path> <out.png> [dark] [width] [fullPage]
import {chromium} from 'playwright';
const [, , path = '/', out = 'out.png', scheme = 'light', width = '1280', full = 'full'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: Number(width), height: 860}, colorScheme: scheme === 'dark' ? 'dark' : 'light'});
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto('http://127.0.0.1:5173' + path, {waitUntil: 'networkidle'});
await page.waitForTimeout(600);
await page.screenshot({path: out, fullPage: full === 'full'});
console.log(JSON.stringify({title: await page.title(), dir: await page.evaluate(() => document.documentElement.dir), font: await page.evaluate(() => getComputedStyle(document.body).fontFamily), fontsLoaded: await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).filter((v,i,a)=>a.indexOf(v)===i)), errors}, null, 1));
await browser.close();
