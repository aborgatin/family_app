import { createContext, use, useId, type ReactNode } from 'react';
import { Button } from './Button';

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
  /** Announce it (`alert`) even though it is about a row, e.g. a save that failed after blur. */
  announce?: boolean;
  /** A small text button after the text, e.g. «Повторить». */
  action?: { label: string; onClick: () => void };
}

interface GroupedSectionProps {
  /** Already translated; shown in small capitals above the group, and names it (a region). */
  header?: string;
  /** The footer's lines, top to bottom; `false` and `undefined` entries are skipped. */
  messages?: readonly (SectionMessage | false | undefined)[];
  children?: ReactNode;
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

function isAbout(message: SectionMessage, row: string) {
  return typeof message.row === 'string' ? message.row === row : message.row?.includes(row);
}

/**
 * A grouped inset list as in the iPhone Settings app: an optional header, the rows on one rounded
 * cell with hairlines between them, and a footer for hints and errors. The rows share a
 * two-column grid, so inline labels line up and the values start at the same edge.
 */
export function GroupedSection({ header, messages = [], children }: GroupedSectionProps) {
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
    <section aria-labelledby={header === undefined ? undefined : headerId}>
      {header !== undefined && (
        <h2 id={headerId} className="px-4 pb-1.5 text-footnote text-secondary-label uppercase">
          {header}
        </h2>
      )}
      {children !== undefined && children !== null && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 overflow-hidden rounded-xl bg-cell">
          <SectionContext value={rows}>{children}</SectionContext>
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex flex-col gap-1 px-4 pt-1.5 text-footnote">
          {lines.map((line) => (
            <p
              key={line.id}
              className={line.tone === 'error' ? 'text-destructive' : 'text-secondary-label'}
            >
              <span
                id={line.id}
                role={
                  line.tone === 'error' && (line.row === undefined || line.announce === true)
                    ? 'alert'
                    : undefined
                }
              >
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

/**
 * Content that isn't built from rows yet (M1 screens until their own ticket), as one padded cell
 * spanning the group.
 */
export function SectionContent({ children }: { children: ReactNode }) {
  return <div className={`${ROW_FRAME} py-3`}>{children}</div>;
}

/**
 * A row's frame in a GroupedSection, for rows not laid out on the label/value grid (`ListRow`):
 * both grid columns, an inset hairline above every row but the first, and the row height (44px on
 * touch, tighter with a fine pointer). A row can move its hairline's start with
 * `--separator-inset` (a `ListRow` with `leading` starts it at the text, as iOS does).
 */
export const ROW_FRAME =
  'relative col-span-full px-4 pointer-coarse:min-h-11 pointer-fine:min-h-9 ' +
  'not-first:before:absolute not-first:before:top-0 not-first:before:right-0 ' +
  'not-first:before:left-[var(--separator-inset,1rem)] not-first:before:h-px not-first:before:scale-y-50 ' +
  'not-first:before:bg-separator';

/** The frame of a row on the label/value grid (`InputRow`, `SegmentedControl`). */
export const ROW_CLASSES = `${ROW_FRAME} grid grid-cols-subgrid items-center`;
