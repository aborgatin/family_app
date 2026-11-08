import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** A Child's age: whole years, or whole months under a year. */
export type Age = { years: number } | { months: number };

/**
 * The age on `today` (its local date) of someone born on `birthday` (`YYYY-MM-DD`); `undefined`
 * for a birthday still to come.
 */
export function ageOn(birthday: string, today: Date): Age | undefined {
  const [year = 0, month = 0, day = 0] = birthday.split('-').map(Number);
  let months = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
  if (today.getDate() < day) months -= 1;
  if (months < 0) return undefined;
  return months < 12 ? { months } : { years: Math.floor(months / 12) };
}

/**
 * The age as the list shows it today, e.g. «7 лет», «5 месяцев», «меньше месяца»; `undefined`
 * before birth.
 */
export function useAge() {
  const { t } = useTranslation();
  return useCallback(
    (birthday: string) => {
      const age = ageOn(birthday, new Date());
      if (age === undefined) return undefined;
      if ('years' in age) return t('children.age.years', { count: age.years });
      if (age.months === 0) return t('children.age.underMonth');
      return t('children.age.months', { count: age.months });
    },
    [t],
  );
}
