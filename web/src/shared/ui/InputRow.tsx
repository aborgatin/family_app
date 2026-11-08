import { useId, type KeyboardEvent } from 'react';
import { ROW_CLASSES, useSectionRow } from './GroupedSection';
import { Spinner } from './Spinner';

interface InputRowProps {
  /** Already translated; shown inline at the left of the row. */
  label: string;
  /** Names the row for the group footer's messages (`SectionMessage.row`). */
  name: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Auto-save (`useAutoSaveText()`): called on blur and on Enter, which then no longer submits a
   * surrounding form.
   */
  onCommit?: () => void;
  /** Esc: put the saved value back. */
  onRevert?: () => void;
  /** Shows the spinner at the right of the row while saving. */
  busy?: boolean;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
}

/**
 * A text field as a row of a GroupedSection: the label inline at the left, the field filling the
 * rest. Hints and errors about it show in the group footer and are its accessible description.
 */
export function InputRow({
  label,
  name,
  value,
  onChange,
  onCommit,
  onRevert,
  busy = false,
  type = 'text',
  autoComplete,
}: InputRowProps) {
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
        className={`py-2.5 whitespace-nowrap ${invalid ? 'text-destructive' : ''}`}
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
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
      {busy && (
        <span className="absolute top-1/2 right-4 -translate-y-1/2">
          <Spinner />
        </span>
      )}
    </div>
  );
}

/**
 * On touch the caret is the focus, as on iOS. With a keyboard and a fine pointer the field gets
 * the accent outline every focused control has.
 */
const FIELD =
  'my-1 -ml-1 w-full min-w-0 self-stretch rounded-md bg-transparent px-1 text-body text-label ' +
  'outline-none pointer-fine:focus-visible:outline-2 pointer-fine:focus-visible:outline-accent';
