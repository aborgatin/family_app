import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import {
  autoSaveMessages,
  GroupedSection,
  SwitchRow,
  useAutoSaveChoice,
  type SectionMessage,
} from '@/shared/ui';
import { switchNotifications } from './notificationsApi';
import { usePushDevice } from './usePushDevice';

const SWITCH = 'notificationsEnabled';

/**
 * Settings «Уведомления»: the Member's Notifications switch (saved at once, online only, S4
 * exception), and below it what this device can do about push.
 */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { session, memberChanged } = useSession();
  const enabled = session.member?.notificationsEnabled ?? false;
  const device = usePushDevice();

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
  const messages: SectionMessage[] = [
    ...(failures.length > 0
      ? failures
      : [{ text: t('settings.notifications.about'), row: SWITCH }]),
  ];
  if (device.state === 'unavailable') {
    messages.push({ text: t('settings.notifications.unavailable') });
  } else if (device.state === 'denied') {
    messages.push({ text: t('settings.notifications.denied') });
  }

  return (
    <GroupedSection header={t('settings.notifications.title')} messages={messages}>
      <SwitchRow label={t('settings.notifications.switch')} {...toggle.control} />
    </GroupedSection>
  );
}
