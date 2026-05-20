// Single entry point for i18n. initI18n() must be called once before any
// React rendering (from app/_layout.tsx). After initialization, components
// use `useTranslation()` and non-React code imports `i18n` directly.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import enCommon from './locales/en/common.json';
import enEnums from './locales/en/enums.json';
import enEx from './locales/en/exercises.json';
import ukCommon from './locales/uk/common.json';
import ukEnums from './locales/uk/enums.json';
import ukEx from './locales/uk/exercises.json';

export const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePref = 'system' | SupportedLanguage;

export function resolveLanguage(pref: LanguagePref): SupportedLanguage {
  if (pref !== 'system') return pref;
  const device = Localization.getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(device)
    ? (device as SupportedLanguage)
    : 'en';
}

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n(pref: LanguagePref): Promise<typeof i18n> {
  if (initPromise) {
    // Init already in flight or complete — chain onto it and honor the new pref.
    return initPromise.then(async () => {
      const target = resolveLanguage(pref);
      if (i18n.language !== target) {
        await i18n.changeLanguage(target);
      }
      return i18n;
    });
  }
  initPromise = i18n
    .use(initReactI18next)
    .init({
      lng: resolveLanguage(pref),
      fallbackLng: 'en',
      ns: ['common', 'enums', 'exercises'],
      defaultNS: 'common',
      resources: {
        en: { common: enCommon, enums: enEnums, exercises: enEx },
        uk: { common: ukCommon, enums: ukEnums, exercises: ukEx },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
      compatibilityJSON: 'v4',
    })
    .then(() => i18n);
  return initPromise;
}

export { i18n };
