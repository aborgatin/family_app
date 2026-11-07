import 'i18next';
import type { defaultNS, resources } from './i18n';

// Types every t() key against the ru resource file: an unknown key is a type error (I2).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['ru'];
  }
}
