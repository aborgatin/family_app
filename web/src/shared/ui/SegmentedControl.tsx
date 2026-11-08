import { useId } from 'react';
import { ROW_CLASSES, useSectionRow } from './GroupedSection';
import { Spinner } from './Spinner';

interface SegmentedControlProps<T extends string> {
  /** Already translated; names the choice, shown inline at the left of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  /** Two or three choices; labels already translated. */
  options: readonly { value: T; label: string }[];
  /** `undefined` while nothing is chosen: no segment is selected. */
  value: T | undefined;
  onChange: (value: T) => void;
  /** Shows the spinner left of the segments while the choice saves (`useAutoSaveChoice()`). */
  busy?: boolean;
}

/**
 * A row of a GroupedSection that picks one of a few choices, as an iOS segmented control. The
 * segments are radios: Tab reaches the group, arrow keys move the choice, Space picks one.
 */
export function SegmentedControl<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  busy = false,
}: SegmentedControlProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const { describedBy, invalid } = useSectionRow(name);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${ROW_CLASSES} py-1.5`}
    >
      <span className="flex items-center gap-2">
        <span id={labelId} className={invalid ? 'text-destructive' : undefined}>
          {label}
        </span>
        {busy && <Spinner />}
      </span>
      <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-fill p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-w-0 cursor-pointer pointer-coarse:-my-2 pointer-coarse:py-2"
          >
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
              className="peer sr-only"
            />
            <span className={SEGMENT}>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const SEGMENT =
  'flex min-w-0 flex-1 items-center justify-center truncate rounded-md px-1 text-footnote ' +
  'font-semibold ' +
  'select-none pointer-coarse:min-h-8 pointer-fine:min-h-6 ' +
  'peer-checked:bg-segment peer-checked:shadow-sm ' +
  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 ' +
  'peer-focus-visible:outline-accent';
