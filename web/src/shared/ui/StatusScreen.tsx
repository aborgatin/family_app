import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

interface StatusScreenProps {
  /** `status` while waiting («Загрузка…»), `alert` for a failure. */
  role: 'status' | 'alert';
  /** Already translated message. */
  children: ReactNode;
  /** Optional control under the message, e.g. a «Повторить» `Button`. */
  action?: ReactNode;
}

/**
 * A whole window with only a message, centred both ways: while the app starts, before any screen
 * can be shown (the session is loading, or couldn't be loaded). No title, no nav bar.
 */
export function StatusScreen({ role, children, action }: StatusScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-100 flex-col justify-center px-safe-0 pt-safe-0 pb-safe-0">
      <EmptyState role={role} action={action}>
        {children}
      </EmptyState>
    </main>
  );
}
