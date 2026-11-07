import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';

export const defaultNS = 'translation';

/** The only resource bundle; its shape types every `t()` key (see i18next.d.ts). */
export const resources = { ru: { [defaultNS]: ru } } as const;

void i18next.use(initReactI18next).init({
  lng: 'ru',
  fallbackLng: 'ru',
  defaultNS,
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
});

export { i18next as i18n };
