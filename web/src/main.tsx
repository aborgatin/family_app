import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/AppProviders';
import { routes } from '@/app/routes';
import { startAppUpdates } from '@/shared/pwa';
import '@/shared/ui/theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element is missing from index.html');
}

const router = createBrowserRouter(routes);

// A new version is picked up when the installed app comes back, without a force-close (#126).
startAppUpdates();

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
