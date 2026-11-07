import type { RouteObject } from 'react-router';
import { AuthGuard, SetupPage } from '@/features/auth';
import { HomePage } from '@/features/home';

export const routes: RouteObject[] = [
  {
    // Asks the server for the session once, then redirects (e.g. to /setup on a fresh install).
    element: <AuthGuard />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/setup', element: <SetupPage /> },
    ],
  },
];
