import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Section, SegmentedRow } from '@/shared/ui';
import { readThemeChoice, storeThemeChoice, type ThemeChoice } from './themeChoice';

/**
 * «Оформление»: «Авто / Светлая / Тёмная» for this device. Applied at once by the theme script
 * in index.html (docs/design.md "Theme"); nothing goes to the server.
 */
export function AppearanceSection() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  const options = [
    { value: 'auto', label: t('settings.appearance.auto') },
    { value: 'light', label: t('settings.appearance.light') },
    { value: 'dark', label: t('settings.appearance.dark') },
  ] as const;

  return (
    <Section title={t('settings.appearance.title')}>
      <SegmentedRow
        labelHidden
        label={t('settings.appearance.theme')}
        options={options}
        value={choice}
        onChange={(value) => {
          storeThemeChoice(value);
          setChoice(value);
        }}
      />
    </Section>
  );
}
