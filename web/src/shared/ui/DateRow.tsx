import { useId, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ROW_CLASSES, useSectionRow } from './GroupedSection';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

interface DateRowProps {
  /** Already translated; shown inline at the left of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  /** A day (the default) or a time of day. */
  type?: 'date' | 'time';
  /** `YYYY-MM-DD` (a `time`: `HH:MM`), or `''` for none. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Auto-save (`useAutoSaveText()`): called on blur, on Enter, and right after clearing. Without
   * it, Enter submits a surrounding form.
   */
  onCommit?: () => void;
  /** Esc: put the saved value back. */
  onRevert?: () => void;
  /** Shows the spinner while saving. */
  busy?: boolean;
  /** Can't be set now (a time while there is no day): dimmed, and nothing to clear. */
  disabled?: boolean;
}

/**
 * An optional date, or time of day, as a row of a GroupedSection: the label at the left, the value
 * at the right in the browser's own date or time field (a wheel on the iPhone, a calendar on the
 * Mac), and a clear button while there is a value.
 */
export function DateRow({
  label,
  name,
  type = 'date',
  value,
  onChange,
  onCommit,
  onRevert,
  busy = false,
  disabled = false,
}: DateRowProps) {
  const { t } = useTranslation();
  const id = useId();
  const { describedBy, invalid } = useSectionRow(name);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && onCommit !== undefined) {
      event.preventDefault();
      onCommit();
    } else if (event.key === 'Escape' && onRevert !== undefined) {
      event.preventDefault();
      onRevert();
    }
  }

  return (
    <div className={ROW_CLASSES}>
      <label
        htmlFor={id}
        className={`py-2.5 whitespace-nowrap ${invalid ? 'text-destructive' : ''} ${disabled ? 'opacity-40' : ''}`}
      >
        {label}
      </label>
      <span className="flex min-w-0 items-center justify-end gap-2">
        {busy && <Spinner />}
        <input
          id={id}
          name={name}
          type={type}
          disabled={disabled}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={FIELD}
        />
        {value !== '' && !disabled && (
          <button
            type="button"
            aria-label={t('ui.clearRow', { label })}
            onClick={() => {
              onChange('');
              onCommit?.();
            }}
            className={CLEAR}
          >
            <Icon name="clear" size={18} />
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * The date in a grey pill, right-aligned, as an iOS compact date picker. Touch: no calendar icon
 * (the iPhone has none, and a tap opens the picker anyway) and the value at the pill's right, next
 * to the clear button; Chrome lays the value out as a flex box (Tailwind's preflight), so this
 * takes `justify-end`, not just `text-right`. Fine pointer: the value, then the calendar icon.
 */
const FIELD =
  'my-1.5 min-w-0 rounded-md bg-fill px-2 py-1 text-right text-body text-label ' +
  '[&::-webkit-date-and-time-value]:text-right pointer-fine:my-1 pointer-fine:py-0.5 ' +
  'pointer-coarse:[&::-webkit-datetime-edit]:justify-end ' +
  'pointer-coarse:[&::-webkit-calendar-picker-indicator]:hidden disabled:opacity-40 ' +
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-accent';

const CLEAR =
  'flex shrink-0 cursor-pointer items-center justify-center rounded-full text-tertiary-label ' +
  'pointer-coarse:-my-2 pointer-coarse:-ml-2 pointer-coarse:-mr-3 pointer-coarse:size-11 ' +
  'pointer-fine:size-7 ' +
  'hover:text-secondary-label focus-visible:outline-2 focus-visible:outline-accent';
