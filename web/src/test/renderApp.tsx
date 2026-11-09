import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/AppProviders';
import { routes } from '@/app/routes';
import { network } from './network';

/**
 * Renders the whole app, with its real routes and providers, at `path`. `location()` is what the
 * address bar would show (path + query + hash).
 *
 * `offline: true` opens it with no signal (`network.goOffline()` first): the cold start a Member
 * makes in a shop. Combined with an earlier `renderApp` + `unmount()`, it is a restart offline,
 * with the local store the first run left behind.
 */
export function renderApp(path: string, { offline = false }: { offline?: boolean } = {}) {
  if (offline) network.goOffline();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  const location = () => {
    const { pathname, search, hash } = router.state.location;
    return pathname + search + hash;
  };
  return { ...result, location, router };
}
