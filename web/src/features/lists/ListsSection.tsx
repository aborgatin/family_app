import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupedSection, ListRow, LoadingRow } from '@/shared/ui';
import { listPath } from './listPaths';
import { childIdOf, KIND_TEXTS, type List } from './listTypes';
import { NewListSheet } from './NewListSheet';
import { useOpenItemCounts } from './useItems';
import { newListId, useLists } from './useLists';

interface ListsSectionProps {
  /** The Child whose Child lists to show, on their Child page; without it, Home's Lists. */
  childId?: string;
}

/**
 * «Списки» on Home: a row per List the Member may see, by name (the kind as subtitle, « · Личный»
 * when Private) and its count of open Items, each opening the List screen; «Добавить список» opens the «Новый список» sheet.
 * With `childId` it is «Списки» on that Child's page: only their Child lists, which Home leaves
 * out, and the sheet creates one. All data access goes through `useLists()`.
 */
export function ListsSection({ childId }: ListsSectionProps) {
  const { t } = useTranslation();
  const { load, save } = useLists();
  const openCounts = useOpenItemCounts();
  // The id of the List being created, made once when the sheet opens (S3).
  const [addingId, setAddingId] = useState<string>();

  const lists =
    load.status === 'ready' ? load.value.filter((list) => childIdOf(list) === childId) : [];

  function subtitle(list: List) {
    const kind = t(KIND_TEXTS[list.kind].name);
    return list.visibility === 'PRIVATE' ? t('lists.privateKind', { kind }) : kind;
  }

  return (
    <>
      {addingId !== undefined && (
        <NewListSheet
          key={addingId}
          id={addingId}
          save={save}
          childId={childId}
          onClose={() => {
            setAddingId(undefined);
          }}
        />
      )}
      <GroupedSection
        header={t('lists.title')}
        messages={[load.status === 'ready' && lists.length === 0 && { text: t('lists.empty') }]}
        after={
          load.status === 'loading' ? (
            <LoadingRow />
          ) : (
            <ListRow
              accent
              title={t('lists.add')}
              onClick={() => {
                setAddingId(newListId());
              }}
            />
          )
        }
      >
        {lists.map((list) => (
          <ListRow
            key={list.id}
            to={listPath(list.id)}
            title={list.name}
            subtitle={subtitle(list)}
            value={openCounts === undefined ? undefined : (openCounts.get(list.id) ?? 0)}
          />
        ))}
      </GroupedSection>
    </>
  );
}
