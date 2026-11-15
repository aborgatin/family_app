import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { updateProfile } from '@/features/members';
import {
  autoSaveMessages,
  GroupedSection,
  ListRow,
  SwitchRow,
  useAutoSaveChoice,
  useFooterLines,
  type SectionMessage,
} from '@/shared/ui';
import { usePushDevice } from './usePushDevice';

/** The switch row's `name`, which its footer messages refer to. */
const SWITCH_ROW = 'notificationsEnabled';

/**
 * Settings «Уведомления»: the Member's Notifications switch (saved at once, online only, S4
 * exception), and below it what this device can do about push.
 */
export function NotificationsSection() {
  const { t } = useTranslation();
  const { session, memberChanged } = useSession();
  const enabled = session.member?.notificationsEnabled ?? false;
  const device = usePushDevice();

  const { enable } = device;
  const save = useCallback(
    async (value: boolean) => {
      // Inside the tap, before anything is awaited: iOS shows its prompt only then.
      if (value) enable();
      const updated = await updateProfile({ notificationsEnabled: value });
      memberChanged(updated);
      return updated.notificationsEnabled;
    },
    [enable, memberChanged],
  );
  const toggle = useAutoSaveChoice({ name: SWITCH_ROW, saved: enabled, save });

  const lines = useFooterLines();
  const failures = autoSaveMessages([toggle.failure]);
  const messages: (SectionMessage | false)[] =
    failures.length > 0 ? failures : [{ text: t('settings.notifications.about'), row: SWITCH_ROW }];
  if (device.state === 'unavailable') {
    messages.push({ text: t('settings.notifications.unavailable') });
  } else if (device.state === 'denied') {
    messages.push({ text: t('settings.notifications.denied') });
  }
  messages.push(lines.failure(device.failure));
  // On, but not on this device: permission not asked here yet, or no subscription.
  const offerThisDevice = toggle.control.value && device.state === 'notSubscribed';

  return (
    <GroupedSection header={t('settings.notifications.title')} messages={messages}>
      <SwitchRow label={t('settings.notifications.switch')} {...toggle.control} />
      {offerThisDevice && (
        <ListRow title={t('settings.notifications.enableHere')} accent onClick={enable} />
      )}
    </GroupedSection>
  );
}
