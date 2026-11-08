import { useCallback, useState } from 'react';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';

/**
 * The state of an edit-mode list (`GroupedSection` with `edit`) whose rows are deleted one at a
 * time: spread `edit` onto the section, show `deleting`'s row `busy`, and `error` in the footer.
 * `remove(id, last, run)` runs a delete: it clears the last error, marks the row, and on failure
 * keeps the error; with the `last` row gone it leaves edit mode. `attempt(run)` reports another
 * change of the list (e.g. a move) the same way.
 */
export function useEditableList() {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [error, setError] = useState<ErrorMessage>();

  const attempt = useCallback(async (run: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await run();
      return true;
    } catch (failure: unknown) {
      setError(errorMessage(asApiError(failure)));
      return false;
    }
  }, []);

  const remove = useCallback(
    async (id: string, last: boolean, run: () => Promise<unknown>) => {
      setDeleting(id);
      const done = await attempt(run);
      if (done && last) setEditing(false);
      setDeleting(undefined);
    },
    [attempt],
  );

  return { edit: { editing, onEditingChange: setEditing }, deleting, error, remove, attempt };
}
