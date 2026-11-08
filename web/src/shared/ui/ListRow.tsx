import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { ROW_FRAME } from './GroupedSection';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

type RowAction =
  /** Opens another screen: the row gets a chevron. */
  | { to: string; onClick?: never; destructive?: never; accent?: never }
  /**
   * Does something; `destructive` makes it a red row (e.g. «Выйти», «Удалить …»), `accent` an
   * accent-coloured one that adds something (e.g. «Пригласить взрослого…»).
   */
  | { onClick: () => void; destructive?: boolean; accent?: boolean; to?: never }
  /** Only shows something: not tappable. */
  | { to?: never; onClick?: never; destructive?: never; accent?: never };

/** What a row shows, the same in a `ListRow` and an `EditableRow`. */
export interface RowContentProps {
  /** Already translated main text. */
  title: ReactNode;
  /** A second, smaller line under the title (e.g. an email). */
  subtitle?: ReactNode;
  /**
   * Shows the whole subtitle, wrapped anywhere, instead of cutting it with «…»: for text the user
   * may need to read or select in full (a link to copy by hand).
   */
  wrapSubtitle?: boolean;
  /**
   * Before the text: an `Avatar`, a colour dot. Centred in a slot as wide as an `Avatar`, so the
   * texts and the hairlines between rows line up.
   */
  leading?: ReactNode;
  /** Right-aligned value in secondary colour (before the chevron, if any). */
  value?: ReactNode;
  /** Shows the spinner on the right. */
  busy?: boolean;
}

type ListRowProps = RowAction &
  RowContentProps & {
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
  wrapSubtitle,
  leading,
  value,
  busy = false,
  disabled,
  ...action
}: ListRowProps) {
  const inside = (
    <RowInside
      title={title}
      subtitle={subtitle}
      wrapSubtitle={wrapSubtitle}
      leading={leading}
      value={value}
      busy={busy}
      tone={
        action.destructive === true ? 'destructive' : action.accent === true ? 'accent' : 'label'
      }
      chevron={action.to !== undefined}
    />
  );

  const ROW = `${ROW_FRAME} ${ROW_LAYOUT} ${leading === undefined ? '' : LEADING_INSET}`;

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

/** Inside a row's frame: the leading slot, the text, the value and trailing marks in a line. */
export const ROW_LAYOUT = 'flex items-center gap-3 text-body text-label no-underline';

/**
 * With `leading`, the hairline above the row starts at the text: past the 32px (28px) slot and
 * the gap.
 */
export const LEADING_INSET = '[--separator-inset:3.75rem] pointer-fine:[--separator-inset:3.5rem]';

export const TAPPABLE =
  'cursor-pointer select-none transition-colors duration-100 hover:bg-cell-pressed/50 ' +
  'active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
  'focus-visible:outline-accent';

const TONES = { label: '', destructive: 'text-destructive', accent: 'text-accent' };

/** The parts of a row in their order; `chevron` for a row that opens another screen. */
export function RowInside({
  title,
  subtitle,
  wrapSubtitle = false,
  leading,
  value,
  busy = false,
  tone = 'label',
  chevron = false,
  field = false,
}: RowContentProps & {
  tone?: keyof typeof TONES;
  chevron?: boolean;
  /** The title is a text field: it scrolls its own text, and its focus outline mustn't be cut. */
  field?: boolean;
}) {
  return (
    <>
      {leading !== undefined && (
        <span className="flex w-8 shrink-0 justify-center pointer-fine:w-7">{leading}</span>
      )}
      <span className={`min-w-0 flex-1 py-2.5 pointer-fine:py-1.5 ${TONES[tone]}`}>
        <span className={field ? 'block' : 'block truncate'}>{title}</span>
        {subtitle !== undefined && (
          <span
            className={`block text-subhead text-secondary-label ${wrapSubtitle ? 'break-all select-text' : 'truncate'}`}
          >
            {subtitle}
          </span>
        )}
      </span>
      {value !== undefined && (
        <span className="shrink-0 truncate text-secondary-label">{value}</span>
      )}
      {busy && <Spinner />}
      {chevron && (
        <span className="flex shrink-0 text-tertiary-label">
          <Icon name="chevron" size={18} />
        </span>
      )}
    </>
  );
}
