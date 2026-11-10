import { useTranslation } from 'react-i18next';
import { Page, Sections } from '@/shared/ui';
import { DoneItems } from './ItemsSection';
import { ListMissing, useRouteList } from './ListMissing';
import { listPath } from './listPaths';
import type { List } from './listTypes';
import { useItems } from './useItems';
import { useLists } from './useLists';

interface DoneEarlierPageProps {
  /** Path of Home, the way back when the List is gone. */
  homePath: string;
}

/**
 * «Выполненные ранее» (`/lists/:id/done-earlier`, from the row under a Todo list's «Выполнено»),
 * back to the List: its Items marked Done before the last 7 days, most recent first. Each can be
 * ticked back on (it returns to the List's open Items) and deleted, as in «Выполнено». Only a
 * Todo list has it. Data only through `useLists()` and `useItems()` (the local store + Outbox).
 */
export function DoneEarlierPage({ homePath }: DoneEarlierPageProps) {
  const { t } = useTranslation();
  const { load } = useLists();
  const list = useRouteList(load);

  if (list?.kind !== 'TODO') {
    return <ListMissing load={load} homePath={homePath} />;
  }
  return (
    <Page title={t('lists.doneEarlier')} back={{ to: listPath(list.id), title: list.name }}>
      <Sections>
        <EarlierDoneItems key={list.id} list={list} />
      </Sections>
    </Page>
  );
}

function EarlierDoneItems({ list }: { list: List }) {
  const { t } = useTranslation();
  const { earlierDoneItems, setDone, remove } = useItems(list);

  if (earlierDoneItems === undefined) return null;
  return (
    <DoneItems
      list={list}
      header={t('lists.doneEarlier')}
      items={earlierDoneItems}
      setDone={setDone}
      remove={remove}
    />
  );
}
