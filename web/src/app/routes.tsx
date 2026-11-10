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
import { CHILD_PATH, CHILD_SETTINGS_PATH, ChildPage, ChildSettingsPage } from '@/features/children';
import { HOME_PATH, HomePage } from '@/features/home';
import {
  CategoriesPage,
  DoneEarlierPage,
  ItemPage,
  LIST_CATEGORIES_PATH,
  LIST_DONE_EARLIER_PATH,
  LIST_ITEM_PATH,
  LIST_PATH,
  LIST_SETTINGS_PATH,
  ListPage,
  ListSettingsPage,
  ListsSection,
} from '@/features/lists';
import { PASSWORD_PATH, PasswordPage } from '@/features/members';
import { SettingsPage, SETTINGS_PATH } from '@/features/settings';
import { AppShell } from '@/shared/ui';
import { SaveRejectedToast } from './SaveRejectedToast';

export const routes: RouteObject[] = [
  {
    // The frame around every screen (and, from M2, the sidebar), and the one place that says a
    // change was rejected.
    element: (
      <>
        <AppShell />
        <SaveRejectedToast />
      </>
    ),
    children: [
      {
        // Asks the server for the session once, then redirects: to /setup on a fresh install, to
        // /login (and back afterwards) when this device is logged out.
        element: <AuthGuard />,
        children: [
          { path: HOME_PATH, element: <HomePage /> },
          { path: CHILD_PATH, element: <ChildPage homePath={HOME_PATH} lists={ListsSection} /> },
          { path: LIST_PATH, element: <ListPage homePath={HOME_PATH} /> },
          { path: LIST_SETTINGS_PATH, element: <ListSettingsPage homePath={HOME_PATH} /> },
          { path: LIST_CATEGORIES_PATH, element: <CategoriesPage homePath={HOME_PATH} /> },
          { path: LIST_ITEM_PATH, element: <ItemPage homePath={HOME_PATH} /> },
          { path: LIST_DONE_EARLIER_PATH, element: <DoneEarlierPage homePath={HOME_PATH} /> },
          { path: '/setup', element: <SetupPage /> },
          { path: '/login', element: <LoginPage /> },
          { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
          { path: INVITE_PATH, element: <InvitePage /> },
          { path: SETTINGS_PATH, element: <SettingsPage homePath={HOME_PATH} /> },
          { path: PASSWORD_PATH, element: <PasswordPage settingsPath={SETTINGS_PATH} /> },
          {
            path: CHILD_SETTINGS_PATH,
            element: <ChildSettingsPage settingsPath={SETTINGS_PATH} />,
          },
        ],
      },
    ],
  },
];
