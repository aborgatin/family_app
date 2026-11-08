import { createContext, use, useId, type ReactNode } from 'react';

/** One line in a group's footer. */
export interface SectionMessage {
  /** Already translated. */
  text: string;
  /** `error` is red; `hint` (the default) is quiet. */
  tone?: 'hint' | 'error';
  /**
   * The `name` of the row it is about: that row is described by it (and marked invalid by an
   * error). Without it the line is about the whole group, and an error is announced (`alert`).
   */
  row?: string;
}

interface GroupedSectionProps {
  /** Already translated; shown in small capitals above the group. */
  header?: string;
  /** The footer's lines, top to bottom; `false` and `undefined` entries are skipped. */
  messages?: readonly (SectionMessage | false | undefined)[];
  children: ReactNode;
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

/**
 * A grouped inset list as in the iPhone Settings app: an optional header, the rows on one rounded
 * cell with hairlines between them, and a footer for hints and errors. The rows share a
 * two-column grid, so inline labels line up and the values start at the same edge.
 */
export function GroupedSection({ header, messages = [], children }: GroupedSectionProps) {
  const id = useId();
  const lines = messages
    .filter((message) => message !== false && message !== undefined)
    .map((message, index) => ({ ...message, id: `${id}-${String(index)}` }));

  const rows: SectionRows = {
    describedBy: (row) => {
      const ids = lines.filter((line) => line.row === row).map((line) => line.id);
      return ids.length === 0 ? undefined : ids.join(' ');
    },
    invalid: (row) => lines.some((line) => line.row === row && line.tone === 'error'),
  };

  return (
    <section>
      {header !== undefined && (
        <h2 className="px-4 pb-1.5 text-footnote text-secondary-label uppercase">{header}</h2>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 overflow-hidden rounded-xl bg-cell">
        <SectionContext value={rows}>{children}</SectionContext>
      </div>
      {lines.length > 0 && (
        <div className="flex flex-col gap-1 px-4 pt-1.5 text-footnote">
          {lines.map((line) => (
            <p
              key={line.id}
              id={line.id}
              role={line.tone === 'error' && line.row === undefined ? 'alert' : undefined}
              className={line.tone === 'error' ? 'text-destructive' : 'text-secondary-label'}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The frame of one row in a GroupedSection: both grid columns, an inset hairline above every row
 * but the first, and the row height (44px on touch, tighter with a fine pointer).
 */
export const ROW_CLASSES =
  'relative col-span-full grid grid-cols-subgrid items-center px-4 ' +
  'pointer-coarse:min-h-11 pointer-fine:min-h-9 ' +
  'not-first:before:absolute not-first:before:top-0 not-first:before:right-0 ' +
  'not-first:before:left-4 not-first:before:h-px not-first:before:scale-y-50 ' +
  'not-first:before:bg-separator';
