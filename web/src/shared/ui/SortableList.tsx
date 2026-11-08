import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditing } from './GroupedSection';
import { Icon } from './Icon';

/** What a `SortableList` gives each row: pass it to the `EditableRow` as `sortable`. */
export interface SortableRow {
  ref: Ref<HTMLDivElement>;
  style: CSSProperties;
  /** The drag handle, shown at the right of the row in edit mode. */
  handle: ReactNode;
  /** The row is being dragged (drawn above the others). */
  dragging: boolean;
}

interface SortableListProps<T> {
  /** In their order. */
  items: readonly T[];
  itemId: (item: T) => string;
  /** The row's title, already translated: names its handle and the screen-reader announcements. */
  itemTitle: (item: T) => string;
  /**
   * Called when a row is dropped at another place, with its index in the list after the move.
   * Until a returned promise settles the list shows the new order; if `items` didn't change by
   * then (the move failed), the rows go back.
   */
  onMove: (item: T, to: number) => Promise<unknown> | undefined;
  /** Renders a row: an `EditableRow` with `sortable`. */
  children: (item: T, sortable: SortableRow) => ReactNode;
}

/**
 * The rows of an edit-mode list (`GroupedSection` with `edit`) that can be reordered, with
 * dnd-kit: in edit mode each row gets a drag handle at the right. Mouse and touch drag the handle;
 * with the keyboard, Space or Enter on the handle picks the row up, arrows move it, Space or Enter
 * puts it down, Esc puts it back. Screen readers hear each step in Russian.
 */
export function SortableList<T>({
  items,
  itemId,
  itemTitle,
  onMove,
  children,
}: SortableListProps<T>) {
  const { t } = useTranslation();
  const editing = useEditing();
  const [pending, setPending] = useState<{ id: string; to: number }>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const shown = pending === undefined ? items : moved(items, itemId, pending);
  const ids = shown.map(itemId);
  const titleOf = (id: UniqueIdentifier) => {
    const item = shown.find((candidate) => itemId(candidate) === id);
    return item === undefined ? '' : itemTitle(item);
  };
  const place = (id: UniqueIdentifier | undefined) => ({
    position: ids.indexOf(String(id)) + 1,
    count: ids.length,
  });

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('ui.sortable.picked', { title: titleOf(active.id), ...place(active.id) }),
    onDragOver: ({ active, over }) =>
      over === null
        ? undefined
        : t('ui.sortable.moved', { title: titleOf(active.id), ...place(over.id) }),
    onDragEnd: ({ active, over }) =>
      t('ui.sortable.dropped', { title: titleOf(active.id), ...place(over?.id ?? active.id) }),
    onDragCancel: ({ active }) => t('ui.sortable.cancelled', { title: titleOf(active.id) }),
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (over === null || over.id === active.id) return;
    const item = shown.find((candidate) => itemId(candidate) === active.id);
    const to = ids.indexOf(String(over.id));
    if (item === undefined || to === -1) return;
    const move = { id: itemId(item), to };
    setPending(move);
    void Promise.resolve(onMove(item, to)).finally(() => {
      setPending((now) => (now === move ? undefined : now));
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('ui.sortable.instructions') },
      }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={!editing}>
        {shown.map((item) => (
          <SortableItem key={itemId(item)} id={itemId(item)} title={itemTitle(item)}>
            {(sortable) => children(item, sortable)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

/** `items` with the one at `id` moved to index `to`. */
function moved<T>(
  items: readonly T[],
  itemId: (item: T) => string,
  { id, to }: { id: string; to: number },
) {
  const item = items.find((candidate) => itemId(candidate) === id);
  if (item === undefined) return items;
  const others = items.filter((candidate) => candidate !== item);
  return [...others.slice(0, to), item, ...others.slice(to)];
}

function SortableItem({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: (sortable: SortableRow) => ReactNode;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, attributes: { roleDescription: t('ui.sortable.roleDescription') } });

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={t('ui.moveRow', { title })}
      className={
        'flex shrink-0 cursor-grab touch-none items-center justify-center self-stretch ' +
        'text-secondary-label active:cursor-grabbing pointer-coarse:-mr-2 pointer-coarse:min-w-11 ' +
        'pointer-fine:min-w-7 focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
        'focus-visible:outline-accent'
      }
    >
      <Icon name="reorder" size={20} />
    </button>
  );

  return children({
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    handle,
    dragging: isDragging,
  });
}
