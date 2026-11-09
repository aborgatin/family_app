import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { flushOutbox, stopSyncAndWipe } from '@/shared/sync';
import { ActionSheet, ConfirmRow, GroupedSection, useFooterLines } from '@/shared/ui';
import { logout } from './authApi';
import { useSession } from './session';

/**
 * The red «Выйти» row at the bottom of Settings, confirmed with an action sheet. Logs this device
 * out (the Member's other devices stay logged in) and wipes the local store, so nothing of the
 * Member's data stays on the device.
 *
 * Unsent changes are sent first. When they can't be, a second action sheet warns that they will
 * be lost: «Выйти» goes on without them, «Отменить» keeps everything. A session that has already
 * ended is logged out without wiping, so the same Member gets their unsent changes back by
 * logging in again (`AuthGuard`). Logout itself is online-only (S4 exception): when the server
 * can't be reached the device stays logged in and the section footer says so.
 */
export function LogoutSection() {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { loggedOut } = useSession();
  const [error, setError] = useState<ErrorMessage>();
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState(false);

  async function logOut({ discardUnsent }: { discardUnsent: boolean }) {
    setError(undefined);
    setPending(true);
    if (!discardUnsent) {
      try {
        await flushOutbox();
      } catch (failure: unknown) {
        if (asApiError(failure).status === 401) {
          // The session had already ended: keep the store for the same Member's next login.
          loggedOut();
          return;
        }
        setPending(false);
        setWarning(true);
        return;
      }
    }
    try {
      await logout();
    } catch (failure: unknown) {
      const apiError = asApiError(failure);
      // `auth.required`: the session had already ended (e.g. expired): logged out either way.
      if (apiError.code !== 'auth.required') {
        setPending(false);
        setError(errorMessage(apiError));
        return;
      }
    }
    await stopSyncAndWipe();
    loggedOut();
  }

  return (
    <GroupedSection messages={[lines.failure(error)]}>
      <ConfirmRow
        title={pending ? t('logout.inProgress') : t('logout.action')}
        disabled={pending}
        confirm={{ title: t('logout.question'), action: t('logout.action') }}
        onConfirm={() => {
          void logOut({ discardUnsent: false });
        }}
      />
      <ActionSheet
        open={warning}
        onOpenChange={setWarning}
        title={t('logout.unsentWarning')}
        actions={[
          {
            label: t('logout.action'),
            destructive: true,
            onSelect: () => {
              void logOut({ discardUnsent: true });
            },
          },
        ]}
      />
    </GroupedSection>
  );
}
