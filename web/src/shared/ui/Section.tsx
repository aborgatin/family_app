import { Children, useId, type ReactNode } from 'react';

interface SectionProps {
  /** Already translated header, shown in small capitals above the cells; names the region. */
  title?: string;
  /** Under the cells: a hint, or what went wrong (e.g. a `SaveFailure`). */
  footer?: ReactNode;
  /**
   * `true` (default): the children are rows (`ListRow`, `InputRow`, `SegmentedRow`) of a list.
   * `false`: free content on one padded card, for content that has no rows of its own yet.
   */
  rows?: boolean;
  /** The cells. None: only the header and footer show. */
  children?: ReactNode;
}

/**
 * One group of an inset grouped list, as in the iPhone Settings app: an optional header, the
 * cells on a rounded card, an optional footer. A titled section is a landmark region.
 */
export function Section({ title, footer, rows = true, children }: SectionProps) {
  const headingId = useId();
  const hasContent = Children.count(children) > 0;
  return (
    <section
      aria-labelledby={title === undefined ? undefined : headingId}
      className="mt-8 first-of-type:mt-3 pointer-fine:mt-6"
    >
      {title !== undefined && (
        <h2
          id={headingId}
          className="px-4 pb-1.5 text-footnote text-secondary-label uppercase pointer-fine:pb-1"
        >
          {title}
        </h2>
      )}
      {hasContent &&
        (rows ? (
          <ul className="overflow-hidden rounded-[10px] bg-cell">{children}</ul>
        ) : (
          <div className="rounded-[10px] bg-cell px-4 py-3">{children}</div>
        ))}
      {footer !== undefined && footer !== false && footer !== null && (
        <div className="px-4 pt-1.5 text-footnote text-secondary-label">{footer}</div>
      )}
    </section>
  );
}
