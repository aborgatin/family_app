import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, fieldErrorMessageKey, NETWORK_UNAVAILABLE } from '@/shared/api';
import type { SectionMessage } from './GroupedSection';

/**
 * Auto-save (docs/design.md "Saving and deleting"): editing something that exists saves itself,
 * text on blur or Enter, a choice on tap. These hooks hold the saving state; the rows show it
 * (`InputRow`, `SegmentedControl`) and the `GroupedSection` footer shows a failure
 * (`messages={autoSaveMessages([…])}`).
 */

/** How long a save runs before the row shows its spinner. */
export const SPINNER_DELAY_MS = 400;

/** What went wrong with a save, shown in the section footer under the row. */
export interface SaveFailure {
  /** The row's `name`. */
  row: string;
  /** Already translated message. */
  message: string;
  /** Tries the same change again; missing when trying again can't help (invalid input). */
  retry?: () => void;
  /** «Повторить», already translated. */
  retryLabel: string;
}

/**
 * The footer lines for the auto-saved rows of one `GroupedSection`: each failure in red, about
 * its row and announced, with «Повторить». Rows that failed for the same reason share one line,
 * and its «Повторить» retries all of them.
 */
export function autoSaveMessages(failures: readonly (SaveFailure | undefined)[]): SectionMessage[] {
  const byMessage = new Map<string, SaveFailure[]>();
  for (const failure of failures) {
    if (failure === undefined) continue;
    byMessage.set(failure.message, [...(byMessage.get(failure.message) ?? []), failure]);
  }
  return [...byMessage].map(([text, same]) => {
    const retries = same.flatMap((failure) => (failure.retry === undefined ? [] : [failure.retry]));
    const label = same[0]?.retryLabel ?? '';
    return {
      text,
      tone: 'error',
      row: same.map((failure) => failure.row),
      announce: true,
      ...(retries.length > 0 && {
        action: {
          label,
          onClick: () => {
            retries.forEach((retry) => {
              retry();
            });
          },
        },
      }),
    };
  });
}

interface AutoSaveOptions<T> {
  /** The row's `name` in its `GroupedSection`, which links it to its footer message. */
  name: string;
  /** The value as saved now (e.g. from the server). Read once, when the row first shows. */
  saved: T;
  /** Saves a value; resolves with the value as saved, rejects with an `ApiError`. */
  save: (value: T) => Promise<T>;
}

interface AutoSaveTextOptions extends AutoSaveOptions<string> {
  /** Already translated message when the value can't be saved as is (nothing is sent). */
  validate?: (value: string) => string | undefined;
}

/**
 * A text value that saves itself: spread `input` onto an `InputRow`. Esc puts the saved value
 * back; after a failure the typed text stays and `failure` offers «Повторить».
 */
export function useAutoSaveText({ name, saved, save, validate }: AutoSaveTextOptions) {
  const [draft, setDraftState] = useState(saved);
  const draftRef = useRef(saved);
  const savedRef = useRef(saved);
  const sending = useRef<string>(undefined);
  const { busy, failure, fail, clear, run } = useSaving(name);

  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
  }, []);

  const commit = useCallback(() => {
    const value = draftRef.current;
    if (value === sending.current) return;
    if (value === savedRef.current) {
      clear();
      return;
    }
    const invalid = validate?.(value);
    if (invalid !== undefined) {
      fail(invalid);
      return;
    }
    run({
      send: async () => {
        sending.current = value;
        try {
          return await save(value);
        } finally {
          if (sending.current === value) sending.current = undefined;
        }
      },
      saved: (result) => {
        savedRef.current = result;
        if (draftRef.current === value) setDraft(result);
      },
    });
  }, [clear, fail, run, save, setDraft, validate]);

  const revert = useCallback(() => {
    setDraft(savedRef.current);
    clear();
  }, [clear, setDraft]);

  return {
    failure,
    busy,
    /** Spread onto an `InputRow`. */
    input: { name, value: draft, onChange: setDraft, onCommit: commit, onRevert: revert, busy },
  };
}

/**
 * A choice that saves on tap. While saving it shows the new choice; when the save fails it goes
 * back to the previous one and `failure` offers «Повторить».
 */
export function useAutoSaveChoice<T>({ name, saved, save }: AutoSaveOptions<T>) {
  const [value, setValue] = useState(saved);
  const savedRef = useRef(saved);
  const { busy, failure, clear, run } = useSaving(name);

  const choose = useCallback(
    (choice: T) => {
      clear();
      run({
        send: () => {
          setValue(choice);
          return save(choice);
        },
        saved: (result) => {
          savedRef.current = result;
          setValue(result);
        },
        failed: () => {
          setValue(savedRef.current);
        },
      });
    },
    [clear, run, save],
  );

  return {
    failure,
    busy,
    /** Spread onto a `SegmentedControl`. */
    control: { name, value, onChange: choose, busy },
  };
}

interface Attempt<R> {
  /** Sends the change; called again on «Повторить». */
  send: () => Promise<R>;
  saved: (result: R) => void;
  failed?: () => void;
}

/** The spinner after ~400 ms, and the failure message, shared by both hooks. */
function useSaving(row: string) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SaveFailure>();
  const latest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = useCallback(
    (message: string, retry?: () => void) => {
      const retryLabel = t('common.retry');
      setFailure(
        retry === undefined ? { row, message, retryLabel } : { row, message, retry, retryLabel },
      );
    },
    [row, t],
  );

  const clear = useCallback(() => {
    setFailure(undefined);
  }, []);

  const run = useCallback(
    <R>({ send, saved, failed }: Attempt<R>) => {
      const retry = () => {
        setFailure(undefined);
        void attempt();
      };
      async function attempt() {
        const number = ++latest.current;
        const timer = setTimeout(() => {
          if (number === latest.current) setBusy(true);
        }, SPINNER_DELAY_MS);
        try {
          const result = await send();
          if (!mounted.current) return;
          setFailure(undefined);
          saved(result);
        } catch (error: unknown) {
          if (!mounted.current) return;
          failed?.();
          const apiError = asApiError(error);
          const field = apiError.fieldErrors[0];
          if (apiError.code === NETWORK_UNAVAILABLE) {
            fail(t('ui.saveFailed'), retry);
          } else if (field !== undefined) {
            // The server finds the value invalid: sending it again won't help.
            fail(t(fieldErrorMessageKey(field.code)));
          } else {
            const message = errorMessage(apiError);
            fail(t(message.key, message.values), retry);
          }
        } finally {
          clearTimeout(timer);
          if (mounted.current && number === latest.current) setBusy(false);
        }
      }
      void attempt();
    },
    [fail, t],
  );

  return { busy, failure, fail, clear, run };
}
