import { useId } from 'react';
import { ROW_FRAME, useSectionRow } from './GroupedSection';
import { Spinner } from './Spinner';

interface SwitchRowProps {
  /** Already translated; names the switch, shown at the left of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Shows the spinner before the switch while the change saves (`useAutoSaveChoice()`). */
  busy?: boolean;
}

/**
 * An on/off setting as a row of a GroupedSection, as an iOS switch: the label at the left, the
 * switch at the right. A checkbox with `role="switch"`: Tab reaches it, Space flips it; a tap
 * anywhere on the row flips it too.
 */
export function SwitchRow({ label, name, value, onChange, busy = false }: SwitchRowProps) {
  const id = useId();
  const { describedBy, invalid } = useSectionRow(name);
  return (
    <label
      htmlFor={id}
      className={`${ROW_FRAME} flex cursor-pointer items-center gap-3 select-none`}
    >
      <span className={`min-w-0 flex-1 py-2.5 ${invalid ? 'text-destructive' : ''}`}>{label}</span>
      {busy && <Spinner />}
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        checked={value}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="peer sr-only"
      />
      <span aria-hidden="true" className={TRACK}>
        <span className={THUMB} />
      </span>
    </label>
  );
}

// iOS: a 51×31 track with a 27px thumb; with a fine pointer (macOS) a smaller 38×22. The thumb
// moves by the track's inner width less its own: 20px, 16px.
const TRACK =
  'flex shrink-0 items-center rounded-full bg-fill p-0.5 transition-colors duration-150 ' +
  'pointer-coarse:h-7.75 pointer-coarse:w-12.75 pointer-fine:h-5.5 pointer-fine:w-9.5 ' +
  'peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ' +
  'peer-focus-visible:outline-accent';
const THUMB =
  'aspect-square h-full rounded-full bg-on-accent shadow-sm transition-transform duration-150 ' +
  'pointer-coarse:[.peer:checked~*_&]:translate-x-5 pointer-fine:[.peer:checked~*_&]:translate-x-4';
