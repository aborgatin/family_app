import { useId, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

interface TileGridProps {
  /** Already translated; shown in small capitals above the tiles, and names them (a region). */
  header: string;
  /** The `Tile`s, in order. */
  children: ReactNode;
}

/**
 * A section of square tiles, big targets for a few things that matter most (the Children on
 * Home). Narrow windows: two per row, each half the row wide, an odd last one at the left. Wide
 * windows: the tiles keep the phone's size and more fit in a row. Headed like a `GroupedSection`.
 */
export function TileGrid({ header, children }: TileGridProps) {
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

interface TileProps {
  /** An in-app path: the tile is a link. */
  to: string;
  /** Already translated main text. */
  title: string;
  /** A smaller line under the title (a Child's age). */
  subtitle?: string;
  /**
   * A CSS colour that fills the tile, e.g. a Child color's `hex` from `@/shared/palette`; its text
   * is then `on-child-color`. Without it the tile is grey (`fill`).
   */
  color?: string;
}

/** One square tile of a `TileGrid`: a link filled with a colour, its text at the bottom left. */
export function Tile({ to, title, subtitle, color }: TileProps) {
  return (
    <li className="min-w-0">
      <RouterLink
        to={to}
        style={color === undefined ? undefined : { backgroundColor: color }}
        className={
          'flex aspect-square flex-col justify-end rounded-2xl p-3 no-underline select-none ' +
          'inset-ring inset-ring-swatch-edge transition-opacity duration-150 hover:opacity-85 ' +
          'active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-accent ' +
          (color === undefined ? 'bg-fill text-label' : 'text-on-child-color')
        }
      >
        <span className="line-clamp-2 text-title3 font-semibold wrap-anywhere">{title}</span>
        {subtitle !== undefined && <span className="block truncate text-subhead">{subtitle}</span>}
      </RouterLink>
    </li>
  );
}
