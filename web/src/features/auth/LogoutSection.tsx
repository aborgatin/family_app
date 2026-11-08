import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { ActionSheet, ListRow, Section } from '@/shared/ui';
import { logout } from './authApi';
import { useSession } from './session';

/**
 * The red «Выйти» row at the bottom of Settings, confirmed with an action sheet. Logs this device
 * out (the Member's other devices stay logged in). Online-only (S4 exception): when the server
 * can't be reached the device stays logged in and the section footer says so.
 */
export function LogoutSection() {
  const { t } = useTranslation();
  const { loggedOut } = useSession();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<ErrorMessage>();
  const [pending, setPending] = useState(false);

  async function logOut() {
    setError(undefined);
    setPending(true);
    try {
      await logout();
      loggedOut();
    } catch (failure: unknown) {
      const apiError = asApiError(failure);
      if (apiError.code === 'auth.required') {
        // The session had already ended (e.g. expired): this device is logged out either way.
        loggedOut();
        return;
      }
      setPending(false);
      setError(errorMessage(apiError));
    }
  }

  return (
    <Section footer={error !== undefined && <span role="alert">{t(error.key, error.values)}</span>}>
      <ListRow
        destructive
        title={pending ? t('logout.inProgress') : t('logout.action')}
        disabled={pending}
        onClick={() => {
          setAsking(true);
        }}
      />
      <ActionSheet
        open={asking}
        onOpenChange={setAsking}
        title={t('logout.question')}
        actions={[
          {
            label: t('logout.action'),
            destructive: true,
            onSelect: () => {
              void logOut();
            },
          },
        ]}
      />
    </Section>
  );
}
