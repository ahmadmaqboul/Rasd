import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import arCommon from '../../locales/ar/common.json';
import arDev from '../../locales/ar/dev.json';
import arHome from '../../locales/ar/home.json';
import arNav from '../../locales/ar/nav.json';
import arSections from '../../locales/ar/sections.json';
import arStudies from '../../locales/ar/studies.json';
import enCommon from '../../locales/en/common.json';
import enDev from '../../locales/en/dev.json';
import enHome from '../../locales/en/home.json';
import enNav from '../../locales/en/nav.json';
import enSections from '../../locales/en/sections.json';
import enStudies from '../../locales/en/studies.json';

/**
 * كل نص ظاهر للمستخدم يمرّ من هنا — لا نصوص مكتوبة داخل المكوّنات.
 * العربية هي الأصل؛ الإنجليزية مهيّأة وفارغة (Phase 8) وتسقط على العربية عند غياب المفتاح.
 */

export const DEFAULT_LANGUAGE = 'ar';
export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const ar = {
  common: arCommon,
  nav: arNav,
  home: arHome,
  studies: arStudies,
  sections: arSections,
  dev: arDev,
} as const;

export const resources = {
  ar,
  en: {
    common: enCommon,
    nav: enNav,
    home: enHome,
    studies: enStudies,
    sections: enSections,
    dev: enDev,
  },
} as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof ar;
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'common',
  ns: Object.keys(ar),
  interpolation: {escapeValue: false},
  returnNull: false,
});

export default i18n;
