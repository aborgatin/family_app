import { useTranslation } from 'react-i18next';
import { SETTINGS_PATH } from '@/features/settings';
import { EmptyState, Link, Page } from '@/shared/ui';

/** Placeholder home screen until Lists arrive (M2/M3). Logging out is in Settings. */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <Page
      title={t('app.name')}
      actions={<Link to={SETTINGS_PATH} icon="settings" label={t('settings.title')} />}
    >
      <EmptyState icon="home">{t('home.emptyState')}</EmptyState>
    </Page>
  );
}
