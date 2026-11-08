import { useId, type KeyboardEvent } from 'react';
import { RowText } from './ListRow';
import { Spinner } from './Spinner';

export interface InputRowProps {
  /** Already translated label, left in the row; it names the input. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Leaving the field or pressing Enter: save what was typed. */
  onCommit?: () => void;
  /** Esc: put the saved value back. */
  onRevert?: () => void;
  /** Shows the spinner at the right of the row. */
  busy?: boolean;
  /** Marks the input invalid and points it at the message in the section footer. */
  invalid?: boolean;
  describedBy?: string | undefined;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
}

/**
 * A borderless input inside a row, the label on the left, the text right-aligned, as in iOS
 * forms. Use it with `useAutoSaveText()` (spread its `input`) to save on blur or Enter.
 */
export function InputRow({
  label,
  value,
  onChange,
  onCommit,
  onRevert,
  busy = false,
  invalid = false,
  describedBy,
  type = 'text',
  autoComplete,
}: InputRowProps) {
  const id = useId();

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit?.();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onRevert?.();
    }
  }

  return (
    <li
      className={
        'group/row flex items-center gap-3 pl-4 text-body ' +
        // A keyboard user (fine pointer) sees which row has focus; on touch the caret is enough.
        'pointer-fine:focus-within:outline-2 pointer-fine:focus-within:-outline-offset-2 ' +
        'pointer-fine:focus-within:outline-accent'
      }
    >
      <RowText>
        <label htmlFor={id} className="shrink-0 py-2.5 pointer-fine:py-1.5">
          {label}
        </label>
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          className={
            'min-w-0 flex-1 self-stretch bg-transparent text-right outline-none ' +
            'placeholder:text-tertiary-label ' +
            (invalid ? 'text-destructive' : 'text-label')
          }
        />
        {busy && <Spinner />}
      </RowText>
    </li>
  );
}
