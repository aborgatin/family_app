import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useFamilyMembers, type FamilyMember } from '@/features/members';
import {
  ActionSheet,
  AddRow,
  DoneToggle,
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  type MenuChipProps,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  useReportFailure,
  useRowFailures,
  type ReportFailure,
  type RowCaptionPart,
  type SectionMessage,
} from '@/shared/ui';
import { dueDateText, isOverdue } from './dueDates';
import { listDoneEarlierPath, listItemPath } from './listPaths';
import { KIND_TEXTS, type Category, type Item, type List } from './listTypes';
import {
  itemsByCategory,
  newCategoryId,
  UNNAMED_CATEGORY_KEY,
  useCategories,
} from './useCategories';
import { useItemHistory } from './useItemHistory';
import { useItems } from './useItems';

interface ItemsSectionProps {
  list: List;
}

/**
 * The List screen's Items. The open ones come first, headed by the kind's Items («Товары» /
 * «Задачи» / «Желания»): each has a Done toggle, its text is edited in place and auto-saved, edit
 * mode («Изменить»), a grey «Описание» line under an Item being edited (its Description), a
 * swipe or right-click deletes after the action sheet, and the last row adds an Item («Новый
 * товар», Enter keeps the focus for the next). With no open Items the footer says «Товаров пока
 * нет». A Shopping list with named Categories shows its open Items in one section per Category
 * instead (`ShoppingItems`). The Done ones follow in their own group, headed by the kind's
 * Done («Куплено» / «Выполнено» / «Исполнено»), ticked; ticking one off again puts it back among
 * the open ones; a Shopping list's are headed by «Очистить». A Todo list's «Выполнено» has only
 * those done in the last 7 days and, while there are older ones, ends with the row «Выполненные
 * ранее», which opens them (`DoneEarlierPage`). All data access goes through
 * `useItems()` and `useCategories()` (the local store + Outbox).
 */
export function ItemsSection({ list }: ItemsSectionProps) {
  const { t } = useTranslation();
  const texts = KIND_TEXTS[list.kind];
  const {
    items,
    doneItems,
    earlierDoneItems,
    add: addItem,
    rename,
    describe,
    move,
    setDone,
    remove,
  } = useItems(list);
  // The open Item just added again by name: highlighted for a moment.
  const [highlighted, setHighlighted] = useState<string>();
  const rowProps = { list, highlighted, rename, describe, move, setDone, remove };

  useEffect(() => {
    if (highlighted === undefined) return;
    const timer = setTimeout(() => {
      setHighlighted(undefined);
    }, HIGHLIGHT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [highlighted]);

  const add = useCallback(
    (text: string, categoryId?: string, description?: string) => {
      void addItem(text, categoryId, description).then((open) => {
        if (open !== undefined) setHighlighted(open.id);
      });
    },
    [addItem],
  );

  return (
    <>
      {list.kind === 'SHOPPING' ? (
        <ShoppingItems {...rowProps} items={items} add={add} />
      ) : (
        <OpenItems
          {...rowProps}
          header={t(texts.items)}
          items={items}
          showEmpty
          onAdd={(text, description) => {
            add(text, undefined, description);
          }}
        />
      )}
      {doneItems !== undefined &&
        earlierDoneItems !== undefined &&
        doneItems.length + earlierDoneItems.length > 0 && (
          <DoneItems
            list={list}
            header={t(texts.done)}
            items={doneItems}
            setDone={setDone}
            remove={remove}
            after={
              earlierDoneItems.length > 0 && (
                <ListRow title={t('lists.doneEarlier')} to={listDoneEarlierPath(list.id)} />
              )
            }
          />
        )}
    </>
  );
}

/** How long an open Item added again by name stays highlighted. */
const HIGHLIGHT_MS = 1500;

/** What every open Item row needs: its List, which one is highlighted, and `useItems()`' changes. */
interface ItemRowContext {
  list: List;
  highlighted: string | undefined;
  rename: (item: Item, text: string) => Promise<string>;
  describe: (item: Item, description: string) => Promise<string>;
  move: (item: Item, categoryId: string | null) => Promise<void>;
  setDone: (item: Item, done: boolean) => Promise<void>;
  remove: (item: Item) => Promise<void>;
}

interface ShoppingItemsProps extends ItemRowContext {
  items: Item[] | undefined;
  add: (text: string, categoryId?: string, description?: string) => void;
}

/**
 * A Shopping list's open Items. With no named Categories, the one «Товары» section, as on any
 * List. With some, one section per Category, headed by its name, and an untitled one for the
 * Unnamed category, in their order; each shows even with no open Items and ends with its own
 * «Новый товар», which adds into it. Then the «Новая категория» row: it adds a Category at the end
 * with its title being typed, and Enter there moves to that Category's «Новый товар».
 */
function ShoppingItems({ items, add, ...rowContext }: ShoppingItemsProps) {
  const { t } = useTranslation();
  const { list } = rowContext;
  const { categories, add: addCategory } = useCategories(list);
  const history = useItemHistory(list);
  // A Category whose title is being typed (not saved yet), or saved and not read back yet.
  const [draftState, setDraftState] = useState<{ id: string; name: string; saved: boolean }>();
  // The Category whose «Новый товар» takes the focus when it appears: the one just named.
  const [focusAddIn, setFocusAddIn] = useState<string>();

  const known = categories ?? [];
  // Once read back from the store, the new Category is an ordinary one: the draft is done with, so
  // a later delete of that Category (from another device) leaves no trace of it here.
  const readBack = draftState !== undefined && known.some(({ id }) => id === draftState.id);
  if (readBack) setDraftState(undefined);
  const draft = readBack ? undefined : draftState;

  function commitDraft() {
    if (draft === undefined || draft.saved) return;
    const name = draft.name.trim();
    if (name === '') {
      setDraftState(undefined);
      return;
    }
    setDraftState({ ...draft, saved: true });
    setFocusAddIn(draft.id);
    void addCategory(draft.id, name);
  }

  const newCategory = (
    <GroupedSection>
      <ListRow
        title={t('lists.newCategory')}
        accent
        onClick={() => {
          setDraftState({ id: newCategoryId(), name: '', saved: false });
        }}
      />
    </GroupedSection>
  );

  if (known.length === 0 && draft === undefined) {
    return (
      <>
        <OpenItems
          {...rowContext}
          header={t(KIND_TEXTS.SHOPPING.items)}
          items={items}
          showEmpty
          history={history}
          onAdd={(text, description) => {
            add(text, undefined, description);
          }}
        />
        {categories !== undefined && newCategory}
      </>
    );
  }

  return (
    <>
      {itemsByCategory(list, known, items ?? []).map(({ category, items: shown }) => (
        <OpenItems
          {...rowContext}
          key={category?.id ?? UNNAMED_CATEGORY_KEY}
          {...(category === undefined
            ? { label: t('lists.unnamedCategory') }
            : { header: category.name })}
          items={items === undefined ? undefined : shown}
          categories={known}
          focusAdd={category !== undefined && category.id === focusAddIn}
          history={history}
          onAdd={(text, description) => {
            add(text, category?.id, description);
          }}
        />
      ))}
      {draft !== undefined && !draft.saved && (
        <GroupedSection
          headerField={{
            label: t('lists.categoryName'),
            value: draft.name,
            onChange: (name) => {
              setDraftState({ ...draft, name });
            },
            onCommit: commitDraft,
            onCancel: () => {
              setDraftState(undefined);
            },
          }}
        />
      )}
      {newCategory}
    </>
  );
}

interface OpenItemsProps extends ItemRowContext {
  /** The section's title; without it the section is untitled, named by `label`. */
  header?: string;
  label?: string;
  items: Item[] | undefined;
  /** «Товаров пока нет» in the footer while there are no open Items. */
  showEmpty?: boolean;
  onAdd: (text: string, description?: string) => void;
  /** The add field takes the focus when it appears. */
  focusAdd?: boolean;
  /** The Item history: suggestions for what is typed in the add field (a Shopping list's). */
  history?: ReturnType<typeof useItemHistory>;
  /** The List's named Categories, if any: each Item has the Category chip while edited. */
  categories?: readonly Category[];
}

/** One section of open Items, ending with the field that adds one. */
function OpenItems({
  header,
  label,
  items,
  showEmpty = false,
  onAdd,
  focusAdd = false,
  history,
  categories,
  list,
  rename,
  describe,
  move,
  setDone,
  remove,
  highlighted,
}: OpenItemsProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const texts = KIND_TEXTS[list.kind];
  const editable = useEditableList();
  const failures = useRowFailures();
  const members = useFamilyMembers();

  const shown = items ?? [];

  return (
    <GroupedSection
      header={header}
      label={label}
      {...(shown.length > 0 && { edit: editable.edit })}
      messages={[
        ...failures.messages,
        lines.failure(editable.error),
        showEmpty && items !== undefined && items.length === 0 && { text: t(texts.noItems) },
      ]}
      after={
        items === undefined ? (
          <LoadingRow />
        ) : (
          <AddRow
            label={t(texts.newItem)}
            onAdd={onAdd}
            focus={focusAdd}
            descriptionLabel={t('lists.description')}
            {...(history !== undefined && {
              suggest: history.namesStarting,
              onRemoveSuggestion: (name: string) => {
                void history.remove(name);
              },
            })}
          />
        )
      }
    >
      {shown.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          list={list}
          members={members}
          rename={rename}
          describe={describe}
          categories={categories}
          move={move}
          setDone={setDone}
          highlighted={highlighted === item.id}
          onFailure={failures.report}
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
  /** The section's title. */
  header: string;
  items: Item[];
  /** A row under the Items, on the same cell (a Todo list's «Выполненные ранее»). */
  after?: ReactNode;
  /** Footer lines under the section's own. */
  messages?: readonly (SectionMessage | false)[];
  setDone: (item: Item, done: boolean) => Promise<void>;
  remove: (item: Item) => Promise<void>;
}

/**
 * A section of Done Items, most recently done first, ticked; deleted like the open ones: the List
 * screen's Done section and a Todo list's «Выполненные ранее» screen. A Shopping list's
 * are headed by «Очистить», which asks, then deletes every one shown here (one Item delete each;
 * one ticked off elsewhere and not pulled yet stays).
 */
export function DoneItems({
  list,
  header,
  items,
  after,
  messages = [],
  setDone,
  remove,
}: DoneItemsProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const texts = KIND_TEXTS[list.kind];
  const editable = useEditableList();
  const [clearing, setClearing] = useState(false);
  const members = useFamilyMembers();

  return (
    <>
      <GroupedSection
        header={header}
        {...(items.length > 0 && { edit: editable.edit })}
        after={after}
        {...(list.kind === 'SHOPPING' && {
          action: {
            label: t('lists.clearBought'),
            onClick: () => {
              setClearing(true);
            },
          },
        })}
        messages={[lines.failure(editable.error), ...messages]}
      >
        {items.map((item) => (
          <EditableRow
            key={item.id}
            title={item.text}
            textTo={listItemPath(list.id, item.id)}
            muted
            caption={itemCaption(list, item, members, t)}
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
      <ActionSheet
        open={clearing}
        onOpenChange={setClearing}
        title={t('lists.confirmClearBought', { count: items.length })}
        actions={[
          {
            label: t('lists.clearBought'),
            destructive: true,
            onSelect: () => {
              for (const item of items) void remove(item);
            },
          },
        ]}
      />
    </>
  );
}

interface ItemRowProps {
  item: Item;
  list: List;
  /** The Family's Members, for the Assignee's name on a todo item's row line. */
  members: ReadonlyMap<string, FamilyMember> | undefined;
  rename: (item: Item, text: string) => Promise<string>;
  describe: (item: Item, description: string) => Promise<string>;
  /** The List's named Categories, if any: the Category chip. */
  categories: readonly Category[] | undefined;
  move: (item: Item, categoryId: string | null) => Promise<void>;
  setDone: (item: Item, done: boolean) => Promise<void>;
  /** Just added again by name: scrolled to and highlighted. */
  highlighted: boolean;
  /** Tells the section about this row's failed save (or that it cleared), for its footer. */
  onFailure: ReportFailure;
  busy: boolean;
  onDelete: () => void;
}

function ItemRow({
  item,
  list,
  members,
  rename,
  describe,
  categories,
  move,
  setDone,
  highlighted,
  onFailure,
  busy,
  onDelete,
}: ItemRowProps) {
  const { t } = useTranslation();
  const save = useCallback((text: string) => rename(item, text.trim()), [item, rename]);
  const text = useAutoSaveText({ name: item.id, saved: item.text, save, required: true });
  const saveDescription = useCallback((value: string) => describe(item, value), [item, describe]);
  const description = useAutoSaveText({
    name: `${item.id}-description`,
    saved: item.description ?? '',
    save: saveDescription,
  });

  useReportFailure(onFailure, text.input.name, text.failure);
  useReportFailure(onFailure, description.input.name, description.failure);

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
      highlighted={highlighted}
      input={{ ...text.input, label: t(KIND_TEXTS[list.kind].itemText, { text: item.text }) }}
      secondary={{
        ...description.input,
        label: t('lists.itemDescription', { text: item.text }),
        placeholder: t('lists.description'),
      }}
      {...(categories !== undefined &&
        categories.length > 0 && { chip: categoryChip(list, categories, item, move, t) })}
      details={{ label: t('lists.itemDetails'), to: listItemPath(list.id, item.id) }}
      caption={itemCaption(list, item, members, t)}
      confirm={{ title: t('lists.confirmDeleteItem', { text: item.text }) }}
      onDelete={onDelete}
    />
  );
}

/**
 * The small line under a todo item's name and Description: its Due date, the repeat mark ↻ when an
 * open Item has a Repeat, then on a Shared list its Assignee's name («15 нояб., 15:00 ↻ · Даша»), or the name
 * alone without a Due date. An overdue Due date is red on an open Item. By the device's clock, read
 * when the row renders.
 */
function itemCaption(
  list: List,
  item: Item,
  members: ReadonlyMap<string, FamilyMember> | undefined,
  t: TFunction,
): RowCaptionPart[] {
  if (list.kind !== 'TODO') return [];
  const now = new Date();
  const due = dueDateText(t, item, now);
  // A Private list's Items have no Assignee: one the server hasn't removed yet isn't shown.
  const assignee =
    list.visibility === 'SHARED' && item.assigneeId != null
      ? members?.get(item.assigneeId)?.displayName
      : undefined;
  return [
    // Overdue is red on an open Item only: a Done one is no longer late.
    due !== undefined && {
      text: due,
      ...(!item.done && isOverdue(item, now) && { tone: 'destructive' as const }),
    },
    // A Done Item's Repeat has gone to its next occurrence (ADR-0009): one ticked here and not
    // pulled back yet still holds it, and the row leaves the mark out at once.
    due !== undefined && !item.done && item.repeat != null && { text: t('lists.repeat.mark') },
    assignee !== undefined && {
      text: due === undefined ? assignee : t('lists.assignee.afterDueDate', { name: assignee }),
    },
  ].filter((part) => part !== false);
}

/**
 * The Category chip of an Item being edited: its Category's name or «Без категории»; the menu has
 * the Categories in their order, «Без категории» in the Unnamed category's place, the current one
 * ticked, and picking one moves the Item there.
 */
function categoryChip(
  list: List,
  categories: readonly Category[],
  item: Item,
  move: (item: Item, categoryId: string | null) => Promise<void>,
  t: TFunction,
): MenuChipProps {
  const unnamed = t('lists.unnamedCategory');
  const order = itemsByCategory(list, categories, [item]);
  const current = order.find(({ items }) => items.length > 0)?.category;
  const label = current?.name ?? unnamed;
  return {
    label,
    accessibleLabel: t('lists.itemCategory', { name: label }),
    choices: order.map(({ category }) => ({
      label: category?.name ?? unnamed,
      checked: category === current,
      muted: category === undefined,
      onSelect: () => {
        if (category !== current) void move(item, category?.id ?? null);
      },
    })),
  };
}
