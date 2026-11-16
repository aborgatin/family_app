import { useId, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

interface CardGridProps {
  /** Already translated; shown in small capitals above the cards, and names them (a region). */
  header: string;
  /** The `Card`s, in order. */
  children: ReactNode;
}

/**
 * A section of compact cards, big targets for the few things a screen is mostly about (the Children
 * on Home). Narrow windows: two per row, each half the row wide, an odd last one at the left. Wide
 * windows: the cards keep the phone's width and more fit in a row. Headed like a `GroupedSection`.
 */
export function CardGrid({ header, children }: CardGridProps) {
  const headerId = useId();
  return (
    <section aria-labelledby={headerId}>
      <h2 id={headerId} className="px-4 pb-1.5 text-footnote text-secondary-label uppercase">
        {header}
      </h2>
      <ul
        // Safari drops the list role of a list without markers.
        role="list"
        aria-labelledby={headerId}
        className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,10.75rem)]"
      >
        {children}
      </ul>
    </section>
  );
}

interface CardProps {
  /** An in-app path: the card is a link. */
  to: string;
  /** Already translated main text. */
  title: string;
  /** A smaller line under the title (a Child's age). */
  subtitle?: string;
  /** A decorative round picture before the text (a `ChildAvatar`). */
  leading: ReactNode;
}

/** One card of a `CardGrid`: a link on `cell` with a round picture, the title and a subtitle. */
export function Card({ to, title, subtitle, leading }: CardProps) {
  return (
    <li className="min-w-0">
      <RouterLink
        to={to}
        className={
          'flex h-17 items-center gap-2.5 rounded-2xl bg-cell px-3 text-label no-underline ' +
          'select-none inset-ring inset-ring-swatch-edge transition-opacity duration-150 ' +
          'hover:opacity-85 active:opacity-70 focus-visible:outline-2 ' +
          'focus-visible:outline-offset-2 focus-visible:outline-accent'
        }
      >
        {leading}
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold">{title}</span>
          {subtitle !== undefined && (
            <span className="block truncate text-subhead text-secondary-label">{subtitle}</span>
          )}
        </span>
      </RouterLink>
    </li>
  );
}
