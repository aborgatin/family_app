import { useTranslation } from 'react-i18next';
import { ActionSheet, ConfirmRow, GroupedSection, useFooterLines } from '@/shared/ui';
import { useLogout } from './useLogout';

/**
 * The red «Выйти» row at the bottom of Settings, confirmed with an action sheet. Logs this device
 * out (the Member's other devices stay logged in) and wipes the local store (`useLogout`).
 *
 * When unsent changes can't be sent first, a second action sheet warns that they will be lost:
 * «Выйти» goes on without them, «Отменить» keeps everything.
 */
export function LogoutSection() {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { logOut, pending, error, unsentWarning, dismissWarning } = useLogout();

  return (
    <GroupedSection messages={[lines.failure(error)]}>
      <ConfirmRow
        title={pending ? t('logout.inProgress') : t('logout.action')}
        disabled={pending}
        confirm={{ title: t('logout.question'), action: t('logout.action') }}
        onConfirm={() => {
          void logOut();
        }}
      />
      <ActionSheet
        open={unsentWarning}
        onOpenChange={(open) => {
          if (!open) dismissWarning();
        }}
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
