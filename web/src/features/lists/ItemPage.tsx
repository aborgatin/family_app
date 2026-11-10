import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useFamilyMembers, type FamilyMember } from '@/features/members';
import {
  autoSaveMessages,
  ConfirmRow,
  DateRow,
  DoneToggle,
  EmptyState,
  GroupedSection,
  InputRow,
  ListRow,
  Page,
  Sections,
  SelectRow,
  TextAreaRow,
  useAutoSaveChoice,
  useAutoSaveText,
} from '@/shared/ui';
import { dueDayText, shortDay } from './dueDates';
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
 * The Item screen (`/lists/:id/items/:itemId`), for an Item of any kind, back to its List: titled
 * «Товар» / «Задача» / «Желание», with the name and the large «Описание» (auto-saved like the
 * row's), the Done toggle with who added the Item and who marked it Done under it, and «Удалить»,
 * which asks and then goes back to the List. An Item that is unknown or disappears while open
 * (deleted, also by the other Member) says so, as does a List that is gone. Data only through
 * `useLists()`, `useItems()` and `useFamilyMembers()`.
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
  const navigate = useNavigate();
  const {
    items,
    doneItems,
    earlierDoneItems,
    rename,
    describe,
    setDueDate,
    setDueTime,
    setAssignee,
    setDone,
    remove,
  } = useItems(list);
  const texts = KIND_TEXTS[list.kind];
  const back = listPath(list.id);
  const loading = items === undefined || doneItems === undefined || earlierDoneItems === undefined;
  // Open, Done, or (a Todo list's) Done before the last 7 days: every Item has its screen.
  const item = loading
    ? undefined
    : [...items, ...doneItems, ...earlierDoneItems].find(({ id }) => id === itemId);

  return (
    <Page title={t(texts.item)} back={{ to: back, title: list.name }}>
      {item === undefined ? (
        loading ? (
          <EmptyState role="status">{t('common.loading')}</EmptyState>
        ) : (
          <EmptyState role="alert">{t(texts.itemNotFound)}</EmptyState>
        )
      ) : (
        <Sections>
          <ItemFields key={item.id} item={item} rename={rename} describe={describe} />
          <DoneSection list={list} item={item} setDone={setDone} />
          {list.kind === 'TODO' &&
            (item.done ? (
              <DoneTodoFields item={item} assignable={assignable(list)} />
            ) : (
              <TodoFields
                key={`${item.id}-todo`}
                item={item}
                assignable={assignable(list)}
                setDueDate={setDueDate}
                setDueTime={setDueTime}
                setAssignee={setAssignee}
              />
            ))}
          <GroupedSection>
            <ConfirmRow
              title={t('ui.delete')}
              confirm={{
                title: t('lists.confirmDeleteItem', { text: item.text }),
                action: t('ui.delete'),
              }}
              onConfirm={() => {
                // Leave first: the Item is gone from the local store as soon as it is deleted.
                void navigate(back, { replace: true });
                void remove(item);
              }}
            />
          </GroupedSection>
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

/** Whether the List's todo items may have an Assignee: only on a Shared list. */
function assignable(list: List): boolean {
  return list.visibility === 'SHARED';
}

interface TodoFieldsProps {
  item: Item;
  /** Whether «Ответственный» is offered. */
  assignable: boolean;
  setDueDate: (item: Item, dueDate: string | null) => Promise<void>;
  setDueTime: (item: Item, dueTime: string | null) => Promise<void>;
  setAssignee: (item: Item, assigneeId: string | null) => Promise<void>;
}

/**
 * A todo item's own fields: its Due date as «Срок» (the day) and «Время» (a time of day, only
 * with a day), auto-saved; removing the day removes the time. On a Shared list also its Assignee
 * as «Ответственный»: «Никто», then each Member by name, saved when chosen. Later todo fields go
 * here too.
 */
function TodoFields({ item, assignable, setDueDate, setDueTime, setAssignee }: TodoFieldsProps) {
  const { t } = useTranslation();
  const members = useFamilyMembers();
  const dueDate = useAutoSaveText({
    name: 'dueDate',
    saved: item.dueDate ?? '',
    save: useCallback(
      async (value: string) => {
        await setDueDate(item, value === '' ? null : value);
        return value;
      },
      [item, setDueDate],
    ),
  });
  const dueTime = useAutoSaveText({
    name: 'dueTime',
    saved: item.dueTime ?? '',
    save: useCallback(
      async (value: string) => {
        await setDueTime(item, value === '' ? null : value);
        return value;
      },
      [item, setDueTime],
    ),
  });
  const assignee = useAutoSaveChoice<string>({
    name: 'assignee',
    saved: item.assigneeId ?? NOBODY,
    save: useCallback(
      async (value: string) => {
        await setAssignee(item, value === NOBODY ? null : value);
        return value;
      },
      [item, setAssignee],
    ),
  });
  const assignees = useMemo(
    () => [
      { value: NOBODY, label: t('lists.assignee.none') },
      ...membersByName(members).map(({ id, displayName }) => ({ value: id, label: displayName })),
    ],
    [members, t],
  );

  return (
    <GroupedSection
      messages={autoSaveMessages([dueDate.failure, dueTime.failure, assignee.failure])}
    >
      <DateRow label={t('lists.dueDate')} {...dueDate.input} />
      <DateRow
        label={t('lists.dueTime')}
        type="time"
        disabled={item.dueDate == null}
        {...dueTime.input}
      />
      {assignable && (
        <SelectRow label={t('lists.assignee.label')} options={assignees} {...assignee.control} />
      )}
    </GroupedSection>
  );
}

/** «Никто» among the choices of «Ответственный»: no Member's id. */
const NOBODY = '';

/** The Members in the order «Ответственный» offers them: by name, ties by id. */
function membersByName(members: ReadonlyMap<string, FamilyMember> | undefined): FamilyMember[] {
  return [...(members?.values() ?? [])].sort(
    (a, b) => a.displayName.localeCompare(b.displayName, 'ru') || a.id.localeCompare(b.id),
  );
}

/** A Done todo item's own fields, read-only: nobody schedules what is already done. */
function DoneTodoFields({ item, assignable }: { item: Item; assignable: boolean }) {
  const { t } = useTranslation();
  const members = useFamilyMembers();
  const assignee = item.assigneeId == null ? undefined : members?.get(item.assigneeId);
  const none = t('lists.due.none');
  return (
    <GroupedSection>
      <ListRow
        title={t('lists.dueDate')}
        value={item.dueDate == null ? none : dueDayText(t, item.dueDate, new Date())}
      />
      <ListRow title={t('lists.dueTime')} value={item.dueTime ?? none} />
      {assignable && (
        <ListRow
          title={t('lists.assignee.label')}
          value={assignee?.displayName ?? t('lists.assignee.none')}
        />
      )}
    </GroupedSection>
  );
}

interface DoneSectionProps {
  list: List;
  item: Item;
  setDone: (item: Item, done: boolean) => Promise<void>;
}

/**
 * The Done toggle, as a row named by the kind's Done word; under it, who added the Item and when
 * and, once Done, who marked it Done and when, each by that Member's Grammatical gender. A line
 * shows once the server has said who and when (an Item added or ticked on this device gets it with
 * the next pull).
 */
function DoneSection({ list, item, setDone }: DoneSectionProps) {
  const { t } = useTranslation();
  const members = useFamilyMembers();
  const texts = KIND_TEXTS[list.kind];
  const creator = by(members, item.creatorId, item.createdAt);
  const doneBy = item.done ? by(members, item.doneById, item.doneAt) : undefined;

  return (
    <GroupedSection
      messages={[
        creator !== undefined && { text: t('lists.addedBy', creator) },
        doneBy !== undefined && { text: t(texts.doneBy, doneBy) },
      ]}
    >
      <ListRow
        title={t(texts.done)}
        leading={
          <DoneToggle
            label={t(texts.doneToggle, { text: item.text })}
            done={item.done}
            onChange={(done) => {
              void setDone(item, done);
            }}
          />
        }
      />
    </GroupedSection>
  );
}

/**
 * What a «Добавила Даша, 12 нояб.» line needs: the Member's name, the day, and their Grammatical
 * gender as the i18n `context` (none: the neutral wording). `undefined` while who or when isn't
 * known on this device.
 */
function by(
  members: ReadonlyMap<string, FamilyMember> | undefined,
  memberId: string | null | undefined,
  at: string | null | undefined,
): { name: string; day: string; context?: 'masculine' | 'feminine' } | undefined {
  const member = memberId == null ? undefined : members?.get(memberId);
  if (member === undefined || at == null) return undefined;
  const context = member.grammaticalGender?.toLowerCase() as 'masculine' | 'feminine' | undefined;
  return {
    name: member.displayName,
    day: shortDay(new Date(at), new Date()),
    ...(context !== undefined && { context }),
  };
}
