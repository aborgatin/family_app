import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { EmptyState, Page } from '@/shared/ui';
import type { List } from './listTypes';
import type { ListsLoad } from './useLists';

/** The List the route's `:id` names, once loaded and while it exists. */
export function useRouteList(load: ListsLoad): List | undefined {
  const { id } = useParams();
  return load.status === 'ready' ? load.value.find((l) => l.id === id) : undefined;
}

interface ListMissingProps {
  load: ListsLoad;
  /** Path of Home, the way back. */
  homePath: string;
}

/**
 * What a List's screens show without the List: loading, or «Такого списка нет» for a List that is
 * unknown or has disappeared while open (deleted, or made Private by its Owner), back to Home.
 */
export function ListMissing({ load, homePath }: ListMissingProps) {
  const { t } = useTranslation();
  return (
    <Page title={t('lists.title')} back={{ to: homePath, title: t('app.name') }}>
      {load.status === 'loading' ? (
        <EmptyState role="status">{t('common.loading')}</EmptyState>
      ) : (
        <EmptyState role="alert">{t('lists.notFound')}</EmptyState>
      )}
    </Page>
  );
}
