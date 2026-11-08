import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { CHILD_COLORS } from '@/shared/palette';
import { ColorChoice, DateRow, InputRow } from '@/shared/ui';

interface ChildRowsProps {
  name: Omit<ComponentProps<typeof InputRow>, 'label'>;
  color: Omit<ComponentProps<typeof ColorChoice<string>>, 'label' | 'options'>;
  birthday: Omit<ComponentProps<typeof DateRow>, 'label'>;
}

/**
 * A Child's rows, the same on the Child screen (auto-saved) and in the «Новый ребёнок» sheet
 * (saved with «Готово»): Имя, Цвет (the Child color palette, each circle named by
 * `childColors.<code>`), День рождения.
 */
export function ChildRows({ name, color, birthday }: ChildRowsProps) {
  const { t } = useTranslation();
  const colors = CHILD_COLORS.map((option) => ({
    value: option.code,
    label: t(`childColors.${option.code}`),
    color: option.hex,
  }));
  return (
    <>
      <InputRow label={t('children.name')} autoComplete="off" {...name} />
      <ColorChoice label={t('children.color')} options={colors} {...color} />
      <DateRow label={t('children.birthday')} {...birthday} />
    </>
  );
}
