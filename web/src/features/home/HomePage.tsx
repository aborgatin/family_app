import { useTranslation } from 'react-i18next';

/** Placeholder home screen until Lists arrive (M2/M3). */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p>{t('home.emptyState')}</p>
    </main>
  );
}
