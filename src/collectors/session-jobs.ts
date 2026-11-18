import type {BrowserContext, Page} from 'playwright';
import {existsSync} from 'node:fs';
import type {SessionPlatformId} from '../core/db/schema';
import {JobError, type JobContext, type JobHandler} from '../core/jobs/worker';
import {paths} from '../core/paths';
import {
  SESSION_TARGETS,
  assessCookies,
  getSession,
  isSessionPlatform,
  updateSession,
  type SessionTarget,
} from '../core/sessions';
import {classifyUrl, describeNavigationError, openSession, randomBetween} from './browser';

/**
 * Job handlers for the sessions manager (Settings → حسابات الدخول):
 *  - session.login: opens a visible browser on the platform's login page and waits while the user logs in by hand.
 *    If the platform shows a security check, the user solves it in that window; Rasd only waits.
 *  - session.check: reads the saved cookies, then (by default) opens the platform once, hidden, to see whether it
 *    still accepts the session.
 */

export interface SessionJobDeps {
  /** Override the URLs per platform (tests use a local page). */
  targets?: Partial<Record<SessionPlatformId, SessionTarget>>;
  openContext?: (platform: SessionPlatformId, headed: boolean) => Promise<BrowserContext>;
  loginTimeoutMs?: number;
  pollMs?: number;
  /** Wait after the login cookie appears, so the platform can finish its redirects and write all cookies. */
  settleMs?: number;
}

export const LOGIN_TIMEOUT_MS = 15 * 60_000;

/** Turns a browser launch failure into an Arabic message the user can act on. */
export function describeLaunchError(error: unknown): JobError {
  const text = error instanceof Error ? error.message : String(error);
  if (/XServer|X server|\$DISPLAY|headed browser without/i.test(text)) {
    return new JobError(
      'ما بقدر أفتح نافذة متصفح على هذا الجهاز لأنه ما في شاشة. شغّل رَصد على جهازك الشخصي وجرّب مرة ثانية.',
      'no_display',
    );
  }
  if (/ProcessSingleton|SingletonLock|profile (directory )?is already in use|user data directory is already in use/i.test(text)) {
    return new JobError('جلسة هالمنصة مفتوحة بنافذة ثانية. سكّرها وجرّب مرة ثانية.', 'profile_busy');
  }
  if (/Executable doesn't exist|npx playwright install/i.test(text)) {
    return new JobError('متصفح الجمع مش مثبّت. شغّل بالطرفية: npx playwright install chromium', 'browser_missing');
  }
  return new JobError(`ما قدرت أفتح المتصفح: ${text.split('\n')[0]}`, 'browser_failed');
}

function platformOf(ctx: JobContext): SessionPlatformId {
  const platform = ctx.job.payload.platform;
  if (!isSessionPlatform(platform)) throw new JobError('منصة غير معروفة لهالمهمة.', 'invalid');
  return platform;
}

async function launch(deps: SessionJobDeps, platform: SessionPlatformId, headed: boolean): Promise<BrowserContext> {
  try {
    return await (deps.openContext ?? ((p, h) => openSession(p, {headed: h})))(platform, headed);
  } catch (error) {
    throw describeLaunchError(error);
  }
}

async function hasLoginForm(page: Page): Promise<boolean> {
  return (await page.locator('input[type="password"]:visible').count()) > 0;
}

async function hasCaptcha(page: Page): Promise<boolean> {
  return (await page.locator('iframe[src*="captcha"], iframe[src*="recaptcha"], [id*="captcha" i]').count()) > 0;
}

export function sessionJobHandlers(deps: SessionJobDeps = {}): Record<'session.login' | 'session.check', JobHandler> {
  const targetFor = (platform: SessionPlatformId) => deps.targets?.[platform] ?? SESSION_TARGETS[platform];
  const pollMs = deps.pollMs ?? 2_000;
  const settleMs = deps.settleMs ?? 3_000;
  const timeoutMs = deps.loginTimeoutMs ?? LOGIN_TIMEOUT_MS;

  const login: JobHandler = async ctx => {
    const platform = platformOf(ctx);
    const target = targetFor(platform);
    ctx.progress({step: 'opening_browser'});
    const context = await launch(deps, platform, true);
    let closed = false;
    context.on('close', () => (closed = true));
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      try {
        await page.goto(target.loginUrl, {waitUntil: 'domcontentloaded', timeout: 60_000});
      } catch (error) {
        throw describeNavigationError(error, new URL(target.loginUrl).host);
      }
      const deadline = Date.now() + timeoutMs;
      let lastStep = '';
      for (;;) {
        if (closed || context.pages().length === 0) {
          throw new JobError('سكّرت نافذة المتصفح قبل ما يكتمل تسجيل الدخول. جرّب مرة ثانية.', 'window_closed');
        }
        const assessment = assessCookies(target, await context.cookies(target.cookieUrl));
        if (assessment.loggedIn) {
          ctx.progress({step: 'saving_session'});
          await ctx.sleep(settleMs);
          const final = assessCookies(target, await context.cookies(target.cookieUrl));
          const now = new Date();
          updateSession(platform, {
            status: 'valid',
            lastLoginAt: now,
            lastCheckedAt: now,
            expiresAt: final.expiresAt ?? assessment.expiresAt,
            message: null,
          });
          return {status: 'valid'};
        }
        const challenged = context.pages().some(p => classifyUrl(p.url()) === 'challenge');
        const step = challenged ? 'waiting_for_check' : 'waiting_for_login';
        if (step !== lastStep) {
          ctx.progress({step});
          lastStep = step;
        }
        if (Date.now() > deadline) {
          throw new JobError(`انتهت مهلة تسجيل الدخول (${Math.round(timeoutMs / 60_000)} دقيقة). جرّب مرة ثانية.`, 'timeout');
        }
        await ctx.sleep(pollMs);
      }
    } finally {
      if (!closed) await context.close().catch(() => undefined);
    }
  };

  const check: JobHandler = async ctx => {
    const platform = platformOf(ctx);
    const target = targetFor(platform);
    const online = ctx.job.payload.online !== false;
    const before = getSession(platform);
    const now = () => new Date();

    if (!existsSync(paths.sessions(platform))) {
      updateSession(platform, {status: 'missing', lastCheckedAt: now(), expiresAt: null, message: null});
      return {status: 'missing'};
    }

    ctx.progress({step: 'reading_session'});
    const context = await launch(deps, platform, false);
    try {
      const saved = assessCookies(target, await context.cookies(target.cookieUrl));
      if (!saved.loggedIn) {
        const status = before.lastLoginAt ? 'expired' : 'missing';
        updateSession(platform, {status, lastCheckedAt: now(), expiresAt: null, message: null});
        return {status};
      }
      if (!online) {
        updateSession(platform, {status: 'unknown', lastCheckedAt: now(), expiresAt: saved.expiresAt, message: null});
        return {status: 'unknown'};
      }

      ctx.progress({step: 'opening_platform'});
      const page = await context.newPage();
      try {
        await page.goto(target.homeUrl, {waitUntil: 'domcontentloaded', timeout: 45_000});
      } catch (error) {
        const blocked = describeNavigationError(error, new URL(target.homeUrl).host);
        updateSession(platform, {status: 'unknown', lastCheckedAt: now(), expiresAt: saved.expiresAt, message: blocked.message});
        return {status: 'unknown'};
      }
      await ctx.sleep(randomBetween(1_500, 3_000));
      const reason =
        classifyUrl(page.url()) ?? ((await hasCaptcha(page)) ? 'challenge' : (await hasLoginForm(page)) ? 'login_required' : null);
      const after = assessCookies(target, await context.cookies(target.cookieUrl));
      const status = reason === 'challenge' ? 'challenged' : reason === 'login_required' || !after.loggedIn ? 'expired' : 'valid';
      updateSession(platform, {
        status,
        lastCheckedAt: now(),
        expiresAt: status === 'valid' ? after.expiresAt : null,
        message: null,
      });
      return {status};
    } finally {
      await context.close().catch(() => undefined);
    }
  };

  return {'session.login': login, 'session.check': check};
}
