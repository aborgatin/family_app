// [temp] #51 CI path filter verification; do not merge.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/AppProviders';
import { routes } from '@/app/routes';
import '@/shared/ui/theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element is missing from index.html');
}

const router = createBrowserRouter(routes);

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
