import { useTranslation } from 'react-i18next';
import type { SaveFailureState } from './autoSave';
import { Button } from './Button';

interface SaveFailureProps {
  /** The `failure` of each auto-saved row in the section; the missing ones show nothing. */
  failures: readonly (SaveFailureState | undefined)[];
}

/**
 * A section footer saying why a change wasn't saved, in red, with «Повторить» when trying again
 * can help. Put it in the `footer` of the `Section` that holds the rows. Rows that failed for the
 * same reason share one message, and its «Повторить» retries all of them.
 */
export function SaveFailure({ failures }: SaveFailureProps) {
  const { t } = useTranslation();
  const byMessage = new Map<string, SaveFailureState[]>();
  for (const failure of failures) {
    if (failure === undefined) continue;
    byMessage.set(failure.message, [...(byMessage.get(failure.message) ?? []), failure]);
  }
  if (byMessage.size === 0) return null;
  return (
    <>
      {[...byMessage].map(([message, same]) => {
        const retries = same.flatMap((failure) =>
          failure.retry === undefined ? [] : [failure.retry],
        );
        return (
          <p key={message} className="text-destructive">
            {/* Each row's aria-describedby points at one of these ids. */}
            {same.slice(1).map((failure) => (
              <span key={failure.id} id={failure.id} hidden>
                {message}
              </span>
            ))}
            <span id={same[0]?.id} role="alert">
              {message}
            </span>{' '}
            {retries.length > 0 && (
              <Button
                size="small"
                onClick={() => {
                  retries.forEach((retry) => {
                    retry();
                  });
                }}
              >
                {t('common.retry')}
              </Button>
            )}
          </p>
        );
      })}
    </>
  );
}
