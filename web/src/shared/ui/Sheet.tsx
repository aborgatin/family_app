import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode, SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { controlClasses } from './controlStyles';

interface SheetProps {
  open: boolean;
  /** `false` on «Отмена» and Esc: the screen closes the sheet without saving. */
  onOpenChange: (open: boolean) => void;
  /** Already translated, e.g. «Новый ребёнок»; names the dialog. */
  title: string;
  /** «Готово», or Enter in a text field: the screen validates and saves, then closes the sheet. */
  onDone: () => void;
  /** While saving: «Готово» is disabled. */
  busy?: boolean;
  /** The sheet's `GroupedSection`s. */
  children: ReactNode;
}

/**
 * Creates something only on an explicit «Готово» («Новый ребёнок», «Новое поле»), so a
 * half-filled item is never saved. A header with «Отмена», the title and «Готово», then the rows.
 * Narrow windows: an iOS sheet sliding up from the bottom, almost the full height. Wide windows: a
 * centred dialog. Esc cancels; a tap outside does nothing (it would lose what was typed). Focus
 * starts in the first field and goes back to the trigger.
 */
export function Sheet({ open, onOpenChange, title, onDone, busy = false, children }: SheetProps) {
  const { t } = useTranslation();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) onDone();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            const field = (event.currentTarget as HTMLElement | null)?.querySelector('input');
            if (field !== null && field !== undefined) {
              event.preventDefault();
              field.focus();
            }
          }}
          className={
            'fixed z-50 flex flex-col overflow-hidden bg-background text-label shadow-xl ' +
            // Narrow: a sheet from the bottom, leaving a strip of the page above it.
            'inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] bottom-0 rounded-t-[10px] ' +
            'animate-sheet-up ' +
            // Wide: a centred dialog.
            'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[min(42rem,85vh)] ' +
            'sm:w-[min(33.75rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 ' +
            'sm:rounded-[14px] sm:animate-none'
          }
        >
          <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-2 pb-1">
              <Dialog.Close className={`${controlClasses('plain')} justify-self-start`}>
                {t('ui.sheetCancel')}
              </Dialog.Close>
              <Dialog.Title className="truncate text-body font-semibold">{title}</Dialog.Title>
              <button
                type="submit"
                disabled={busy}
                className={`${controlClasses('plain')} justify-self-end font-semibold`}
              >
                {t('ui.done')}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-safe-8 sm:pb-6">
              {children}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
