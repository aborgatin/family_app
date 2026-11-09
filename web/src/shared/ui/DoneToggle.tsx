import { Icon } from './Icon';

interface DoneToggleProps {
  /** Already translated; the accessible name, saying what ticking it does («Куплено «Молоко»»). */
  label: string;
  done: boolean;
  /** Called with the new state when the Member taps, clicks or presses Space. */
  onChange: (done: boolean) => void;
}

/**
 * The circle at the left of a row that ticks it off, as in iOS Reminders: an empty ring while open,
 * a filled accent circle with a white check when Done. A checkbox (`role="checkbox"`,
 * `aria-checked`) named by `label`; goes in a row's `leading`.
 */
export function DoneToggle({ label, done, onChange }: DoneToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={() => {
        onChange(!done);
      }}
      className={
        'flex shrink-0 cursor-pointer items-center justify-center rounded-full ' +
        'pointer-coarse:size-11 pointer-fine:size-7 focus-visible:outline-2 ' +
        'focus-visible:outline-offset-[-2px] focus-visible:outline-accent'
      }
    >
      <span
        aria-hidden="true"
        className={
          'flex size-5.5 items-center justify-center rounded-full transition-colors ' +
          'duration-100 pointer-fine:size-5 ' +
          (done
            ? 'bg-accent-fill text-on-accent'
            : 'border-[1.5px] border-secondary-label bg-transparent')
        }
      >
        {done && <Icon name="check" size={14} />}
      </span>
    </button>
  );
}
