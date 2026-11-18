import type {Language} from '../i18n';

/**
 * Regional display settings. The default per the spec: Western digits (0-9) and the shekel as currency.
 * The user changes them in Settings; Providers loads them and calls setRegional(), so every formatter below
 * follows the saved choice without each caller passing it.
 */
export type Digits = 'latn' | 'arab';

export interface RegionalSettings {
  language: Language;
  digits: Digits;
  currency: string;
}

export const DEFAULT_REGIONAL: RegionalSettings = {language: 'ar', digits: 'latn', currency: 'ILS'};

let current: RegionalSettings = DEFAULT_REGIONAL;

export function setRegional(settings: RegionalSettings): void {
  current = settings;
}

export function getRegional(): RegionalSettings {
  return current;
}

/** BCP 47 tag for formatting, e.g. ar-u-nu-latn (Arabic with Western digits). */
export function formatLocale(settings: RegionalSettings = current): string {
  return `${settings.language}-u-nu-${settings.digits}`;
}

export function formatNumber(value: number, settings: RegionalSettings = current): string {
  return new Intl.NumberFormat(formatLocale(settings)).format(value);
}

export function formatDateTime(value: number | string | Date, settings: RegionalSettings = current): string {
  return new Intl.DateTimeFormat(formatLocale(settings), {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));
}

/** A price in the given currency (or the default one), e.g. "89 ₪". */
export function formatMoney(value: number, currency: string = current.currency, settings: RegionalSettings = current): string {
  return new Intl.NumberFormat(formatLocale(settings), {style: 'currency', currency, maximumFractionDigits: 2}).format(value);
}

/** "3 minutes ago" style, for "last checked" lines. */
export function formatRelative(value: string | Date, now = Date.now(), settings: RegionalSettings = current): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(formatLocale(settings), {numeric: 'auto'});
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86_400), 'day');
}

export function textDirection(language: Language): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr';
}
