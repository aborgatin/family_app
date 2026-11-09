import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { EmptyState, Page } from '@/shared/ui';
import { KIND_TEXTS } from './listTypes';
import { useLists } from './useLists';

/** Route of the List screen, opened from «Списки» on Home. */
export const LIST_PATH = '/lists/:id';

/** Path of the screen of the List with this id. */
export function listPath(id: string): string {
  return LIST_PATH.replace(':id', encodeURIComponent(id));
}

interface ListPageProps {
  /** Path of Home, where the screen goes back to. */
  homePath: string;
}

/**
 * The List screen (`/lists/:id`): the List's name as the large title and, until Items arrive
 * (ticket #57), the kind's empty state. Data only through `useLists()`.
 */
export function ListPage({ homePath }: ListPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load } = useLists();
  const back = { to: homePath, title: t('app.name') };

  const list = load.status === 'ready' ? load.value.find((l) => l.id === id) : undefined;
  if (list !== undefined) {
    return (
      <Page title={list.name} back={back}>
        <EmptyState>{t(KIND_TEXTS[list.kind].noItems)}</EmptyState>
      </Page>
    );
  }

  return (
    <Page title={t('lists.title')} back={back}>
      {load.status === 'loading' ? (
        <EmptyState role="status">{t('common.loading')}</EmptyState>
      ) : (
        <EmptyState role="alert">{t('lists.notFound')}</EmptyState>
      )}
    </Page>
  );
}
