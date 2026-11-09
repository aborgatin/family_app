import type { ParseKeys } from 'i18next';
import type { ValueType } from './childFieldTypes';

/** How each value type is named («Текст», «Дата»). */
export const VALUE_TYPE_KEYS = {
  TEXT: 'childFields.valueType.text',
  DATE: 'childFields.valueType.date',
} as const satisfies Record<ValueType, ParseKeys>;
