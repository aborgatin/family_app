import { useTranslation } from 'react-i18next';
import { LogoutButton } from '@/features/auth';
import { SETTINGS_PATH } from '@/features/settings';
import { EmptyState, Link, Page } from '@/shared/ui';

/** Placeholder home screen until Lists arrive (M2/M3). */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <Page
      title={t('app.name')}
      actions={<Link to={SETTINGS_PATH} icon="settings" label={t('settings.title')} />}
    >
      {/* The logout button moves to Settings with the Settings ticket (spec #35). */}
      <EmptyState icon="home" action={<LogoutButton />}>
        {t('home.emptyState')}
      </EmptyState>
    </Page>
  );
}
