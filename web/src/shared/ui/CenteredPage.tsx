import type { ReactNode } from 'react';

interface CenteredPageProps {
  /** Already translated; the large title under the app icon. */
  title: string;
  /** Already translated short text under the title. */
  intro?: string;
  children: ReactNode;
}

/**
 * A screen outside the app's navigation (setup, login, the Invite and password reset links): the
 * app icon, the large title and an optional intro, then the content, in a narrow column centred
 * in the window both ways. It has no nav bar.
 */
export function CenteredPage({ title, intro, children }: CenteredPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-100 flex-col justify-center gap-6 px-safe-4 pt-safe-8 pb-safe-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <img
          src="/icon.svg"
          alt=""
          width={80}
          height={80}
          className="size-20 rounded-[1.25rem] bg-cell p-2 shadow-sm"
        />
        <h1 className="text-large-title font-bold">{title}</h1>
        {intro !== undefined && <p className="text-subhead text-secondary-label">{intro}</p>}
      </div>
      {children}
    </main>
  );
}
