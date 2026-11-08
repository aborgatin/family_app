import { Outlet } from 'react-router';

/**
 * The frame every screen renders in (a layout route in `app/routes.tsx`). Today it holds one
 * content pane as wide as the window, and each `Page` centres its own column in it. M2's two-pane
 * layout adds a sidebar next to the content pane here, without touching any screen.
 */
export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
