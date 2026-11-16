import { useId, type ReactNode } from 'react';
import { ROW_FRAME, useSectionRow } from './GroupedSection';
import { moveFocus } from './radioFocus';
import { Spinner } from './Spinner';

interface PictureChoiceProps<T extends string> {
  /** Already translated; names the choice, shown at the top of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  /**
   * The pictures, in order: `label` (already translated) names each one, `picture` draws it (a
   * round picture of the size the row gives it, decorative).
   */
  options: readonly { value: T; label: string; picture: ReactNode }[];
  /** `undefined` while nothing is chosen (or the value is none of the options). */
  value: T | undefined;
  onChange: (value: T) => void;
  /** Shows the spinner at the right of the row while the choice saves (`useAutoSaveChoice()`). */
  busy?: boolean;
}

/**
 * A row of a GroupedSection that picks one round picture of a few (a Child avatar), like
 * ColorChoice: the label on top, the pictures under it, the chosen one ringed in `accent`. The
 * pictures are radios picked by a tap, Space or Enter (each pick saves); Tab reaches the group, the
 * arrow keys (Home, End) only move the focus.
 */
export function PictureChoice<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  busy = false,
}: PictureChoiceProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const { describedBy, invalid } = useSectionRow(name);
  const tabStop = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${ROW_FRAME} pt-2.5 pb-2 pointer-fine:pt-1.5 pointer-fine:pb-1.5`}
    >
      <span className="flex items-center justify-between gap-2">
        <span id={labelId} className={invalid ? 'text-destructive' : undefined}>
          {label}
        </span>
        {busy && <Spinner />}
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-2 pt-2 pointer-fine:gap-x-2.5">
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            aria-label={option.label}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
            onKeyDown={moveFocus}
            className="group flex cursor-pointer items-center justify-center outline-none"
          >
            <span
              className={
                'flex size-11 rounded-full pointer-fine:size-9 ' +
                'group-aria-checked:outline-2 group-aria-checked:outline-offset-2 ' +
                'group-aria-checked:outline-accent ' +
                'group-focus-visible:ring-2 group-focus-visible:ring-accent ' +
                'group-focus-visible:ring-offset-5 group-focus-visible:ring-offset-cell'
              }
            >
              {option.picture}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
