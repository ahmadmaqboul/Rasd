import {existsSync, rmSync} from 'node:fs';
import {and, eq, inArray} from 'drizzle-orm';
import {getDb, schema} from './db/client';
import {SESSION_PLATFORMS, type PlatformSessionRow, type SessionPlatformId, type SessionStatus} from './db/schema';
import {emitEvent} from './events';
import {ACTIVE_STATUSES, toJobView, type JobView} from './jobs/queue';
import {paths} from './paths';

/**
 * Platform sessions (§5.1): one logged-in browser profile per platform under data/sessions/<platform>.
 * The user logs in by hand in a visible window; Rasd only reads whether the login cookie is there and whether
 * the platform still accepts it. Never automates a login, a captcha or a security check.
 */

export {SESSION_PLATFORMS};

export interface SessionTarget {
  loginUrl: string;
  homeUrl: string;
  /** The URL whose cookies show whether the user is logged in. */
  cookieUrl: string;
  /** All of these cookies must be present (and not expired) for a session to count as logged in. */
  loginCookies: string[];
}

export const SESSION_TARGETS: Record<SessionPlatformId, SessionTarget> = {
  instagram: {
    loginUrl: 'https://www.instagram.com/accounts/login/',
    homeUrl: 'https://www.instagram.com/',
    cookieUrl: 'https://www.instagram.com',
    loginCookies: ['sessionid'],
  },
  facebook: {
    loginUrl: 'https://www.facebook.com/login/',
    homeUrl: 'https://www.facebook.com/',
    cookieUrl: 'https://www.facebook.com',
    loginCookies: ['c_user', 'xs'],
  },
};

export function isSessionPlatform(value: unknown): value is SessionPlatformId {
  return typeof value === 'string' && (SESSION_PLATFORMS as readonly string[]).includes(value);
}

export interface CookieLike {
  name: string;
  value: string;
  /** Seconds since the epoch; -1 for a cookie that lasts until the browser closes. */
  expires: number;
}

export interface CookieAssessment {
  loggedIn: boolean;
  /** The earliest expiry of the login cookies, if they have one. */
  expiresAt: Date | null;
}

/** Whether the saved cookies show a logged-in session. A pure function: no browser, no network. */
export function assessCookies(target: Pick<SessionTarget, 'loginCookies'>, cookies: CookieLike[], now = new Date()): CookieAssessment {
  const nowSeconds = now.getTime() / 1000;
  const found = target.loginCookies.map(name =>
    cookies.find(c => c.name === name && c.value !== '' && (c.expires === -1 || c.expires > nowSeconds)),
  );
  if (found.some(c => c === undefined)) return {loggedIn: false, expiresAt: null};
  const expiries = found.map(c => c!.expires).filter(e => e > 0);
  return {loggedIn: true, expiresAt: expiries.length ? new Date(Math.min(...expiries) * 1000) : null};
}

// ── Stored status ────────────────────────────────────────────────────────────
const {platformSessions, jobs} = schema;

export const SESSION_JOB_TYPES = ['session.login', 'session.check'] as const;

export interface SessionView {
  platform: SessionPlatformId;
  status: SessionStatus;
  label: string | null;
  lastLoginAt: string | null;
  lastCheckedAt: string | null;
  expiresAt: string | null;
  /** Extra detail about the last problem (Arabic), e.g. why the platform could not be reached. */
  message: string | null;
  /** Whether a browser profile folder exists on disk. */
  hasProfile: boolean;
  /** A login or check that is queued or running right now. */
  activeJob: JobView | null;
}

function rowFor(platform: SessionPlatformId): PlatformSessionRow | undefined {
  return getDb().select().from(platformSessions).where(eq(platformSessions.platform, platform)).get();
}

function activeSessionJob(platform: SessionPlatformId) {
  return getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.lane, platform), inArray(jobs.type, [...SESSION_JOB_TYPES]), inArray(jobs.status, ACTIVE_STATUSES)))
    .get();
}

export function getSession(platform: SessionPlatformId): SessionView {
  const row = rowFor(platform);
  const job = activeSessionJob(platform);
  return {
    platform,
    status: row?.status ?? 'missing',
    label: row?.label ?? null,
    lastLoginAt: row?.lastLoginAt?.toISOString() ?? null,
    lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
    expiresAt: row?.expiresAt?.toISOString() ?? null,
    message: row?.message ?? null,
    hasProfile: existsSync(paths.sessions(platform)),
    activeJob: job ? toJobView(job) : null,
  };
}

export function listSessions(): SessionView[] {
  return SESSION_PLATFORMS.map(getSession);
}

export interface SessionUpdate {
  status?: SessionStatus;
  label?: string | null;
  lastLoginAt?: Date | null;
  lastCheckedAt?: Date | null;
  expiresAt?: Date | null;
  message?: string | null;
}

export function updateSession(platform: SessionPlatformId, update: SessionUpdate): SessionView {
  const now = new Date();
  const values = {...update, updatedAt: now};
  getDb()
    .insert(platformSessions)
    .values({platform, status: update.status ?? 'missing', ...values})
    .onConflictDoUpdate({target: platformSessions.platform, set: values})
    .run();
  const view = getSession(platform);
  emitEvent(null, 'session.updated', {session: view});
  return view;
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code: 'busy' | 'invalid',
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

/** Deletes the saved browser profile (the login cookies) for a platform. */
export function disconnectSession(platform: SessionPlatformId): SessionView {
  const busy = getDb()
    .select({id: jobs.id})
    .from(jobs)
    .where(and(eq(jobs.lane, platform), inArray(jobs.status, ACTIVE_STATUSES)))
    .get();
  if (busy) {
    throw new SessionError('في مهمة شغّالة على هالجلسة. استنّى تخلص أو ألغيها، وبعدين افصل.', 'busy');
  }
  rmSync(paths.sessions(platform), {recursive: true, force: true});
  return updateSession(platform, {status: 'missing', lastLoginAt: null, lastCheckedAt: null, expiresAt: null, message: null});
}
