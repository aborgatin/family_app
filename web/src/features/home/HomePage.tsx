import { useTranslation } from 'react-i18next';
import { ChildrenCards } from '@/features/children';
import { ListsSection } from '@/features/lists';
import { MedicalCardRow } from '@/features/medical';
import { SETTINGS_PATH } from '@/features/settings';
import { Link, Page, Sections } from '@/shared/ui';

/** Home («Семья»): the Children as tiles, «Медкарта» (the Member's own card), then the Lists the Member may see. Settings (and logging out) behind the gear. */
export function HomePage() {
  const { t } = useTranslation();
  return (
    <Page
      title={t('app.name')}
      actions={<Link to={SETTINGS_PATH} icon="settings" label={t('settings.title')} />}
    >
      <Sections>
        <ChildrenCards />
        <MedicalCardRow />
        <ListsSection />
      </Sections>
    </Page>
  );
}
