import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface ToastProps {
  /** Already translated message; nothing is shown while it is `undefined`. */
  message: string | undefined;
  /** Closes it (the ⓧ button). */
  onClose: () => void;
}

/**
 * A short message about something that happened away from the screen, floating above the bottom
 * of the window, in the 640px column, until closed: today only «Не удалось сохранить» after the
 * server rejected a change. Announced as an `alert`. Placed once, by the app, never by a screen.
 */
export function Toast({ message, onClose }: ToastProps) {
  const { t } = useTranslation();
  if (message === undefined) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 pb-safe-4">
      <div
        role="alert"
        className={
          'pointer-events-auto mx-auto flex max-w-[min(40rem,calc(100vw-2rem))] items-center gap-2 ' +
          'rounded-xl border border-separator bg-cell py-1 pl-4 pr-1 text-subhead text-destructive ' +
          'shadow-lg'
        }
      >
        <span className="min-w-0 flex-1 py-2">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className={
            'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg ' +
            'text-secondary-label hover:opacity-70 active:opacity-50 ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
            'pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-fine:min-h-7 pointer-fine:min-w-7'
          }
        >
          <Icon name="clear" size={20} />
        </button>
      </div>
    </div>
  );
}
