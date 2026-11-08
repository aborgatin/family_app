import * as ContextMenu from '@radix-ui/react-context-menu';
import { useSyncExternalStore, type ReactNode } from 'react';

const FINE_POINTER = '(pointer: fine)';

function subscribe(changed: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener('change', changed);
  return () => {
    query.removeEventListener('change', changed);
  };
}

/** Whether the main pointer is a mouse or trackpad (no `matchMedia`, as in tests: yes). */
function useFinePointer(): boolean {
  return useSyncExternalStore(subscribe, () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(FINE_POINTER).matches : true,
  );
}

export interface RowMenuItem {
  /** Already translated. */
  label: string;
  destructive?: boolean;
  onSelect: () => void;
}

interface RowContextMenuProps {
  items: readonly RowMenuItem[];
  /** Off: right-click shows the browser's own menu. */
  disabled?: boolean;
  /** The row (one element, which receives the right-click). */
  children: ReactNode;
}

/**
 * Right-click on a row → a small menu (e.g. «Удалить»), as on the Mac. Fine pointer only: on a
 * touch screen a long press does nothing here (the row is swiped instead). Keyboard: the
 * context-menu key or Shift+F10 opens it, arrows move, Enter picks, Esc closes.
 */
export function RowContextMenu({ items, disabled = false, children }: RowContextMenuProps) {
  const fine = useFinePointer();
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild disabled={disabled || !fine}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-40 rounded-lg border border-separator bg-cell p-1 text-body shadow-xl">
          {items.map((item) => (
            <ContextMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={
                'cursor-pointer rounded-md px-3 py-1 outline-none select-none ' +
                'data-highlighted:bg-accent data-highlighted:text-on-accent ' +
                (item.destructive === true ? 'text-destructive' : 'text-label')
              }
            >
              {item.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
