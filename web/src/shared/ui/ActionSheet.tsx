import * as Dialog from '@radix-ui/react-dialog';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface ActionSheetAction {
  /** Already translated button text. */
  label: string;
  /** Red: deletes or logs out. */
  destructive?: boolean;
  /** Runs when chosen; the sheet closes. */
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already translated question, e.g. «Удалить „Маша“?»; names the dialog. */
  title: string;
  /** Optional already translated explanation under the title. */
  message?: string;
  /** The choices, usually one destructive action. «Отменить» is added at the end. */
  actions: readonly ActionSheetAction[];
}

/**
 * Asks before something that can't be undone (deleting, logging out). Narrow windows: an iOS
 * action sheet sliding up from the bottom, «Отменить» in its own block. Wide windows: a centred
 * dialog. Focus moves into it and back to the trigger; Esc or a tap outside cancels.
 */
export function ActionSheet({ open, onOpenChange, title, message, actions }: ActionSheetProps) {
  const { t } = useTranslation();
  const messageId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={message === undefined ? undefined : messageId}
          className={
            'fixed z-50 flex flex-col gap-2 text-center text-label sm:gap-0 sm:rounded-[14px] sm:shadow-xl ' +
            // Narrow: a sheet at the bottom, above the home indicator.
            'inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] animate-sheet-up ' +
            // Wide: a centred dialog.
            'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-80 sm:-translate-x-1/2 ' +
            'sm:-translate-y-1/2 sm:animate-none'
          }
        >
          <div className="overflow-hidden rounded-[14px] bg-cell sm:rounded-b-none">
            <div className="px-4 pt-3.5 pb-3 sm:pt-5">
              <Dialog.Title className="text-footnote font-semibold text-secondary-label sm:text-body sm:text-label">
                {title}
              </Dialog.Title>
              {message !== undefined && (
                <Dialog.Description
                  id={messageId}
                  className="mt-1 text-footnote text-secondary-label"
                >
                  {message}
                </Dialog.Description>
              )}
            </div>
            {actions.map((action) => (
              <Dialog.Close
                key={action.label}
                onClick={action.onSelect}
                className={`${CHOICE} ${action.destructive === true ? 'text-destructive' : 'text-accent'}`}
              >
                {action.label}
              </Dialog.Close>
            ))}
          </div>
          {/* Narrow: a block of its own under the choices; wide: the last line of the dialog. */}
          <Dialog.Close
            className={
              `${CHOICE} rounded-[14px] border-t-0 bg-cell font-semibold text-accent ` +
              'sm:rounded-t-none sm:border-t'
            }
          >
            {t('ui.cancel')}
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const CHOICE =
  'flex w-full cursor-pointer items-center justify-center border-t border-separator px-4 ' +
  'text-title3 min-h-14 sm:min-h-11 sm:text-body pointer-fine:sm:min-h-10 ' +
  'hover:bg-cell-pressed/50 active:bg-cell-pressed focus-visible:outline-2 ' +
  'focus-visible:-outline-offset-2 focus-visible:outline-accent';
