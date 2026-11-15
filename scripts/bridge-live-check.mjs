// أداة للمطوّر — تحقق حيّ من دورة الجسر: تفتح صفحة الدراسة ثم تكتب عبر CLI
// وتقيس كم يستغرق ظهور كل تغيير في الواجهة **بلا إعادة تحميل** (SSE).
//   node scripts/bridge-live-check.mjs <studyId> <findings.json> [more.json…] [--shot out.png]
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';

const args = process.argv.slice(2);
const shotAt = args.indexOf('--shot');
const shot = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const [id, ...files] = args;
const BASE = process.env.RASD_WEB ?? 'http://127.0.0.1:5173';
const rasd = (...a) => JSON.parse(execFileSync('node', ['bin/rasd.mjs', ...a], {encoding: 'utf8'}));

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
await page.goto(`${BASE}/studies/${id}`, {waitUntil: 'networkidle'});
await page.waitForTimeout(800); // وقت لفتح اتصال SSE
// علامة في الذاكرة: أي إعادة تحميل للصفحة تمسحها — هكذا نثبت أن التحديث جاء عبر SSE.
await page.evaluate(() => { window.__rasdMarker = 'kept'; });
const cards = () => page.locator('[data-testid="finding-card"]').count();
const steps = [];
const timed = async (name, action, until) => {
  const t0 = Date.now();
  const result = action();
  await until();
  steps.push({step: name, uiLatencyMs: Date.now() - t0, cli: result});
};

steps.push({step: 'initial', findingsInUi: await cards(), commandVisible: await page.getByText(`/rasd-analyze ${id}`).count() > 0});

await timed('status → analyzing', () => rasd('study', 'status', id, 'analyzing').status,
  () => page.getByText('جلسة Claude بتحلّل الآن').waitFor({timeout: 5000}));

let expected = 0;
for (const file of files) {
  const before = await cards();
  await timed(`finding add ${file.split('/').pop()}`, () => {
    const r = rasd('finding', 'add', id, '--file', file);
    expected = before + r.saved.filter(s => s.action === 'created').length;
    return {saved: r.saved.length, rejected: r.rejected.length};
  }, () => page.waitForFunction(n => document.querySelectorAll('[data-testid="finding-card"]').length >= n, expected, {timeout: 5000}));
}

await timed('status → done', () => rasd('study', 'status', id, 'done').status,
  () => page.getByText('مكتمل').first().waitFor({timeout: 5000}));

const result = {
  studyId: Number(id),
  steps,
  findingsInUi: await cards(),
  thumbnails: await page.locator('img').count(),
  brokenImages: await page.evaluate(() => [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length),
  pageReloaded: (await page.evaluate(() => window.__rasdMarker)) !== 'kept',
};
if (shot) {
  // المحتوى يتمرّر داخل AppShell؛ نكبّر النافذة لنلتقط الصفحة كاملة.
  await page.setViewportSize({width: 1280, height: 3400});
  await page.waitForTimeout(500);
  await page.screenshot({path: shot});
}
await browser.close();
console.log(JSON.stringify(result, null, 2));
