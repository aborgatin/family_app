import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  autoSaveMessages,
  GroupedSection,
  InputRow,
  Page,
  Sections,
  TextAreaRow,
  useAutoSaveText,
} from '@/shared/ui';
import { ListMissing, useRouteList } from './ListMissing';
import { listPath } from './listPaths';
import { KIND_TEXTS, type Item, type List } from './listTypes';
import { useItems } from './useItems';
import { useLists } from './useLists';

interface ItemPageProps {
  /** Path of Home, the way back when the List is gone. */
  homePath: string;
}

/**
 * The Item screen (`/lists/:id/items/:itemId`), back to its List: titled by the List's kind
 * («Товар» / «Задача» / «Желание»), with the Item's name. Data only through `useLists()` and
 * `useItems()`.
 */
export function ItemPage({ homePath }: ItemPageProps) {
  const { load } = useLists();
  const list = useRouteList(load);

  if (list === undefined) {
    return <ListMissing load={load} homePath={homePath} />;
  }
  return <ListItem list={list} />;
}

/** The Item screen once its List is there. */
function ListItem({ list }: { list: List }) {
  const { t } = useTranslation();
  const { itemId } = useParams();
  const { items, doneItems, rename, describe } = useItems(list);
  const item = [...(items ?? []), ...(doneItems ?? [])].find(({ id }) => id === itemId);

  return (
    <Page title={t(KIND_TEXTS[list.kind].item)} back={{ to: listPath(list.id), title: list.name }}>
      {item !== undefined && (
        <Sections>
          <ItemFields key={item.id} item={item} rename={rename} describe={describe} />
        </Sections>
      )}
    </Page>
  );
}

interface ItemFieldsProps {
  item: Item;
  rename: (item: Item, text: string) => Promise<string>;
  describe: (item: Item, description: string) => Promise<string>;
}

/** «Название» and the large «Описание», auto-saved like the row's. */
function ItemFields({ item, rename, describe }: ItemFieldsProps) {
  const { t } = useTranslation();
  const text = useAutoSaveText({
    name: 'text',
    saved: item.text,
    save: useCallback((value: string) => rename(item, value.trim()), [item, rename]),
    required: true,
  });
  const description = useAutoSaveText({
    name: 'description',
    saved: item.description ?? '',
    save: useCallback((value: string) => describe(item, value), [item, describe]),
  });

  return (
    <GroupedSection messages={autoSaveMessages([text.failure, description.failure])}>
      <InputRow label={t('lists.name')} autoComplete="off" {...text.input} />
      <TextAreaRow label={t('lists.description')} {...description.input} />
    </GroupedSection>
  );
}
