import {chromium, type BrowserContext, type Page} from 'playwright';
import {ensureDir, paths} from '../core/paths';

/**
 * أساس الجمع عبر المتصفح: جلسة دائمة لكل منصة (§5.1) + إيقاع بشري (§5.2) + كشف التحديات.
 * قاعدة لا تُكسر: لا تجاوز لأي حماية. عند صفحة تسجيل دخول أو تحقق أو كابتشا نتوقف
 * ونخبر المستخدم ليحلّها يدوياً في النافذة الظاهرة.
 */

export type SessionPlatform = 'instagram' | 'facebook';

export type BlockReason = 'login_required' | 'challenge' | 'rate_limited' | 'not_found' | 'network_blocked';

/** توقّف الجمع لسبب يحتاج تدخّل المستخدم. الرسالة عربية وتُعرض كما هي في الواجهة. */
export class CollectorBlocked extends Error {
  constructor(
    readonly reason: BlockReason,
    message: string,
    readonly url?: string,
  ) {
    super(message);
    this.name = 'CollectorBlocked';
  }
}

export interface SessionOptions {
  /** نافذة ظاهرة (لتسجيل الدخول اليدوي وحلّ التحديات) أو خفية (للجمع). */
  headed?: boolean;
  locale?: string;
  timezoneId?: string;
}

/**
 * إن كان الجهاز خلف وسيط (HTTPS_PROXY)، المتصفح لا يقرؤه من البيئة تلقائياً — نمرّره صراحةً.
 * على لابتوب عادي بلا وسيط تعيد undefined ولا يتغير شيء.
 */
export function proxyFromEnv(env: NodeJS.ProcessEnv = process.env): {server: string; bypass?: string} | undefined {
  const server = env.HTTPS_PROXY ?? env.https_proxy;
  if (!server) return undefined;
  const bypass = env.NO_PROXY ?? env.no_proxy;
  return bypass ? {server, bypass} : {server};
}

/**
 * يفتح سياق متصفح دائماً محفوظاً محلياً تحت data/sessions/<platform>.
 * الكوكيز تبقى على الجهاز فقط. (التشفير عند التخزين يُدرس في Phase 1.)
 */
export async function openSession(platform: SessionPlatform, options: SessionOptions = {}): Promise<BrowserContext> {
  const dir = ensureDir(paths.sessions(platform));
  return chromium.launchPersistentContext(dir, {
    headless: !options.headed,
    proxy: proxyFromEnv(),
    viewport: {width: 1280, height: 900},
    locale: options.locale ?? 'en-US',
    timezoneId: options.timezoneId,
  });
}

// ── الإيقاع البشري ───────────────────────────────────────────────────────────
export interface Pacing {
  /** أقل وأكثر انتظار بين خطوتين (ميلي ثانية). */
  minDelayMs: number;
  maxDelayMs: number;
  /** أقصى عدد مرات تمرير في الصفحة الواحدة. */
  maxScrolls: number;
}

/** افتراضي محافظ؛ يصبح قابلاً للضبط من الإعدادات في Phase 1 مع سقوف يومية. */
export const DEFAULT_PACING: Pacing = {minDelayMs: 1800, maxDelayMs: 4200, maxScrolls: 6};

export function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

export async function humanPause(page: Page, pacing: Pacing = DEFAULT_PACING): Promise<void> {
  await page.waitForTimeout(randomBetween(pacing.minDelayMs, pacing.maxDelayMs));
}

/** تمرير على دفعات غير منتظمة كما يفعل إنسان يتصفّح. */
export async function humanScroll(page: Page, pacing: Pacing = DEFAULT_PACING): Promise<void> {
  const steps = randomBetween(2, 5);
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, randomBetween(350, 900));
    await page.waitForTimeout(randomBetween(250, 800));
  }
  await humanPause(page, pacing);
}

// ── كشف التحديات ─────────────────────────────────────────────────────────────
const CHALLENGE_URL = /\/(challenge|checkpoint|accounts\/suspended|accounts\/disabled|two_factor)\b/i;
const LOGIN_URL = /\/(accounts\/login|login(\.php)?|login\/device-based)\b/i;

/** يصنّف عنوان الصفحة الحالي. دالة نقية تُختبر بلا متصفح. */
export function classifyUrl(url: string): BlockReason | null {
  if (CHALLENGE_URL.test(url)) return 'challenge';
  if (LOGIN_URL.test(url)) return 'login_required';
  return null;
}

const MESSAGES: Record<SessionPlatform, Record<'login_required' | 'challenge', string>> = {
  instagram: {
    login_required:
      'إنستغرام طلب تسجيل الدخول. افتح «حسابات الدخول» وسجّل دخول الحساب المخصص للجمع، ثم أعد المحاولة.',
    challenge:
      'إنستغرام عرض صفحة تحقق أمني. توقّف الجمع — افتح نافذة الجلسة وأكمل التحقق يدوياً، ثم أعد المحاولة.',
  },
  facebook: {
    login_required: 'فيسبوك طلب تسجيل الدخول لعرض هذه الصفحة. سجّل الدخول من «حسابات الدخول» ثم أعد المحاولة.',
    challenge: 'فيسبوك عرض صفحة تحقق أمني. توقّف الجمع — أكمل التحقق يدوياً في نافذة الجلسة ثم أعد المحاولة.',
  },
};

/** يتوقف برسالة واضحة إن كانت الصفحة تسجيل دخول أو تحققاً. لا يحاول تجاوزها أبداً. */
export async function assertNotBlocked(page: Page, platform: SessionPlatform): Promise<void> {
  const url = page.url();
  let reason = classifyUrl(url);
  if (!reason) {
    // نموذج دخول داخل الصفحة نفسها (بلا إعادة توجيه) أو كابتشا.
    const hasCaptcha = (await page.locator('iframe[src*="captcha"], iframe[src*="recaptcha"], [id*="captcha" i]').count()) > 0;
    if (hasCaptcha) reason = 'challenge';
  }
  if (reason === 'login_required' || reason === 'challenge') {
    throw new CollectorBlocked(reason, MESSAGES[platform][reason], url);
  }
}

/** يحوّل أخطاء الشبكة الخام (حجب، انقطاع) إلى رسالة عربية مفهومة. */
export function describeNavigationError(error: unknown, host: string): CollectorBlocked {
  const text = error instanceof Error ? error.message : String(error);
  if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE/i.test(text)) {
    return new CollectorBlocked(
      'network_blocked',
      `تعذّر الوصول إلى ${host} من هذا الجهاز (الشبكة تحجبه أو لا يوجد اتصال). تأكد من الإنترنت ثم أعد المحاولة.`,
    );
  }
  return new CollectorBlocked('network_blocked', `تعذّر فتح ${host}: ${text.split('\n')[0]}`);
}
