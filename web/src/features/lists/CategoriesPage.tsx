import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AddRow,
  EditableRow,
  GroupedSection,
  LoadingRow,
  Page,
  Sections,
  SortableList,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  useReportFailure,
  useRowFailures,
  type ReportFailure,
  type SortableRow,
} from '@/shared/ui';
import { ListMissing, useRouteList } from './ListMissing';
import { listSettingsPath } from './listPaths';
import type { Category, List } from './listTypes';
import { categoryOrder, newCategoryId, UNNAMED_CATEGORY_KEY, useCategories } from './useCategories';
import { useItems } from './useItems';
import { useLists } from './useLists';

interface CategoriesPageProps {
  /** Path of Home, the way back when the List is gone. */
  homePath: string;
}

/**
 * «Категории» (`/lists/:id/categories`, from a Shopping list's «Настройки списка»), back to the
 * settings: the List's Categories and its Unnamed category («Без категории», grey) in their
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

/** The Category order as an edit-mode list, and the «Новая категория» add row. */
function CategoriesSection({ list }: { list: List }) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { categories, add, rename, move, remove } = useCategories(list);
  const { items, doneItems } = useItems(list);
  const editable = useEditableList();
  const failures = useRowFailures();

  const known = categories ?? [];
  // A row per Category and one for the Unnamed category (`category` undefined).
  const rows = categoryOrder(list, known).map((category) => ({ category }));
  const itemsIn = (category: Category) =>
    [...(items ?? []), ...(doneItems ?? [])].filter((item) => item.categoryId === category.id)
      .length;

  return (
    <GroupedSection
      header={t('lists.categories')}
      edit={editable.edit}
      messages={[...failures.messages, lines.failure(editable.error)]}
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
          itemId={({ category }) => category?.id ?? UNNAMED_CATEGORY_KEY}
          itemTitle={({ category }) => category?.name ?? t('lists.unnamedCategory')}
          onMove={({ category }, to) => editable.attempt(() => move(category, to))}
        >
          {({ category }, sortable) =>
            category === undefined ? (
              <EditableRow title={t('lists.unnamedCategory')} muted sortable={sortable} />
            ) : (
              <CategoryRow
                category={category}
                itemCount={itemsIn(category)}
                sortable={sortable}
                rename={rename}
                onFailure={failures.report}
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

interface CategoryRowProps {
  category: Category;
  /** How many Items (open and Done) are in it: they stay in the list without a Category. */
  itemCount: number;
  sortable: SortableRow;
  rename: (category: Category, name: string) => Promise<void>;
  /** Tells the section about this row's failed save (or that it cleared), for its footer. */
  onFailure: ReportFailure;
  busy: boolean;
  onDelete: () => void;
}

function CategoryRow({
  category,
  itemCount,
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

  useReportFailure(onFailure, category.id, name.failure);

  return (
    <EditableRow
      title={category.name}
      busy={busy}
      sortable={sortable}
      input={{ ...name.input, label: t('lists.categoryNamed', { name: category.name }) }}
      confirm={{
        title: t('lists.confirmDeleteCategory', { name: category.name }),
        ...(itemCount > 0 && { message: t('lists.categoryItemsStay', { count: itemCount }) }),
      }}
      onDelete={onDelete}
    />
  );
}
