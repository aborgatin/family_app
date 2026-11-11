import { useTranslation } from 'react-i18next';
import { ChildrenTiles } from '@/features/children';
import { ListsSection } from '@/features/lists';
import { SETTINGS_PATH } from '@/features/settings';
import { Link, Page, Sections } from '@/shared/ui';

/** Home («Семья»): the Children as tiles, then the Lists the Member may see. Settings (and logging out) behind the gear. */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <Page
      title={t('app.name')}
      actions={<Link to={SETTINGS_PATH} icon="settings" label={t('settings.title')} />}
    >
      <Sections>
        <ChildrenTiles />
        <ListsSection />
      </Sections>
    </Page>
  );
}
