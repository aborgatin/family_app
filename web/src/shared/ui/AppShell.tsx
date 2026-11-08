import { useCallback, useState } from 'react';
import { Outlet } from 'react-router';
import { NavBarRegistry, OfflineCorner } from './OfflineIndicator';

/**
 * The frame every screen renders in (a layout route in `app/routes.tsx`). Today it holds one
 * content pane as wide as the window, and each `Page` centres its own column in it. M2's two-pane
 * layout adds a sidebar next to the content pane here, without touching any screen.
 *
 * It also owns the offline indicator's fallback spot: screens without a nav bar (auth, start-up
 * error) get it in the same top-right corner; a `Page` shows it in its own nav bar.
 */
export function AppShell() {
  const [navBars, setNavBars] = useState(0);
  const register = useCallback(() => {
    setNavBars((count) => count + 1);
    return () => {
      setNavBars((count) => count - 1);
    };
  }, []);

  return (
    <NavBarRegistry value={register}>
      <div className="flex min-h-dvh">
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
      <OfflineCorner navBarShown={navBars > 0} />
    </NavBarRegistry>
  );
}
