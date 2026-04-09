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

export async function initI18n(pref: LanguagePref): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(resolveLanguage(pref));
    return i18n;
  }
  await i18n.use(initReactI18next).init({
    lng: resolveLanguage(pref),
    fallbackLng: 'en',
    ns: ['common', 'enums', 'exercises'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, enums: enEnums, exercises: enEx },
      uk: { common: ukCommon, enums: ukEnums, exercises: ukEx },
    },
    interpolation: { escapeValue: false }, // RN renders text, not HTML
    returnNull: false,
    compatibilityJSON: 'v4', // CLDR plural rules (required for Ukrainian one/few/many)
  });
  return i18n;
}

export { i18n };
