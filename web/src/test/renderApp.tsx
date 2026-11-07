import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/AppProviders';
import { routes } from '@/app/routes';

/**
 * Renders the whole app, with its real routes and providers, at `path`. `location()` is what the
 * address bar would show (path + query + hash).
 */
export function renderApp(path: string) {
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
  return { ...result, location };
}
