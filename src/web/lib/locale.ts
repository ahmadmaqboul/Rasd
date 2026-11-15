import type {Language} from '../i18n';

/**
 * Regional display settings. The default per the spec: Western digits (0-9) and the shekel as currency.
 * They become changeable from Settings in Phase 1 (Arabic-Indic digits, another currency).
 */
export type Digits = 'latn' | 'arab';

export interface RegionalSettings {
  language: Language;
  digits: Digits;
  currency: string;
}

export const DEFAULT_REGIONAL: RegionalSettings = {language: 'ar', digits: 'latn', currency: 'ILS'};

/** BCP 47 tag for formatting, e.g. ar-u-nu-latn (Arabic with Western digits). */
export function formatLocale(settings: RegionalSettings = DEFAULT_REGIONAL): string {
  return `${settings.language}-u-nu-${settings.digits}`;
}

export function formatNumber(value: number, settings: RegionalSettings = DEFAULT_REGIONAL): string {
  return new Intl.NumberFormat(formatLocale(settings)).format(value);
}

export function formatDateTime(value: number | string | Date, settings: RegionalSettings = DEFAULT_REGIONAL): string {
  return new Intl.DateTimeFormat(formatLocale(settings), {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));
}

export function textDirection(language: Language): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr';
}
