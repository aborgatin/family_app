import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/shared/ui';
import type { GrammaticalGender } from './authApi';

type GrammaticalGenderRowProps = Omit<
  ComponentProps<typeof SegmentedControl<GrammaticalGender>>,
  'label' | 'options'
>;

/**
 * «Пол» as a segmented row, «Мужской» / «Женский»: the same at registration (required, nothing
 * chosen at first) and in «Ваш профиль» (auto-saved).
 */
export function GrammaticalGenderRow(props: GrammaticalGenderRowProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={t('grammaticalGender.label')}
      options={[
        { value: 'MASCULINE', label: t('grammaticalGender.masculine') },
        { value: 'FEMININE', label: t('grammaticalGender.feminine') },
      ]}
      {...props}
    />
  );
}
