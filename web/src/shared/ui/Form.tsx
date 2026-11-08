import type { KeyboardEvent, ReactNode, SubmitEvent } from 'react';

interface FormProps {
  /** Called on Enter in a field and on the form's `type="submit"` Button. */
  onSubmit: () => void;
  /** Called on Esc in a field: leave without saving (the password screen). */
  onCancel?: () => void;
  children: ReactNode;
}

/**
 * A form with an explicit confirm (the auth forms, the password screen). Enter in any field
 * submits, also when the confirm button is outside the form (in the nav bar); Esc cancels when
 * `onCancel` is given. The browser's own validation bubbles are off: the screen shows its
 * messages in the group footer.
 */
export function Form({ onSubmit, onCancel, children }: FormProps) {
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A row that handles the key itself (auto-save) has already prevented the default.
    if (event.defaultPrevented || !(event.target instanceof HTMLInputElement)) return;
    if (event.key === 'Enter') {
      // Browsers submit on Enter only when the form has a submit button or a single field.
      event.preventDefault();
      onSubmit();
    } else if (event.key === 'Escape' && onCancel !== undefined) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form noValidate onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-6">
      {children}
    </form>
  );
}
