import type { ReactNode } from 'react';

/**
 * A page built of `GroupedSection`s, one under the other: 32px apart on touch, 24px with a fine
 * pointer, as in the iPhone Settings app.
 */
export function Sections({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-8 pt-3 pointer-fine:gap-6">{children}</div>;
}
