import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { autoSaveMessages, GroupedSection, SwitchRow, useAutoSaveChoice } from '@/shared/ui';
import { switchNotifications } from './notificationsApi';

const SWITCH = 'notificationsEnabled';

/**
 * Settings «Уведомления»: the Member's Notifications switch (saved at once, online only, S4
 * exception).
 */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { session, memberChanged } = useSession();
  const enabled = session.member?.notificationsEnabled ?? false;

  const save = useCallback(
    async (value: boolean) => {
      const updated = await switchNotifications(value);
      memberChanged(updated);
      return updated.notificationsEnabled;
    },
    [memberChanged],
  );
  const toggle = useAutoSaveChoice({ name: SWITCH, saved: enabled, save });

  const failures = autoSaveMessages([toggle.failure]);
  return (
    <GroupedSection
      header={t('settings.notifications.title')}
      messages={[
        ...(failures.length > 0 ? failures : [{ text: t('settings.notifications.about'), row: SWITCH }]),
      ]}
    >
      <SwitchRow label={t('settings.notifications.switch')} {...toggle.control} />
    </GroupedSection>
  );
}
