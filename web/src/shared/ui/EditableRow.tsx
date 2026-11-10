import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ActionSheet } from './ActionSheet';
import { ROW_FRAME, useEditing, useSectionRow } from './GroupedSection';
import { Icon } from './Icon';
import { MenuChip, type MenuChipProps } from './MenuChip';
import { LEADING_INSET, ROW_LAYOUT, RowInside, TAPPABLE, type RowContentProps } from './ListRow';
import { RowContextMenu } from './RowContextMenu';
import type { SortableRow } from './SortableList';
import { SwipeToDelete } from './SwipeToDelete';

interface EditableRowProps extends Omit<RowContentProps, 'title'> {
  /** Already translated; also names the row's ⊖ button («Удалить «…»»). */
  title: string;
  /** Opens another screen (chevron), as a `ListRow` with `to`; not in edit mode. */
  to?: string;
  /**
   * The action sheet that asks before deleting: the question, and an optional explanation. Without
   * it (and `onDelete`) the row can't be deleted: no ⊖, swipe or right-click menu (e.g. the
   * Unnamed category, which can only be moved).
   */
  confirm?: { title: string; message?: string };
  /** Deletes, after the action sheet. */
  onDelete?: () => void;
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
  /**
   * With `input`: a grey multi-line secondary line under the title (an Item's Description). While
   * the row is being edited (the focus is in it) it is a text field with `placeholder`; out of it a
   * non-empty value is one line cut with «…», its links opening in a new tab, and tapping it starts
   * editing. Not in edit mode.
   */
  secondary?: RowSecondaryProps;
  /**
   * With `secondary`: a `MenuChip` under the secondary line while the row is being edited (an
   * Item's Category). The row stays edited while its menu is open.
   */
  chip?: Omit<MenuChipProps, 'onOpenChange'>;
  /**
   * Points the row out (e.g. an Item added again by name): scrolled into view and tinted with the
   * accent while set (`data-highlighted`), fading back when unset.
   */
  highlighted?: boolean;
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

/** An `EditableRow`'s secondary line (`useAutoSaveText()`'s `input`, plus `label`, `placeholder`). */
export interface RowSecondaryProps {
  /** Already translated; the field's accessible name. */
  label: string;
  /** Already translated; shown in the empty field. */
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Called on blur. */
  onCommit: () => void;
  /** Esc: put the saved value back. */
  onRevert: () => void;
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
  secondary,
  chip,
  highlighted = false,
  ...content
}: EditableRowProps) {
  const { t } = useTranslation();
  const editing = useEditing();
  const [asking, setAsking] = useState(false);
  // The focus is in the row: its secondary line is a text field; `tapped` when the line was
  // tapped, so the field takes the focus.
  const [active, setActive] = useState(false);
  const [tapped, setTapped] = useState(false);
  // The chip's menu is open: the focus is in it, outside the row, and the row is still edited.
  const [choosing, setChoosing] = useState(false);
  const ask = () => {
    setAsking(true);
  };
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlighted]);
  const deletable = confirm !== undefined && onDelete !== undefined;
  const link = to !== undefined && !editing;
  const withSecondary = input !== undefined && secondary !== undefined && !editing;

  const inside =
    input === undefined || editing ? (
      <RowInside title={title} chevron={link} {...content} />
    ) : (
      <RowInside
        {...content}
        title={<RowInput {...input} />}
        below={
          withSecondary &&
          (active || choosing ? (
            <>
              <SecondaryInput {...secondary} takeFocus={tapped} />
              {chip !== undefined && <MenuChip {...chip} onOpenChange={setChoosing} />}
            </>
          ) : (
            secondary.value.trim() !== '' && (
              <SecondaryLine
                text={secondary.value}
                onOpen={() => {
                  setTapped(true);
                  setActive(true);
                }}
              />
            )
          ))
        }
        field
        busy={input.busy || content.busy === true}
      />
    );

  const focusEvents = withSecondary && {
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      // A link in the line takes the focus on press: editing now would remove it before the click.
      if (event.target instanceof HTMLAnchorElement) return;
      setActive(true);
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setActive(false);
      setTapped(false);
    },
  };

  return (
    <div
      role="listitem"
      ref={(element) => {
        row.current = element;
        sortable?.ref(element);
      }}
      style={sortable?.style}
      data-highlighted={highlighted || undefined}
      className={
        `${ROW_FRAME} flex px-0! not-first:before:z-10 ${HIGHLIGHT} ` +
        (highlighted ? 'after:opacity-100 after:duration-150 ' : '') +
        (content.leading === undefined ? '' : LEADING_INSET) +
        (sortable?.dragging === true ? ' z-20 shadow-lg before:hidden' : '')
      }
    >
      <RowContextMenu
        disabled={editing || !deletable}
        items={[{ label: t('ui.delete'), destructive: true, onSelect: ask }]}
      >
        <SwipeToDelete label={t('ui.delete')} onDelete={ask} disabled={editing || !deletable}>
          {editing && !deletable && <span aria-hidden className={DELETE_SLOT} />}
          {editing && deletable && (
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
            <div
              className={`${ROW_LAYOUT} min-w-0 flex-1 pr-4 ${editing ? 'pl-3' : 'pl-4'}`}
              {...focusEvents}
            >
              {inside}
              {editing && sortable?.handle}
            </div>
          )}
        </SwipeToDelete>
      </RowContextMenu>
      {deletable && (
        <ActionSheet
          open={asking}
          onOpenChange={setAsking}
          title={confirm.title}
          message={confirm.message}
          actions={[{ label: t('ui.delete'), destructive: true, onSelect: onDelete }]}
        />
      )}
    </div>
  );
}

/** A tint over the whole row (above its swipe layer), shown while `highlighted`. */
const HIGHLIGHT =
  'after:pointer-events-none after:absolute after:inset-0 after:z-10 after:bg-accent/15 ' +
  'after:opacity-0 after:transition-opacity after:duration-700';

/**
 * Where an edit-mode row's ⊖ goes (`pl-4` and a 22px circle, at least 44px wide on touch): left
 * empty on a row that can't be deleted, so its title lines up with the others.
 */
const DELETE_SLOT = 'shrink-0 pl-4 w-[calc(1rem+1.375rem)] pointer-coarse:min-w-11';

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

/** The secondary line while the row is edited: a grey multi-line field that grows with its text. */
function SecondaryInput({
  label,
  placeholder,
  value,
  onChange,
  onCommit,
  onRevert,
  takeFocus,
}: RowSecondaryProps & {
  /** The line was tapped: the field takes the focus when it shows, the caret at the end. */
  takeFocus: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = ref.current;
    if (field === null) return;
    field.style.height = 'auto';
    field.style.height = `${String(field.scrollHeight)}px`;
  }, [value]);

  useLayoutEffect(() => {
    const field = ref.current;
    if (field === null || !takeFocus) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [takeFocus]);

  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onRevert();
        }
      }}
      className={
        '-mx-1 mt-0.5 block w-[calc(100%+0.5rem)] min-w-0 resize-none overflow-hidden rounded-md ' +
        'bg-transparent px-1 text-subhead text-secondary-label outline-none ' +
        'placeholder:text-tertiary-label pointer-fine:focus-visible:outline-2 ' +
        'pointer-fine:focus-visible:outline-solid pointer-fine:focus-visible:outline-accent'
      }
    />
  );
}

/**
 * The secondary line out of editing: one grey line cut with «…», its links opening in a new tab;
 * a tap beside them starts editing.
 */
function SecondaryLine({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <span
      onClick={onOpen}
      className="mt-0.5 block cursor-text truncate text-subhead text-secondary-label"
    >
      {linkParts(text).map((part, n) =>
        part.link ? (
          <a
            key={n}
            href={part.text}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
            }}
            className="text-accent underline"
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </span>
  );
}

/** An http(s) address, up to a space; punctuation at its end belongs to the sentence. */
const LINK = /https?:\/\/\S+?(?=[.,;:!?)»"']*(?:\s|$))/g;

/** The text cut into plain parts and links, in order. */
function linkParts(text: string): { text: string; link: boolean }[] {
  const parts: { text: string; link: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), link: false });
    parts.push({ text: match[0], link: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), link: false });
  return parts;
}
