import { Children, createContext, use, useId, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { FIELD_FOCUS } from './fieldFocus';

/** One line in a group's footer. */
export interface SectionMessage {
  /** Already translated. */
  text: string;
  /** `error` is red; `hint` (the default) is quiet. */
  tone?: 'hint' | 'error';
  /**
   * The `name` of the row (or rows) it is about: those rows are described by it (and marked
   * invalid by an error). Without it the line is about the whole group, and an error is announced
   * (`alert`).
   */
  row?: string | readonly string[];
  /**
   * Announce it: an error about a row as an `alert` (e.g. a save that failed after blur), a hint
   * as a `status` (e.g. «Пароль изменён» after coming back from the password screen).
   */
  announce?: boolean;
  /** A small text button after the text, e.g. «Повторить». */
  action?: { label: string; onClick: () => void };
}

/** A header being typed: the title of a group that is being created (e.g. a new Category). */
export interface SectionHeaderField {
  /** Already translated; the placeholder, and the field's and the group's accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter, or leaving the field. */
  onCommit: () => void;
  /** Esc. */
  onCancel: () => void;
}

interface GroupedSectionProps {
  /** Already translated; shown in small capitals above the group, and names it (a region). */
  header?: string;
  /**
   * Instead of `header`: a text field in its place, focused when it appears, for a group whose
   * title is being written. It names the group by its `label`.
   */
  headerField?: SectionHeaderField;
  /**
   * Already translated; names an untitled group (no `header`) for assistive technology only, so
   * it is still a region: e.g. the Unnamed category, which shows no title.
   */
  label?: string;
  /** The footer's lines, top to bottom; `false` and `undefined` entries are skipped. */
  messages?: readonly (SectionMessage | false | undefined)[];
  /**
   * Makes the rows an edit-mode list (`EditableRow`s): «Изменить» / «Готово» in the header turns
   * edit mode on and off. An untitled group (`label`) shows the button alone, where a header would
   * be.
   */
  edit?: { editing: boolean; onEditingChange: (editing: boolean) => void };
  /**
   * A small text button at the right of the header, before «Изменить» (e.g. «Очистить»). Needs a
   * `header`.
   */
  action?: { label: string; onClick: () => void };
  /**
   * Rows after an edit-mode list's rows, on the same cell but not part of the list (e.g.
   * «Добавить ребёнка»).
   */
  after?: ReactNode;
  children?: ReactNode;
}

const EditContext = createContext(false);

/** Whether the `GroupedSection` around a row is in edit mode. */
export function useEditing() {
  return use(EditContext);
}

interface SectionRows {
  /** Ids of the footer lines about a row, for its `aria-describedby`. */
  describedBy: (row: string) => string | undefined;
  invalid: (row: string) => boolean;
}

const SectionContext = createContext<SectionRows>({
  describedBy: () => undefined,
  invalid: () => false,
});

/** How a row inside a GroupedSection finds the footer lines about it. */
export function useSectionRow(row: string) {
  const section = use(SectionContext);
  return { describedBy: section.describedBy(row), invalid: section.invalid(row) };
}

/** An error about the whole group, or one to announce, is an `alert`; an announced hint a `status`. */
function lineRole(message: SectionMessage) {
  if (message.tone === 'error') {
    return message.row === undefined || message.announce === true ? 'alert' : undefined;
  }
  return message.announce === true ? 'status' : undefined;
}

function isAbout(message: SectionMessage, row: string) {
  return typeof message.row === 'string' ? message.row === row : message.row?.includes(row);
}

/**
 * A grouped inset list as in the iPhone Settings app: an optional header, the rows on one rounded
 * cell with hairlines between them, and a footer for hints and errors. The rows share a
 * two-column grid, so inline labels line up and the values start at the same edge.
 */
export function GroupedSection({
  header,
  headerField,
  label,
  messages = [],
  edit,
  action,
  after,
  children,
}: GroupedSectionProps) {
  const { t } = useTranslation();
  const id = useId();
  const headerId = `${id}-header`;
  const lines = messages
    .filter((message) => message !== false && message !== undefined)
    .map((message, index) => ({ ...message, id: `${id}-${String(index)}` }));

  const rows: SectionRows = {
    describedBy: (row) => {
      const ids = lines.filter((line) => isAbout(line, row)).map((line) => line.id);
      return ids.length === 0 ? undefined : ids.join(' ');
    },
    invalid: (row) => lines.some((line) => isAbout(line, row) && line.tone === 'error'),
  };

  return (
    <section
      aria-labelledby={header === undefined ? undefined : headerId}
      aria-label={header === undefined ? (headerField?.label ?? label) : undefined}
    >
      {headerField !== undefined && <HeaderField {...headerField} />}
      {(header !== undefined || edit !== undefined) && (
        <div className="flex items-end justify-between gap-2 px-4 pb-1.5">
          {header === undefined ? (
            <span />
          ) : (
            <h2 id={headerId} className="text-footnote text-secondary-label uppercase">
              {header}
            </h2>
          )}
          {(action !== undefined || edit !== undefined) && (
            <div className="flex gap-4">
              {action !== undefined && (
                <Button size="small" onClick={action.onClick}>
                  {action.label}
                </Button>
              )}
              {edit !== undefined && (
                <Button
                  size="small"
                  onClick={() => {
                    edit.onEditingChange(!edit.editing);
                  }}
                >
                  {edit.editing ? t('ui.done') : t('ui.edit')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {(hasRows(children) || hasRows(after)) && (
        <div className="grid grid-cols-[fit-content(50%)_minmax(0,1fr)] gap-x-4 overflow-hidden rounded-xl bg-cell">
          <EditContext value={edit?.editing ?? false}>
            <SectionContext value={rows}>
              {edit === undefined
                ? children
                : hasRows(children) && (
                    <div
                      role="list"
                      aria-labelledby={header === undefined ? undefined : headerId}
                      aria-label={header === undefined ? label : undefined}
                      className="col-span-full grid grid-cols-subgrid"
                    >
                      {children}
                    </div>
                  )}
              {after}
            </SectionContext>
          </EditContext>
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex flex-col gap-1 px-4 pt-1.5 text-footnote">
          {lines.map((line) => (
            <p
              key={line.id}
              className={line.tone === 'error' ? 'text-destructive' : 'text-secondary-label'}
            >
              <span id={line.id} role={lineRole(line)}>
                {line.text}
              </span>
              {line.action !== undefined && (
                <>
                  {' '}
                  <Button size="small" onClick={line.action.onClick}>
                    {line.action.label}
                  </Button>
                </>
              )}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** A header being typed: the header's look, as a text field that starts focused. */
function HeaderField({ label, value, onChange, onCommit, onCancel }: SectionHeaderField) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="px-4 pb-1.5">
      <input
        type="text"
        aria-label={label}
        placeholder={label}
        autoComplete="off"
        enterKeyHint="next"
        // The Member has just asked for this group: typing its title is the next thing to do.
        autoFocus
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        className={
          '-mx-1 block w-[calc(100%+0.5rem)] min-w-0 rounded-md bg-transparent px-1 text-footnote ' +
          'text-secondary-label uppercase placeholder:text-tertiary-label placeholder:normal-case ' +
          FIELD_FOCUS
        }
      />
    </div>
  );
}

function hasRows(rows: ReactNode) {
  return Children.toArray(rows).length > 0;
}

/**
 * The inset hairline above every row but the first, for `ROW_FRAME` and for a block of rows that
 * is itself one row of the group (an `AddRow` with its suggestions). Needs `relative`.
 */
export const ROW_SEPARATOR =
  'not-first:before:absolute not-first:before:top-0 not-first:before:right-0 ' +
  'not-first:before:left-[var(--separator-inset,1rem)] not-first:before:h-px not-first:before:scale-y-50 ' +
  'not-first:before:bg-separator';

/**
 * A row's frame in a GroupedSection, for rows not laid out on the label/value grid (`ListRow`):
 * both grid columns, an inset hairline above every row but the first, and the row height (44px on
 * touch, tighter with a fine pointer). A row can move its hairline's start with
 * `--separator-inset` (a `ListRow` with `leading` starts it at the text, as iOS does).
 */
export const ROW_FRAME =
  'relative col-span-full px-4 pointer-coarse:min-h-11 pointer-fine:min-h-9 ' + ROW_SEPARATOR;

/** The frame of a row on the label/value grid (`InputRow`, `SegmentedControl`). */
export const ROW_CLASSES = `${ROW_FRAME} grid grid-cols-subgrid items-center`;
