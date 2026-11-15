// Developer tool — captures the RTL check screenshots documented in docs/rtl.md.
// Run (with the app running on 5173):  node scripts/rtl-screenshots.mjs [outDir]
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const out = process.argv[2] ?? 'docs/rtl';
mkdirSync(out, {recursive: true});
const BASE = process.env.RASD_WEB ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const report = {};

async function open(path, opts = {}) {
  const page = await browser.newPage({
    viewport: {width: opts.width ?? 1280, height: opts.height ?? 900},
    colorScheme: opts.dark ? 'dark' : 'light',
    deviceScaleFactor: opts.scale ?? 1,
  });
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page;
}

// 1) Each section of the check page on its own
{
  const page = await open('/dev/rtl');
  for (const id of ['inputs', 'menus', 'icons', 'tabs', 'table', 'progress', 'mixed', 'calendar']) {
    await page.locator(`[data-testid="rtl-${id}"]`).screenshot({path: join(out, `${id}.png`)});
  }
  // Objective measurements instead of relying on the eye alone
  report.html = await page.evaluate(() => ({dir: document.documentElement.dir, lang: document.documentElement.lang}));
  report.sideNavSide = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    const r = nav?.getBoundingClientRect();
    return r ? (r.left > window.innerWidth / 2 ? 'right' : 'left') : null;
  });
  report.inputAlign = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="rtl-inputs"] input');
    const cs = getComputedStyle(input);
    return {direction: cs.direction, textAlign: cs.textAlign};
  });
  report.urlInput = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="rtl-inputs"] input[type="url"]');
    const cs = getComputedStyle(input);
    return {direction: cs.direction, textAlign: cs.textAlign, dirAttr: input.getAttribute('dir')};
  });
  report.chevrons = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="rtl-icons"] svg')].slice(0, 6).map(svg => {
      let el = svg, flipped = false;
      for (let i = 0; i < 4 && el; i++, el = el.parentElement) {
        const t = getComputedStyle(el).transform;
        if (t && t !== 'none' && t.startsWith('matrix(-1')) flipped = true;
      }
      return flipped;
    }),
  );
  report.tableFirstColumnSide = await page.evaluate(() => {
    const th = document.querySelector('[data-testid="rtl-table"] th');
    const table = document.querySelector('[data-testid="rtl-table"] table');
    const a = th.getBoundingClientRect(), b = table.getBoundingClientRect();
    return Math.abs(a.right - b.right) < Math.abs(a.left - b.left) ? 'right' : 'left';
  });
  report.digits = await page.evaluate(() => {
    const text = document.querySelector('[data-testid="rtl-calendar"]').innerText + document.querySelector('[data-testid="rtl-icons"]').innerText;
    return {arabicIndic: /[٠-٩]/.test(text), western: /[0-9]/.test(text)};
  });

  // Dropdown menu
  await page.locator('[data-testid="rtl-menus"] button', {hasText: 'خيارات'}).click();
  await page.waitForTimeout(350);
  await page.screenshot({path: join(out, 'menu-open.png'), clip: {x: 0, y: 0, width: 1280, height: 900}});
  await page.keyboard.press('Escape');

  // Selector list
  await page.locator('[data-testid="rtl-inputs"]').getByRole('combobox').first().click().catch(() => {});
  await page.waitForTimeout(350);
  await page.screenshot({path: join(out, 'selector-open.png')});
  await page.keyboard.press('Escape');
  await page.close();
}

// 2) Popup overlays
for (const kind of ['dialog', 'drawer']) {
  const page = await open(`/dev/rtl?open=${kind}`);
  await page.waitForTimeout(500);
  await page.screenshot({path: join(out, `${kind}.png`)});
  if (kind === 'drawer') {
    report.drawerSide = await page.evaluate(() => {
      const el = document.querySelector('dialog[open], [role="dialog"]');
      const r = el?.getBoundingClientRect();
      return r ? {left: Math.round(r.left), right: Math.round(r.right), viewport: window.innerWidth} : null;
    });
  }
  await page.close();
}

// 3) Full page: light, dark, collapsed nav, mobile
{
  const page = await open('/dev/rtl');
  await page.screenshot({path: join(out, 'page-light.png'), fullPage: true});
  await page.close();
}
{
  const page = await open('/dev/rtl', {dark: true});
  await page.screenshot({path: join(out, 'page-dark.png')});
  await page.close();
}
{
  const page = await open('/');
  const toggle = page.locator('nav button').last();
  await page.locator('nav').screenshot({path: join(out, 'sidenav-expanded.png')});
  await toggle.click();
  await page.waitForTimeout(500);
  await page.screenshot({path: join(out, 'sidenav-collapsed.png')});
  await page.close();
}
{
  const page = await open('/', {width: 390, height: 780});
  await page.screenshot({path: join(out, 'mobile-home.png')});
  const menu = page.getByRole('button').first();
  await menu.click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({path: join(out, 'mobile-nav.png')});
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
