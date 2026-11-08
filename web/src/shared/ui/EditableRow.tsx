import { useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ActionSheet } from './ActionSheet';
import { ROW_FRAME, useEditing } from './GroupedSection';
import { Icon } from './Icon';
import { LEADING_INSET, ROW_LAYOUT, RowInside, TAPPABLE, type RowContentProps } from './ListRow';
import { RowContextMenu } from './RowContextMenu';
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
   * Shown at the right in edit mode: a drag handle for a list that can be reordered (Child
   * fields). The `ref` and the handle's listeners come from the sortable list around the rows.
   */
  handle?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A row of an edit-mode list: a `GroupedSection` with `edit`. Deleting it always asks with the
 * action sheet, and starts from any of:
 * - edit mode: ⊖ at the left (a button, so the keyboard reaches it), and `handle` at the right;
 * - touch: a swipe left reveals «Удалить» (`SwipeToDelete`), out of edit mode;
 * - fine pointer: right-click → «Удалить» (`RowContextMenu`), out of edit mode.
 */
export function EditableRow({
  title,
  to,
  confirm,
  onDelete,
  handle,
  ref,
  ...content
}: EditableRowProps) {
  const { t } = useTranslation();
  const editing = useEditing();
  const [asking, setAsking] = useState(false);
  const ask = () => {
    setAsking(true);
  };
  const link = to !== undefined && !editing;

  const inside = <RowInside title={title} chevron={link} {...content} />;

  return (
    <div
      role="listitem"
      ref={ref}
      className={
        `${ROW_FRAME} flex px-0! not-first:before:z-10 ` +
        (content.leading === undefined ? '' : LEADING_INSET)
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
              {editing && handle}
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
