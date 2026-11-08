import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  /** Optional large decorative icon above the text. */
  icon?: IconName;
  /** Already translated message. */
  children: ReactNode;
  /** Optional control under the message, e.g. a «Повторить» `Button`. */
  action?: ReactNode;
  /** `status` for a wait («Проверяем ссылку…»), `alert` for a failure the screen is about. */
  role?: 'status' | 'alert';
  /** No vertical padding, for a `CenteredPage` that already centres it under its title. */
  compact?: boolean;
}

/** A centred, quiet message where a screen or list has nothing to show yet. */
export function EmptyState({ icon, children, action, role, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 px-4 text-center text-secondary-label ${compact ? '' : 'py-16'}`}
    >
      {icon !== undefined && <Icon name={icon} size={48} />}
      <p role={role} className="text-body">
        {children}
      </p>
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}
