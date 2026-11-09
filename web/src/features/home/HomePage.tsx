import { useTranslation } from 'react-i18next';
import { ListsSection } from '@/features/lists';
import { SETTINGS_PATH } from '@/features/settings';
import { Link, Page } from '@/shared/ui';

/** Home («Семья»): the Lists the Member may see. Settings (and logging out) behind the gear. */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <Page
      title={t('app.name')}
      actions={<Link to={SETTINGS_PATH} icon="settings" label={t('settings.title')} />}
    >
      <ListsSection />
    </Page>
  );
}
