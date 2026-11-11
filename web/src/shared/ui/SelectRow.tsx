import { useId } from 'react';
import { ROW_CLASSES, useSectionRow } from './GroupedSection';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

interface SelectRowProps<T extends string> {
  /** Already translated; shown inline at the left of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  /** The choices, in order; labels already translated (or names). */
  options: readonly { value: T; label: string }[];
  /** The current choice: one of `options`. */
  value: T;
  onChange: (value: T) => void;
  /** Shows the spinner while the choice saves (`useAutoSaveChoice()`). */
  busy?: boolean;
  /** Can't be chosen now: dimmed. */
  disabled?: boolean;
}

/**
 * One of several choices as a row of a GroupedSection, for more choices than a `SegmentedControl`
 * holds or ones of unknown length (names): the label at the left, the current choice at the right
 * in the browser's own menu (a pop-up menu on the iPhone and the Mac), as an iOS pop-up button.
 */
export function SelectRow<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  busy = false,
  disabled = false,
}: SelectRowProps<T>) {
  const id = useId();
  const { describedBy, invalid } = useSectionRow(name);

  return (
    <div className={ROW_CLASSES}>
      <label
        htmlFor={id}
        className={`py-2.5 wrap-break-word ${invalid ? 'text-destructive' : ''} ${disabled ? 'opacity-40' : ''}`}
      >
        {label}
      </label>
      <span className="flex min-w-0 items-center justify-end gap-2">
        {busy && <Spinner />}
        <span className="relative flex min-w-0">
          <select
            id={id}
            name={name}
            disabled={disabled}
            value={value}
            onChange={(event) => {
              onChange(event.target.value as T);
            }}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={FIELD}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className={`${MARK} ${disabled ? 'opacity-40' : ''}`}>
            <Icon name="expand" size={14} />
          </span>
        </span>
      </span>
    </div>
  );
}

/**
 * The choice in a grey pill, right-aligned like a `DateRow`'s value, without the browser's own
 * arrow: the ⌄ mark is drawn over the pill's right end.
 */
const FIELD =
  'my-1.5 min-w-0 max-w-full cursor-pointer appearance-none truncate rounded-md bg-fill py-1 ' +
  'pr-6 pl-2 text-body text-label pointer-fine:my-1 pointer-fine:py-0.5 ' +
  'disabled:cursor-default disabled:opacity-40 ' +
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-accent';

const MARK =
  'pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-secondary-label';
