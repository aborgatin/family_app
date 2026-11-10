import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AddRow,
  autoSaveMessages,
  EditableRow,
  GroupedSection,
  LoadingRow,
  Page,
  Sections,
  SortableList,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  type SaveFailure,
  type SortableRow,
} from '@/shared/ui';
import { ListMissing, useRouteList } from './ListMissing';
import { listSettingsPath } from './listPaths';
import type { Category, List } from './listTypes';
import { newCategoryId, useCategories, walkingOrder } from './useCategories';
import { useItems } from './useItems';
import { useLists } from './useLists';

interface CategoriesPageProps {
  /** Path of Home, the way back when the List is gone. */
  homePath: string;
}

/**
 * «Категории» (`/lists/:id/categories`, from a Shopping list's «Настройки списка»), back to the
 * settings: the List's Categories and its Unnamed category («Без категории», grey) in walking
 * order. Any Member who sees the List may rename a Category in place (auto-saved), add one at the
 * end («Новая категория»), drag any row into place, and delete a Category after the action sheet,
 * which says how many Items stay in the list without a Category. The Unnamed row can only be
 * moved. Data only through `useLists()`, `useCategories()` and `useItems()` (the local store +
 * Outbox), so it all works offline.
 */
export function CategoriesPage({ homePath }: CategoriesPageProps) {
  const { t } = useTranslation();
  const { load } = useLists();
  const list = useRouteList(load);

  if (list?.kind !== 'SHOPPING') {
    return <ListMissing load={load} homePath={homePath} />;
  }
  return (
    <Page
      title={t('lists.categories')}
      back={{ to: listSettingsPath(list.id), title: t('lists.settings') }}
    >
      <Sections>
        <CategoriesSection key={list.id} list={list} />
      </Sections>
    </Page>
  );
}

/** The walking order as an edit-mode list, and the «Новая категория» add row. */
function CategoriesSection({ list }: { list: List }) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { categories, add, rename, move, remove } = useCategories(list);
  const { items, doneItems } = useItems(list);
  const editable = useEditableList();
  const [failures, setFailures] = useState<Record<string, SaveFailure | undefined>>({});

  const reportFailure = useCallback((id: string, failure: SaveFailure | undefined) => {
    setFailures((previous) =>
      previous[id] === failure ? previous : { ...previous, [id]: failure },
    );
  }, []);

  const known = categories ?? [];
  // A row per Category and one for the Unnamed category (`category` undefined).
  const rows = walkingOrder(list, known).map((category) => ({ category }));
  const itemsIn = (category: Category) =>
    [...(items ?? []), ...(doneItems ?? [])].filter((item) => item.categoryId === category.id)
      .length;

  return (
    <GroupedSection
      header={t('lists.categories')}
      edit={editable.edit}
      messages={[
        ...autoSaveMessages(known.map((category) => failures[category.id])),
        lines.failure(editable.error),
      ]}
      after={
        categories === undefined ? (
          <LoadingRow />
        ) : (
          <AddRow
            label={t('lists.newCategory')}
            onAdd={(name) => {
              void add(newCategoryId(), name);
            }}
          />
        )
      }
    >
      {categories !== undefined && (
        <SortableList
          items={rows}
          itemId={({ category }) => category?.id ?? UNNAMED}
          itemTitle={({ category }) => category?.name ?? t('lists.unnamedCategory')}
          onMove={({ category }, to) => editable.attempt(() => move(category, to))}
        >
          {({ category }, sortable) =>
            category === undefined ? (
              <EditableRow title={t('lists.unnamedCategory')} muted sortable={sortable} />
            ) : (
              <CategoryRow
                category={category}
                items={itemsIn(category)}
                sortable={sortable}
                rename={rename}
                onFailure={reportFailure}
                busy={editable.deleting === category.id}
                onDelete={() => {
                  void editable.remove(category.id, false, () => remove(category));
                }}
              />
            )
          }
        </SortableList>
      )}
    </GroupedSection>
  );
}

/** The Unnamed row's id in the `SortableList` (never a Category's: those are UUIDs). */
const UNNAMED = 'unnamed';

interface CategoryRowProps {
  category: Category;
  /** How many Items (open and Done) are in it: they stay in the list without a Category. */
  items: number;
  sortable: SortableRow;
  rename: (category: Category, name: string) => Promise<void>;
  /** Tells the section about this row's failed save (or that it cleared), for its footer. */
  onFailure: (id: string, failure: SaveFailure | undefined) => void;
  busy: boolean;
  onDelete: () => void;
}

function CategoryRow({
  category,
  items,
  sortable,
  rename,
  onFailure,
  busy,
  onDelete,
}: CategoryRowProps) {
  const { t } = useTranslation();
  const save = useCallback(
    async (name: string) => {
      await rename(category, name.trim());
      return name.trim();
    },
    [category, rename],
  );
  const name = useAutoSaveText({ name: category.id, saved: category.name, save, required: true });

  const { id } = category;
  useEffect(() => {
    onFailure(id, name.failure);
  }, [id, name.failure, onFailure]);
  useEffect(
    () => () => {
      onFailure(id, undefined);
    },
    [id, onFailure],
  );

  return (
    <EditableRow
      title={category.name}
      busy={busy}
      sortable={sortable}
      input={{ ...name.input, label: t('lists.categoryNamed', { name: category.name }) }}
      confirm={{
        title: t('lists.confirmDeleteCategory', { name: category.name }),
        ...(items > 0 && { message: t('lists.categoryItemsStay', { count: items }) }),
      }}
      onDelete={onDelete}
    />
  );
}
