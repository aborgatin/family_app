import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'aria-invalid' | 'aria-describedby'
> {
  /** Already translated label. */
  label: string;
  /** Already translated error message; shown under the field and announced with it. */
  error?: string | undefined;
}

/** A labelled input with its error message wired up for screen readers. */
export function TextField({ label, error, ...input }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        {...input}
      />
      {error !== undefined && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
