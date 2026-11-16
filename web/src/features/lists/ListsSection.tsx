import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupedSection, Icon, ListRow, LoadingRow } from '@/shared/ui';
import { listPath } from './listPaths';
import { KIND_TEXTS, LIST_KINDS, type List, type ListKind } from './listTypes';
import { NewListSheet } from './NewListSheet';
import { useOpenItemCounts } from './useItems';
import { newListId, useLists } from './useLists';

interface ListsSectionProps {
  /** The Child whose Child lists to show, on their Child page; without it, Home's Lists. */
  childId?: string;
}

/** The «Новый список» sheet being shown: its List id, made once when it opens (S3), and its kind. */
interface Adding {
  id: string;
  kind?: ListKind;
}

/**
 * The Lists on Home, or with `childId` on that Child's page. All data access goes through
 * `useLists()`.
 *
 * Home: a section per List kind, in the order Покупки, TODO, Желания, each holding the Lists of
 * that kind (Shared first, then Private, each by name) and ending with its «Добавить …» row, which
 * opens «Новый …» for that kind. A row shows the List's name, its count of open Items, and
 * a leading icon for its Visibility (people: Shared, lock: Private). A kind with no Lists still
 * shows its section with only the row. Child lists are left out.
 *
 * Child page: one «Списки» section with a row per Child list by name, the kind as subtitle;
 * «Добавить список» opens «Новый список» for a Child list.
 */
export function ListsSection({ childId }: ListsSectionProps) {
  const { load, save } = useLists();
  const openCounts = useOpenItemCounts();
  const [adding, setAdding] = useState<Adding>();

  const lists =
    load.status === 'ready'
      ? load.value.filter((list) => (list.childId ?? undefined) === childId)
      : [];

  function row(list: List, leading?: ReactNode, subtitle?: string) {
    return (
      <ListRow
        key={list.id}
        to={listPath(list.id)}
        title={list.name}
        subtitle={subtitle}
        leading={leading}
        value={openCounts === undefined ? undefined : (openCounts.get(list.id) ?? 0)}
      />
    );
  }

  return (
    <>
      {adding !== undefined && (
        <NewListSheet
          key={adding.id}
          id={adding.id}
          save={save}
          childId={childId}
          kind={adding.kind}
          onClose={() => {
            setAdding(undefined);
          }}
        />
      )}
      {childId === undefined ? (
        LIST_KINDS.map((kind) => (
          <KindSection
            key={kind}
            kind={kind}
            lists={lists.filter((list) => list.kind === kind)}
            loading={load.status === 'loading'}
            row={row}
            onAdd={() => {
              setAdding({ id: newListId(), kind });
            }}
          />
        ))
      ) : (
        <ChildListsSection
          lists={lists}
          loading={load.status === 'loading'}
          row={row}
          onAdd={() => {
            setAdding({ id: newListId() });
          }}
        />
      )}
    </>
  );
}

interface SectionProps {
  lists: List[];
  loading: boolean;
  row: (list: List, leading?: ReactNode, subtitle?: string) => ReactNode;
  onAdd: () => void;
}

/** One kind's section on Home. */
function KindSection({ kind, lists, loading, row, onAdd }: SectionProps & { kind: ListKind }) {
  const { t } = useTranslation();
  // `lists` is by name already (`useLists()`); a stable sort keeps that within each Visibility.
  const ordered = [...lists].sort(
    (a, b) => Number(a.visibility === 'PRIVATE') - Number(b.visibility === 'PRIVATE'),
  );
  return (
    <GroupedSection
      header={t(KIND_TEXTS[kind].choice)}
      after={
        loading ? (
          <LoadingRow />
        ) : (
          <ListRow accent title={t(KIND_TEXTS[kind].add)} onClick={onAdd} />
        )
      }
    >
      {ordered.map((list) =>
        row(
          list,
          <Icon
            name={list.visibility === 'PRIVATE' ? 'private' : 'shared'}
            size={20}
            secondary
            label={t(
              list.visibility === 'PRIVATE'
                ? 'lists.visibility.private'
                : 'lists.visibility.shared',
            )}
          />,
        ),
      )}
    </GroupedSection>
  );
}

/** «Списки» on a Child page. */
function ChildListsSection({ lists, loading, row, onAdd }: SectionProps) {
  const { t } = useTranslation();
  return (
    <GroupedSection
      header={t('lists.title')}
      messages={[!loading && lists.length === 0 && { text: t('lists.empty') }]}
      after={loading ? <LoadingRow /> : <ListRow accent title={t('lists.add')} onClick={onAdd} />}
    >
      {lists.map((list) => row(list, undefined, t(KIND_TEXTS[list.kind].name)))}
    </GroupedSection>
  );
}
