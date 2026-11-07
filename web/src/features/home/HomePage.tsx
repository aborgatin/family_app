import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LogoutButton } from '@/features/auth';
import { SETTINGS_PATH } from '@/features/settings';

/** Placeholder home screen until Lists arrive (M2/M3). */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p>{t('home.emptyState')}</p>
      <Link to={SETTINGS_PATH}>{t('settings.title')}</Link>
      <LogoutButton />
    </main>
  );
}
