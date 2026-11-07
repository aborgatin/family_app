import { describe, expect, it } from 'vitest';
import ru from '@/shared/i18n/locales/ru.json';
import { CHILD_COLORS } from '.';

describe('Child color palette', () => {
  it('names every color in Russian, and names no color it does not have', () => {
    expect(Object.keys(ru.childColors).sort()).toEqual(CHILD_COLORS.map((c) => c.code).sort());
  });

  it('has distinct codes and valid hex colors', () => {
    expect(new Set(CHILD_COLORS.map((c) => c.code)).size).toBe(CHILD_COLORS.length);
    for (const color of CHILD_COLORS) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
