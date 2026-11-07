import type ru from '@/shared/i18n/locales/ru.json';
import palette from './childColors.json';

/** A code from the Child color palette; its name is the i18n key `childColors.<code>`. */
export type ChildColorCode = keyof typeof ru.childColors;

export interface ChildColor {
  code: ChildColorCode;
  /** How the color is drawn; only the code travels to the API. */
  hex: string;
}

/**
 * The Child color palette, in picker order. Defined once in `childColors.json`, which the backend
 * build also reads to validate `color` (`color.invalid`), so the picker and the API always agree.
 * Every code has a name in `ru.json` › `childColors` (checked by palette.test.ts).
 */
export const CHILD_COLORS = palette as readonly ChildColor[];

/** The palette entry for a code; `undefined` for a code this build does not know. */
export function childColor(code: string): ChildColor | undefined {
  return CHILD_COLORS.find((color) => color.code === code);
}
