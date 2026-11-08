import { useId } from 'react';
import { ROW_FRAME, useSectionRow } from './GroupedSection';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

interface ColorChoiceProps<T extends string> {
  /** Already translated; names the choice, shown at the top of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  /** The colours, in order: `label` (already translated) names each circle, `color` draws it. */
  options: readonly { value: T; label: string; color: string }[];
  /** `undefined` while nothing is chosen (or the value is none of the options). */
  value: T | undefined;
  onChange: (value: T) => void;
  /** Shows the spinner after the label while the choice saves (`useAutoSaveChoice()`). */
  busy?: boolean;
}

/**
 * A row of a GroupedSection that picks one colour from a grid of circles, as the Reminders colour
 * picker: the label on top, the circles under it, a check on the chosen one. The circles are
 * radios: Tab reaches the group, arrow keys move the choice, Space picks.
 */
export function ColorChoice<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  busy = false,
}: ColorChoiceProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const { describedBy, invalid } = useSectionRow(name);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className={`${ROW_FRAME} pt-2.5 pb-1.5 pointer-fine:pt-1.5 pointer-fine:pb-1`}
    >
      <span className="flex items-center gap-2">
        <span id={labelId} className={invalid ? 'text-destructive' : undefined}>
          {label}
        </span>
        {busy && <Spinner />}
      </span>
      <div className="grid max-w-90 grid-cols-8 pt-1 pointer-fine:max-w-72">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center justify-center pointer-coarse:min-h-11 pointer-fine:min-h-9"
          >
            <input
              type="radio"
              name={id}
              value={option.value}
              aria-label={option.label}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
              className="peer sr-only"
            />
            <span
              style={{ backgroundColor: option.color, color: option.color }}
              className={
                'flex size-7 items-center justify-center rounded-full pointer-fine:size-6 ' +
                'peer-checked:outline-2 peer-checked:outline-offset-2 peer-checked:outline-current ' +
                'peer-focus-visible:ring-2 peer-focus-visible:ring-accent ' +
                'peer-focus-visible:ring-offset-5 peer-focus-visible:ring-offset-cell'
              }
            >
              {value === option.value && (
                <span className="flex text-on-accent drop-shadow-[0_0_1px_rgb(0_0_0/0.5)]">
                  <Icon name="check" size={16} />
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
