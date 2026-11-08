import { useId, type KeyboardEvent } from 'react';
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
  /** Shows the spinner at the right of the row while the choice saves (`useAutoSaveChoice()`). */
  busy?: boolean;
}

/**
 * A row of a GroupedSection that picks one colour from a grid of circles, as the Reminders colour
 * picker: the label on top, the circles under it, a check on the chosen one. The circles are
 * radios, but a colour is picked only by a tap, Space or Enter (each pick saves): Tab reaches the
 * group, the arrow keys (Home, End) only move the focus between the circles.
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
  // Tab reaches the chosen colour (the first while none is).
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
      className={`${ROW_FRAME} pt-2.5 pb-1.5 pointer-fine:pt-1.5 pointer-fine:pb-1`}
    >
      <span className="flex items-center justify-between gap-2">
        <span id={labelId} className={invalid ? 'text-destructive' : undefined}>
          {label}
        </span>
        {busy && <Spinner />}
      </span>
      <div className="grid max-w-90 grid-cols-8 pt-1 pointer-fine:max-w-72">
        {options.map((option, index) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              tabIndex={index === tabStop ? 0 : -1}
              onClick={() => {
                onChange(option.value);
              }}
              onKeyDown={moveFocus}
              className="group flex cursor-pointer items-center justify-center outline-none pointer-coarse:min-h-11 pointer-fine:min-h-9"
            >
              <span
                style={{ backgroundColor: option.color, color: option.color }}
                className={
                  'flex size-7 items-center justify-center rounded-full pointer-fine:size-6 ' +
                  'group-aria-checked:outline-2 group-aria-checked:outline-offset-2 ' +
                  'group-aria-checked:outline-current ' +
                  'group-focus-visible:ring-2 group-focus-visible:ring-accent ' +
                  'group-focus-visible:ring-offset-5 group-focus-visible:ring-offset-cell'
                }
              >
                {checked && (
                  <span className="flex text-on-accent drop-shadow-[0_0_1px_rgb(0_0_0/0.5)]">
                    <Icon name="check" size={16} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const NEXT: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** Moves the focus to another circle of the same group, wrapping around at the ends. */
function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const circles = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [],
  );
  const at = circles.indexOf(event.currentTarget);
  let to: number;
  if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = circles.length - 1;
  else {
    const step = NEXT[event.key];
    if (step === undefined) return;
    to = (at + step + circles.length) % circles.length;
  }
  event.preventDefault();
  circles[to]?.focus();
}
