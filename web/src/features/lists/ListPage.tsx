import { useTranslation } from 'react-i18next';
import { Link, Page, Sections } from '@/shared/ui';
import { ItemsSection } from './ItemsSection';
import { ListMissing, useRouteList } from './ListMissing';
import { listSettingsPath } from './listPaths';
import { useLists } from './useLists';

interface ListPageProps {
  /** Path of Home, where the screen goes back to. */
  homePath: string;
}

/**
 * The List screen (`/lists/:id`): the List's name as the large title and its Items
 * (`ItemsSection`); the gear opens «Настройки списка». A List that disappears while open says
 * so. Data only through `useLists()`.
 */
export function ListPage({ homePath }: ListPageProps) {
  const { t } = useTranslation();
  const { load } = useLists();
  const list = useRouteList(load);

  if (list === undefined) {
    return <ListMissing load={load} homePath={homePath} />;
  }
  return (
    <Page
      title={list.name}
      back={{ to: homePath, title: t('app.name') }}
      actions={<Link to={listSettingsPath(list.id)} icon="settings" label={t('lists.settings')} />}
    >
      <Sections>
        <ItemsSection list={list} />
      </Sections>
    </Page>
  );
}
