import type { RouteObject } from 'react-router';
import { AuthGuard, LoginPage, SetupPage } from '@/features/auth';
import { HomePage } from '@/features/home';
import { SettingsPage, SETTINGS_PATH } from '@/features/settings';

export const routes: RouteObject[] = [
  {
    // Asks the server for the session once, then redirects: to /setup on a fresh install, to
    // /login (and back afterwards) when this device is logged out.
    element: <AuthGuard />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/setup', element: <SetupPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: SETTINGS_PATH, element: <SettingsPage /> },
    ],
  },
];
