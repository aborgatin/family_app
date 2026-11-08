import { useId } from 'react';
import { RowText } from './ListRow';
import { Spinner } from './Spinner';

export interface SegmentedControlProps<T extends string> {
  /** Already translated name of the choice (the group's accessible name). */
  label: string;
  /** Already translated segments, left to right. */
  options: readonly { value: T; label: string }[];
  /** `undefined`: no segment selected yet. */
  value: T | undefined;
  onChange: (value: T) => void;
  /** Marks the group invalid and points it at a message elsewhere (e.g. a section footer). */
  invalid?: boolean;
  describedBy?: string | undefined;
}

/**
 * iOS segmented control: a few mutually exclusive choices. Built on native radio buttons, so Tab
 * reaches it and the arrow keys move the choice (each move is a choice, saved at once).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  invalid = false,
  describedBy,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="grid flex-1 auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-fill p-0.5"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={
            'flex cursor-pointer items-center justify-center rounded-[7px] px-2 text-subhead ' +
            'font-medium select-none pointer-coarse:min-h-8 pointer-fine:min-h-6 ' +
            'has-checked:bg-segment has-checked:font-semibold has-checked:shadow-sm ' +
            'has-focus-visible:outline-2 has-focus-visible:outline-accent'
          }
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => {
              onChange(option.value);
            }}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

type SegmentedRowProps<T extends string> = SegmentedControlProps<T> & {
  /** `true`: the control fills the row and `label` is only its accessible name. */
  labelHidden?: boolean;
  /** Shows the spinner at the right of the row. */
  busy?: boolean;
};

/** A `SegmentedControl` as a cell: the label left and the control right, or the control alone. */
export function SegmentedRow<T extends string>({
  labelHidden = false,
  busy = false,
  ...control
}: SegmentedRowProps<T>) {
  return (
    <li className="group/row flex items-center gap-3 pl-4 text-body">
      <RowText>
        {!labelHidden && (
          <span aria-hidden="true" className="shrink-0 py-2.5 pointer-fine:py-1.5">
            {control.label}
          </span>
        )}
        <span
          className={
            'flex py-1.5 ' + (labelHidden ? 'flex-1' : 'ml-auto w-[min(14rem,60%)] justify-end')
          }
        >
          <SegmentedControl {...control} />
        </span>
        {busy && <Spinner />}
      </RowText>
    </li>
  );
}
