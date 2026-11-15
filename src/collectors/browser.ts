import {chromium, type BrowserContext, type Page} from 'playwright';
import {ensureDir, paths} from '../core/paths';

/**
 * Foundation for browser-based collection: a persistent session per platform (§5.1) + human pacing (§5.2)
 * + challenge detection. A rule that is never broken: no bypassing of any protection. On a login, verification
 * or captcha page we stop and tell the user to solve it manually in the visible window.
 */

export type SessionPlatform = 'instagram' | 'facebook';

export type BlockReason = 'login_required' | 'challenge' | 'rate_limited' | 'not_found' | 'network_blocked';

/** Collection stopped for a reason that needs the user to step in. The message is Arabic and is shown as-is in the UI. */
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
  /** A visible window (for manual login and solving challenges) or a hidden one (for collection). */
  headed?: boolean;
  locale?: string;
  timezoneId?: string;
}

/**
 * If the machine is behind a proxy (HTTPS_PROXY), the browser does not pick it up from the environment
 * on its own — we pass it explicitly. On an ordinary laptop with no proxy it returns undefined and nothing changes.
 */
export function proxyFromEnv(env: NodeJS.ProcessEnv = process.env): {server: string; bypass?: string} | undefined {
  const server = env.HTTPS_PROXY ?? env.https_proxy;
  if (!server) return undefined;
  const bypass = env.NO_PROXY ?? env.no_proxy;
  return bypass ? {server, bypass} : {server};
}

/**
 * Opens a persistent browser context stored locally under data/sessions/<platform>.
 * Cookies stay on this machine only. (Encryption at rest is to be looked into in Phase 1.)
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

// ── Human pacing ─────────────────────────────────────────────────────────────
export interface Pacing {
  /** Minimum and maximum wait between two steps (milliseconds). */
  minDelayMs: number;
  maxDelayMs: number;
  /** Maximum number of scrolls on a single page. */
  maxScrolls: number;
}

/** A conservative default; becomes adjustable from Settings in Phase 1, with daily caps. */
export const DEFAULT_PACING: Pacing = {minDelayMs: 1800, maxDelayMs: 4200, maxScrolls: 6};

export function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

export async function humanPause(page: Page, pacing: Pacing = DEFAULT_PACING): Promise<void> {
  await page.waitForTimeout(randomBetween(pacing.minDelayMs, pacing.maxDelayMs));
}

/** Scrolls in irregular bursts, the way a person browsing does. */
export async function humanScroll(page: Page, pacing: Pacing = DEFAULT_PACING): Promise<void> {
  const steps = randomBetween(2, 5);
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, randomBetween(350, 900));
    await page.waitForTimeout(randomBetween(250, 800));
  }
  await humanPause(page, pacing);
}

// ── Challenge detection ──────────────────────────────────────────────────────
const CHALLENGE_URL = /\/(challenge|checkpoint|accounts\/suspended|accounts\/disabled|two_factor)\b/i;
const LOGIN_URL = /\/(accounts\/login|login(\.php)?|login\/device-based)\b/i;

/** Classifies the current page URL. A pure function, testable without a browser. */
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

/** Stops with a clear message if the page is a login or verification page. Never tries to get past it. */
export async function assertNotBlocked(page: Page, platform: SessionPlatform): Promise<void> {
  const url = page.url();
  let reason = classifyUrl(url);
  if (!reason) {
    // A login form inside the page itself (no redirect), or a captcha.
    const hasCaptcha = (await page.locator('iframe[src*="captcha"], iframe[src*="recaptcha"], [id*="captcha" i]').count()) > 0;
    if (hasCaptcha) reason = 'challenge';
  }
  if (reason === 'login_required' || reason === 'challenge') {
    throw new CollectorBlocked(reason, MESSAGES[platform][reason], url);
  }
}

/** Turns raw network errors (blocking, lost connection) into an understandable Arabic message. */
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
