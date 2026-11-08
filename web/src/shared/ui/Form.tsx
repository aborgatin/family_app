import type { ReactNode, SubmitEvent } from 'react';

interface FormProps {
  /** Called on Enter in a field and on the form's `type="submit"` Button. */
  onSubmit: () => void;
  children: ReactNode;
}

/**
 * A form with an explicit confirm (the auth screens). Enter in any field submits. The browser's
 * own validation bubbles are off: the screen shows its messages in the group footer.
 */
export function Form({ onSubmit, children }: FormProps) {
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {children}
    </form>
  );
}
