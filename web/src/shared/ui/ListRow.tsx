import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

type RowAction =
  /** Opens another screen: the row gets a chevron. */
  | { to: string; onClick?: never; destructive?: never }
  /** Does something; `destructive` makes it a red row (e.g. «Выйти», «Удалить …»). */
  | { onClick: () => void; destructive?: boolean; to?: never }
  /** Only shows something: not tappable. */
  | { to?: never; onClick?: never; destructive?: never };

type ListRowProps = RowAction & {
  /** Already translated main text. */
  title: ReactNode;
  /** A second, smaller line under the title (e.g. an email). */
  subtitle?: ReactNode;
  /** Before the text: an `Avatar`, a colour dot. */
  leading?: ReactNode;
  /** Right-aligned value in secondary colour (before the chevron, if any). */
  value?: ReactNode;
  /** Shows the spinner on the right (pass `useAutoSave…().busy`, already delayed ~400 ms). */
  busy?: boolean;
  disabled?: boolean;
};

/**
 * One cell of a `Section`. Touch: at least 44px tall, pressed state; fine pointer: tighter, hover.
 * The separator above it starts where the text starts, as on iOS.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  value,
  busy = false,
  disabled,
  ...action
}: ListRowProps) {
  const inside = (
    <>
      {leading !== undefined && <span className="flex shrink-0 py-1.5">{leading}</span>}
      <RowText>
        <span
          className={
            'min-w-0 flex-1 py-2.5 pointer-fine:py-1.5 ' +
            (action.destructive === true ? 'text-destructive' : '')
          }
        >
          <span className="block truncate">{title}</span>
          {subtitle !== undefined && (
            <span className="block truncate text-subhead text-secondary-label">{subtitle}</span>
          )}
        </span>
        {value !== undefined && (
          <span className="shrink-0 truncate text-secondary-label">{value}</span>
        )}
        {busy && <Spinner />}
        {action.to !== undefined && (
          <span className="flex shrink-0 text-tertiary-label">
            <Icon name="chevron" size={18} />
          </span>
        )}
      </RowText>
    </>
  );

  if (action.to !== undefined) {
    return (
      <li className="group/row">
        <RouterLink to={action.to} className={`${ROW} ${TAPPABLE}`}>
          {inside}
        </RouterLink>
      </li>
    );
  }
  if (action.onClick !== undefined) {
    return (
      <li className="group/row">
        <button
          type="button"
          disabled={disabled}
          onClick={action.onClick}
          className={`${ROW} ${TAPPABLE} w-full text-left disabled:cursor-default disabled:opacity-40`}
        >
          {inside}
        </button>
      </li>
    );
  }
  return (
    <li className="group/row">
      <div className={ROW}>{inside}</div>
    </li>
  );
}

const ROW = 'flex items-center gap-3 pl-4 text-body text-label no-underline';

const TAPPABLE =
  'cursor-pointer select-none transition-colors duration-100 hover:bg-cell-pressed/50 ' +
  'active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
  'focus-visible:outline-accent';

/**
 * The part of a row right of the leading item: holds the separator (none above the first row)
 * and keeps at least the 44px touch target / tighter fine-pointer height.
 */
export function RowText({ children }: { children: ReactNode }) {
  return (
    <span
      className={
        'flex min-w-0 flex-1 items-center gap-2 self-stretch border-t border-separator pr-4 ' +
        'group-first/row:border-t-0 pointer-coarse:min-h-11 pointer-fine:min-h-9'
      }
    >
      {children}
    </span>
  );
}
