import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, fieldErrorMessageKey, NETWORK_UNAVAILABLE } from '@/shared/api';

/**
 * Auto-save (docs/design.md "Saving and deleting"): editing something that exists saves itself,
 * text on blur or Enter, a choice on tap. These hooks hold the saving state; the rows show it
 * (`InputRow`, `SegmentedRow`) and the section footer shows a failure (`SaveFailure`).
 */

/** How long a save runs before the row shows its spinner. */
export const SPINNER_DELAY_MS = 400;

/** What went wrong with a save, shown in the section footer under the row. */
export interface SaveFailureState {
  /** Id of the message, for the row's `aria-describedby`. */
  id: string;
  /** Already translated message. */
  message: string;
  /** Tries the same change again; missing when trying again can't help (invalid input). */
  retry?: () => void;
}

interface AutoSaveOptions<T> {
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
export function useAutoSaveText({ saved, save, validate }: AutoSaveTextOptions) {
  const [draft, setDraftState] = useState(saved);
  const draftRef = useRef(saved);
  const savedRef = useRef(saved);
  const sending = useRef<string>(undefined);
  const { busy, failure, fail, clear, run } = useSaving();

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
    input: {
      value: draft,
      onChange: setDraft,
      onCommit: commit,
      onRevert: revert,
      busy,
      invalid: failure !== undefined,
      describedBy: failure?.id,
    },
  };
}

/**
 * A choice that saves on tap. While saving it shows the new choice; when the save fails it goes
 * back to the previous one and `failure` offers «Повторить». Spread `control` onto a
 * `SegmentedRow`.
 */
export function useAutoSaveChoice<T>({ saved, save }: AutoSaveOptions<T>) {
  const [value, setValue] = useState(saved);
  const savedRef = useRef(saved);
  const { busy, failure, clear, run } = useSaving();

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
    control: {
      value,
      onChange: choose,
      busy,
      invalid: failure !== undefined,
      describedBy: failure?.id,
    },
  };
}

interface Attempt<R> {
  /** Sends the change; called again on «Повторить». */
  send: () => Promise<R>;
  saved: (result: R) => void;
  failed?: () => void;
}

/** The spinner after ~400 ms, and the failure message, shared by both hooks. */
function useSaving() {
  const { t } = useTranslation();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SaveFailureState>();
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
      setFailure(retry === undefined ? { id, message } : { id, message, retry });
    },
    [id],
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
