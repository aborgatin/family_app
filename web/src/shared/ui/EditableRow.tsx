import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ActionSheet } from './ActionSheet';
import { ROW_FRAME, useEditing, useSectionRow } from './GroupedSection';
import { Icon } from './Icon';
import { LEADING_INSET, ROW_LAYOUT, RowInside, TAPPABLE, type RowContentProps } from './ListRow';
import { RowContextMenu } from './RowContextMenu';
import type { SortableRow } from './SortableList';
import { SwipeToDelete } from './SwipeToDelete';

interface EditableRowProps extends Omit<RowContentProps, 'title'> {
  /** Already translated; also names the row's ⊖ button («Удалить «…»»). */
  title: string;
  /** Opens another screen (chevron), as a `ListRow` with `to`; not in edit mode. */
  to?: string;
  /** The action sheet that asks before deleting: the question, and an optional explanation. */
  confirm: { title: string; message?: string };
  /** Deletes, after the action sheet. */
  onDelete: () => void;
  /**
   * From a `SortableList` around the rows (a list that can be reordered, e.g. Child fields): the
   * drag handle shown at the right in edit mode, and what moves the row while dragging.
   */
  sortable?: SortableRow;
  /**
   * Makes the title a text field out of edit mode, for renaming in place: spread `input` of
   * `useAutoSaveText()` and add a translated `label` (the field's accessible name). In edit mode
   * the row shows `title` instead.
   */
  input?: RowInputProps;
}

/** An `EditableRow`'s title as a text field (`useAutoSaveText()`'s `input`, plus a `label`). */
export interface RowInputProps {
  /** Already translated; the field's accessible name (it has no visible label). */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Called on blur and on Enter. */
  onCommit: () => void;
  /** Esc: put the saved value back. */
  onRevert: () => void;
  busy: boolean;
}

/**
 * A row of an edit-mode list: a `GroupedSection` with `edit`. Deleting it always asks with the
 * action sheet, and starts from any of:
 * - edit mode: ⊖ at the left (a button, so the keyboard reaches it), and the drag handle at the
 *   right in a `SortableList`;
 * - touch: a swipe left reveals «Удалить» (`SwipeToDelete`), out of edit mode;
 * - fine pointer: right-click → «Удалить» (`RowContextMenu`), out of edit mode.
 */
export function EditableRow({
  title,
  to,
  confirm,
  onDelete,
  sortable,
  input,
  ...content
}: EditableRowProps) {
  const { t } = useTranslation();
  const editing = useEditing();
  const [asking, setAsking] = useState(false);
  const ask = () => {
    setAsking(true);
  };
  const link = to !== undefined && !editing;

  const inside =
    input === undefined || editing ? (
      <RowInside title={title} chevron={link} {...content} />
    ) : (
      <RowInside
        {...content}
        title={<RowInput {...input} />}
        field
        busy={input.busy || content.busy === true}
      />
    );

  return (
    <div
      role="listitem"
      ref={sortable?.ref}
      style={sortable?.style}
      className={
        `${ROW_FRAME} flex px-0! not-first:before:z-10 ` +
        (content.leading === undefined ? '' : LEADING_INSET) +
        (sortable?.dragging === true ? ' z-20 shadow-lg before:hidden' : '')
      }
    >
      <RowContextMenu
        disabled={editing}
        items={[{ label: t('ui.delete'), destructive: true, onSelect: ask }]}
      >
        <SwipeToDelete label={t('ui.delete')} onDelete={ask} disabled={editing}>
          {editing && (
            <button
              type="button"
              aria-label={t('ui.deleteRow', { title })}
              onClick={ask}
              className={
                'flex shrink-0 cursor-pointer items-center pl-4 text-destructive ' +
                'pointer-coarse:min-w-11 focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
                'focus-visible:outline-accent'
              }
            >
              <span className="flex size-5.5 items-center justify-center rounded-full bg-destructive text-on-accent">
                <Icon name="minus" size={16} />
              </span>
            </button>
          )}
          {link ? (
            <RouterLink to={to} className={`${ROW_LAYOUT} ${TAPPABLE} min-w-0 flex-1 px-4`}>
              {inside}
            </RouterLink>
          ) : (
            <div className={`${ROW_LAYOUT} min-w-0 flex-1 pr-4 ${editing ? 'pl-3' : 'pl-4'}`}>
              {inside}
              {editing && sortable?.handle}
            </div>
          )}
        </SwipeToDelete>
      </RowContextMenu>
      <ActionSheet
        open={asking}
        onOpenChange={setAsking}
        title={confirm.title}
        message={confirm.message}
        actions={[{ label: t('ui.delete'), destructive: true, onSelect: onDelete }]}
      />
    </div>
  );
}

/** The title of a row renamed in place: a text field that looks like the title. */
function RowInput({ label, name, value, onChange, onCommit, onRevert }: RowInputProps) {
  const { describedBy, invalid } = useSectionRow(name);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onRevert();
    }
  }

  return (
    <input
      type="text"
      name={name}
      aria-label={label}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={
        '-mx-1 block w-[calc(100%+0.5rem)] min-w-0 rounded-md bg-transparent px-1 text-body ' +
        'outline-none pointer-fine:focus-visible:outline-2 pointer-fine:focus-visible:outline-solid ' +
        'pointer-fine:focus-visible:outline-accent ' +
        (invalid ? 'text-destructive' : 'text-label')
      }
    />
  );
}
