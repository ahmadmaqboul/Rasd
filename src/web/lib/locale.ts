import type {Language} from '../i18n';

/**
 * إعدادات العرض الإقليمية. الافتراضي حسب المواصفات: أرقام غربية (0-9) وعملة الشيكل.
 * تصبح قابلة للتغيير من الإعدادات في Phase 1 (أرقام هندية، عملة أخرى).
 */
export type Digits = 'latn' | 'arab';

export interface RegionalSettings {
  language: Language;
  digits: Digits;
  currency: string;
}

export const DEFAULT_REGIONAL: RegionalSettings = {language: 'ar', digits: 'latn', currency: 'ILS'};

/** وسم BCP 47 للتنسيق، مثل ar-u-nu-latn (عربي بأرقام غربية). */
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
