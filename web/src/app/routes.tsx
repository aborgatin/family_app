import type { RouteObject } from 'react-router';
import {
  AuthGuard,
  INVITE_PATH,
  InvitePage,
  LoginPage,
  RESET_PASSWORD_PATH,
  ResetPasswordPage,
  SetupPage,
} from '@/features/auth';
import { HomePage } from '@/features/home';
import { PASSWORD_PATH, PasswordPage } from '@/features/members';
import { SettingsPage, SETTINGS_PATH } from '@/features/settings';
import { AppShell } from '@/shared/ui';

export const routes: RouteObject[] = [
  {
    // The frame around every screen (and, from M2, the sidebar).
    element: <AppShell />,
    children: [
      {
        // Asks the server for the session once, then redirects: to /setup on a fresh install, to
        // /login (and back afterwards) when this device is logged out.
        element: <AuthGuard />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/setup', element: <SetupPage /> },
          { path: '/login', element: <LoginPage /> },
          { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
          { path: INVITE_PATH, element: <InvitePage /> },
          { path: SETTINGS_PATH, element: <SettingsPage /> },
          { path: PASSWORD_PATH, element: <PasswordPage settingsPath={SETTINGS_PATH} /> },
        ],
      },
    ],
  },
];
