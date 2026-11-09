import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AddRow,
  autoSaveMessages,
  DoneToggle,
  EditableRow,
  GroupedSection,
  LoadingRow,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  type SaveFailure,
} from '@/shared/ui';
import { KIND_TEXTS, type Item, type List } from './listTypes';
import { useItems } from './useItems';

interface ItemsSectionProps {
  list: List;
}

/**
 * The List screen's Items. The open ones come first, headed by the kind's Items («Товары» /
 * «Задачи» / «Желания»): each has a Done toggle, its text is edited in place and auto-saved, edit
 * mode («Изменить»), a swipe or right-click deletes after the action sheet, and the last row adds
 * an Item («Новый товар», Enter keeps the focus for the next). With no open Items the footer says
 * «Товаров пока нет». The Done ones follow in their own group, headed by the kind's Done
 * («Куплено» / «Выполнено» / «Исполнено»), ticked; ticking one off again puts it back among the
 * open ones. All data access goes through `useItems()` (the local store + Outbox).
 */
export function ItemsSection({ list }: ItemsSectionProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const texts = KIND_TEXTS[list.kind];
  const { items, doneItems, add, rename, setDone, remove, saveFailure } = useItems(list.id);
  const editable = useEditableList();
  const [failures, setFailures] = useState<Record<string, SaveFailure | undefined>>({});

  const reportFailure = useCallback((id: string, failure: SaveFailure | undefined) => {
    setFailures((previous) =>
      previous[id] === failure ? previous : { ...previous, [id]: failure },
    );
  }, []);

  const shown = items ?? [];

  return (
    <>
      <GroupedSection
        header={t(texts.items)}
        {...(shown.length > 0 && { edit: editable.edit })}
        messages={[
          ...autoSaveMessages(shown.map((item) => failures[item.id])),
          lines.failure(editable.error),
          lines.failure(saveFailure),
          items !== undefined && items.length === 0 && { text: t(texts.noItems) },
        ]}
        after={
          items === undefined ? (
            <LoadingRow />
          ) : (
            <AddRow
              label={t(texts.newItem)}
              onAdd={(text) => {
                void add(text);
              }}
            />
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
      {doneItems !== undefined && doneItems.length > 0 && (
        <DoneItems list={list} items={doneItems} setDone={setDone} remove={remove} />
      )}
    </>
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
