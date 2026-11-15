import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from './Link';
import { OfflineIndicator, useRegisterNavBar } from './OfflineIndicator';

interface PageProps {
  /** Already translated screen title: the large title, and the small one in the bar. */
  title: string;
  /** The previous screen: the back button shows its title. */
  back?: { to: string; title: string };
  /** The nav bar's trailing slot: one or two icon `Button`s / `Link`s. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * One screen: the large-title nav bar, then the content, both in a column centred at most 640px
 * wide. The large title scrolls away with the content; once it has gone under the bar, a small
 * centred title fades into the sticky translucent bar, as on iOS.
 */
export function Page({ title, back, actions, children }: PageProps) {
  const largeTitle = useRef<HTMLHeadingElement>(null);
  const bar = useRef<HTMLElement>(null);
  const { underBar, titleGone } = useScrolledUnder(largeTitle, bar);
  useRegisterNavBar();

  return (
    <>
      <header
        ref={bar}
        className={
          'sticky top-0 z-10 border-b pt-safe-0 transition-colors duration-200 ' +
          (underBar ? 'border-separator bg-bar backdrop-blur-xl' : 'border-transparent')
        }
      >
        <div className="mx-auto grid min-h-11 max-w-160 grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2 px-safe-2">
          <div className="flex min-w-0 justify-start">
            {back !== undefined && (
              <Link to={back.to} icon="back">
                {back.title}
              </Link>
            )}
          </div>
          <div
            aria-hidden="true"
            className={
              'truncate text-body font-semibold transition-opacity duration-200 ' +
              (titleGone ? 'opacity-100' : 'opacity-0')
            }
          >
            {title}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1">
            <OfflineIndicator />
            {actions}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-160 px-safe-4 pb-safe-8">
        <h1 ref={largeTitle} className="pt-1 pb-2 text-large-title font-bold">
          {title}
        </h1>
        {children}
      </main>
    </>
  );
}

/**
 * Whether content has scrolled under the bar (the bar turns translucent) and whether the large
 * title has gone under it entirely (the small title fades in).
 */
function useScrolledUnder(
  largeTitle: React.RefObject<HTMLElement | null>,
  bar: React.RefObject<HTMLElement | null>,
) {
  const [state, setState] = useState({ underBar: false, titleGone: false });

  useEffect(() => {
    function update() {
      const barBottom = bar.current?.getBoundingClientRect().bottom ?? 0;
      const titleBottom = largeTitle.current?.getBoundingClientRect().bottom ?? 0;
      const underBar = window.scrollY > 0;
      const titleGone = titleBottom <= barBottom && underBar;
      setState((old) =>
        old.underBar === underBar && old.titleGone === titleGone ? old : { underBar, titleGone },
      );
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [largeTitle, bar]);

  return state;
}
