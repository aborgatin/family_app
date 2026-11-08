import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { ROW_FRAME } from './GroupedSection';
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
  /**
   * Before the text: an `Avatar`, a colour dot. Centred in a slot as wide as an `Avatar`, so the
   * texts and the hairlines between rows line up.
   */
  leading?: ReactNode;
  /** Right-aligned value in secondary colour (before the chevron, if any). */
  value?: ReactNode;
  /** Shows the spinner on the right. */
  busy?: boolean;
  disabled?: boolean;
};

/**
 * A row of a `GroupedSection` that shows something, opens a screen (`to`, chevron) or does
 * something (`onClick`, optionally `destructive`). Touch: at least 44px tall, grey while pressed;
 * fine pointer: tighter, hover tint.
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
      {leading !== undefined && (
        <span className="flex w-8 shrink-0 justify-center pointer-fine:w-7">{leading}</span>
      )}
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
    </>
  );

  // With `leading`, the hairline above starts at the text: past the 32px (28px) slot and the gap.
  const ROW = leading === undefined ? ROW_BASE : `${ROW_BASE} ${LEADING_INSET}`;

  if (action.to !== undefined) {
    return (
      <RouterLink to={action.to} className={`${ROW} ${TAPPABLE}`}>
        {inside}
      </RouterLink>
    );
  }
  if (action.onClick !== undefined) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={action.onClick}
        className={`${ROW} ${TAPPABLE} text-left disabled:cursor-default disabled:opacity-40`}
      >
        {inside}
      </button>
    );
  }
  return <div className={ROW}>{inside}</div>;
}

const ROW_BASE = `${ROW_FRAME} flex items-center gap-3 text-body text-label no-underline`;

const LEADING_INSET = '[--separator-inset:3.75rem] pointer-fine:[--separator-inset:3.5rem]';

const TAPPABLE =
  'cursor-pointer select-none transition-colors duration-100 hover:bg-cell-pressed/50 ' +
  'active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
  'focus-visible:outline-accent';
