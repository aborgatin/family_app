import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AddRow,
  autoSaveMessages,
  DoneToggle,
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  type SaveFailure,
} from '@/shared/ui';
import { KIND_TEXTS, type Item, type List } from './listTypes';
import { newCategoryId, sectionsInOrder, useCategories } from './useCategories';
import { useItems } from './useItems';

interface ItemsSectionProps {
  list: List;
}

/**
 * The List screen's Items. The open ones come first, headed by the kind's Items («Товары» /
 * «Задачи» / «Желания»): each has a Done toggle, its text is edited in place and auto-saved, edit
 * mode («Изменить»), a swipe or right-click deletes after the action sheet, and the last row adds
 * an Item («Новый товар», Enter keeps the focus for the next). With no open Items the footer says
 * «Товаров пока нет». A Shopping list with named Categories shows its open Items in one section
 * per Category instead (`CategorySections`). The Done ones follow in their own group, headed by
 * the kind's Done («Куплено» / «Выполнено» / «Исполнено»), ticked; ticking one off again puts it
 * back among the open ones. All data access goes through `useItems()` and `useCategories()` (the
 * local store + Outbox).
 */
export function ItemsSection({ list }: ItemsSectionProps) {
  const { t } = useTranslation();
  const texts = KIND_TEXTS[list.kind];
  const { items, doneItems, add, rename, setDone, remove } = useItems(list.id);
  const changes = { list, rename, setDone, remove };

  return (
    <>
      {list.kind === 'SHOPPING' ? (
        <CategorySections {...changes} items={items} add={add} />
      ) : (
        <OpenItems
          {...changes}
          header={t(texts.items)}
          items={items}
          showEmpty
          onAdd={(text) => {
            void add(text);
          }}
        />
      )}
      {doneItems !== undefined && doneItems.length > 0 && (
        <DoneItems list={list} items={doneItems} setDone={setDone} remove={remove} />
      )}
    </>
  );
}

/** What changes an Item, from `useItems()`. */
interface ItemChanges {
  list: List;
  rename: (item: Item, text: string) => Promise<string>;
  setDone: (item: Item, done: boolean) => Promise<void>;
  remove: (item: Item) => Promise<void>;
}

interface CategorySectionsProps extends ItemChanges {
  items: Item[] | undefined;
  add: (text: string, categoryId?: string) => Promise<void>;
}

/**
 * A Shopping list's open Items. With no named Categories, the one «Товары» section, as on any
 * List. With some, one section per Category, headed by its name, and an untitled one for the
 * Unnamed category, in walking order; each shows even with no open Items and ends with its own
 * «Новый товар», which adds into it. Then the «Новая категория» row: it adds a Category at the end
 * with its title being typed, and Enter there moves to that Category's «Новый товар».
 */
function CategorySections({ items, add, ...changes }: CategorySectionsProps) {
  const { t } = useTranslation();
  const { list } = changes;
  const { categories, add: addCategory } = useCategories(list);
  // A Category whose title is being typed (not saved yet), or saved and not read back yet.
  const [typed, setDraft] = useState<{ id: string; name: string; saved: boolean }>();
  // The Category whose «Новый товар» takes the focus when it appears: the one just named.
  const [focusAddIn, setFocusAddIn] = useState<string>();

  const known = categories ?? [];
  // Once read back from the store, the new Category is an ordinary one.
  const draft = typed !== undefined && !known.some(({ id }) => id === typed.id) ? typed : undefined;

  function commitDraft() {
    if (draft === undefined || draft.saved) return;
    const name = draft.name.trim();
    if (name === '') {
      setDraft(undefined);
      return;
    }
    setDraft({ ...draft, saved: true });
    setFocusAddIn(draft.id);
    void addCategory(draft.id, name);
  }

  const newCategory = (
    <GroupedSection>
      <ListRow
        title={t('lists.newCategory')}
        accent
        onClick={() => {
          setDraft({ id: newCategoryId(), name: '', saved: false });
        }}
      />
    </GroupedSection>
  );

  if (known.length === 0 && draft === undefined) {
    return (
      <>
        <OpenItems
          {...changes}
          header={t(KIND_TEXTS.SHOPPING.items)}
          items={items}
          showEmpty
          onAdd={(text) => {
            void add(text);
          }}
        />
        {categories !== undefined && newCategory}
      </>
    );
  }

  return (
    <>
      {sectionsInOrder(list, known, items ?? []).map(({ category, items: shown }) => (
        <OpenItems
          {...changes}
          key={category?.id ?? 'unnamed'}
          {...(category === undefined
            ? { label: t('lists.unnamedCategory') }
            : { header: category.name })}
          items={items === undefined ? undefined : shown}
          focusAdd={category !== undefined && category.id === focusAddIn}
          onAdd={(text) => {
            void add(text, category?.id);
          }}
        />
      ))}
      {draft !== undefined && !draft.saved && (
        <GroupedSection
          headerField={{
            label: t('lists.categoryName'),
            value: draft.name,
            onChange: (name) => {
              setDraft({ ...draft, name });
            },
            onCommit: commitDraft,
            onCancel: () => {
              setDraft(undefined);
            },
          }}
        />
      )}
      {newCategory}
    </>
  );
}

interface OpenItemsProps extends ItemChanges {
  /** The section's title; without it the section is untitled, named by `label` (no edit mode). */
  header?: string;
  label?: string;
  items: Item[] | undefined;
  /** «Товаров пока нет» in the footer while there are no open Items. */
  showEmpty?: boolean;
  onAdd: (text: string) => void;
  /** The add field takes the focus when it appears. */
  focusAdd?: boolean;
}

/** One section of open Items, ending with the field that adds one. */
function OpenItems({
  header,
  label,
  items,
  showEmpty = false,
  onAdd,
  focusAdd = false,
  list,
  rename,
  setDone,
  remove,
}: OpenItemsProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const texts = KIND_TEXTS[list.kind];
  const editable = useEditableList();
  const [failures, setFailures] = useState<Record<string, SaveFailure | undefined>>({});

  const reportFailure = useCallback((id: string, failure: SaveFailure | undefined) => {
    setFailures((previous) =>
      previous[id] === failure ? previous : { ...previous, [id]: failure },
    );
  }, []);

  const shown = items ?? [];

  return (
    <GroupedSection
      header={header}
      label={label}
      {...(header !== undefined && shown.length > 0 && { edit: editable.edit })}
      messages={[
        ...autoSaveMessages(shown.map((item) => failures[item.id])),
        lines.failure(editable.error),
        showEmpty && items !== undefined && items.length === 0 && { text: t(texts.noItems) },
      ]}
      after={
        items === undefined ? (
          <LoadingRow />
        ) : (
          <AddRow label={t(texts.newItem)} onAdd={onAdd} focus={focusAdd} />
        )
      }
    >
      {shown.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          list={list}
          rename={rename}
          setDone={setDone}
          onFailure={reportFailure}
          busy={editable.deleting === item.id}
          onDelete={() => {
            void editable.remove(item.id, shown.length === 1, () => remove(item));
          }}
        />
      ))}
    </GroupedSection>
  );
}

interface DoneItemsProps {
  list: List;
  items: Item[];
  setDone: (item: Item, done: boolean) => Promise<void>;
  remove: (item: Item) => Promise<void>;
}

/** The Done Items, most recently done first, ticked; deleted like the open ones. */
function DoneItems({ list, items, setDone, remove }: DoneItemsProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const texts = KIND_TEXTS[list.kind];
  const editable = useEditableList();

  return (
    <GroupedSection
      header={t(texts.done)}
      edit={editable.edit}
      messages={[lines.failure(editable.error)]}
    >
      {items.map((item) => (
        <EditableRow
          key={item.id}
          title={item.text}
          muted
          leading={
            <DoneToggle
              label={t(texts.doneToggle, { text: item.text })}
              done
              onChange={(done) => {
                void setDone(item, done);
              }}
            />
          }
          busy={editable.deleting === item.id}
          confirm={{ title: t('lists.confirmDeleteItem', { text: item.text }) }}
          onDelete={() => {
            void editable.remove(item.id, items.length === 1, () => remove(item));
          }}
        />
      ))}
    </GroupedSection>
  );
}

interface ItemRowProps {
  item: Item;
  list: List;
  rename: (item: Item, text: string) => Promise<string>;
  setDone: (item: Item, done: boolean) => Promise<void>;
  /** Tells the section about this row's failed save (or that it cleared), for its footer. */
  onFailure: (id: string, failure: SaveFailure | undefined) => void;
  busy: boolean;
  onDelete: () => void;
}

function ItemRow({ item, list, rename, setDone, onFailure, busy, onDelete }: ItemRowProps) {
  const { t } = useTranslation();
  const save = useCallback((text: string) => rename(item, text.trim()), [item, rename]);
  const text = useAutoSaveText({ name: item.id, saved: item.text, save, required: true });

  const { id } = item;
  useEffect(() => {
    onFailure(id, text.failure);
  }, [id, text.failure, onFailure]);
  useEffect(
    () => () => {
      onFailure(id, undefined);
    },
    [id, onFailure],
  );

  return (
    <EditableRow
      title={item.text}
      leading={
        <DoneToggle
          label={t(KIND_TEXTS[list.kind].doneToggle, { text: item.text })}
          done={false}
          onChange={(done) => {
            void setDone(item, done);
          }}
        />
      }
      busy={busy}
      input={{ ...text.input, label: t(KIND_TEXTS[list.kind].itemText, { text: item.text }) }}
      confirm={{ title: t('lists.confirmDeleteItem', { text: item.text }) }}
      onDelete={onDelete}
    />
  );
}
