import { useTranslation } from 'react-i18next';
import { useSaveRejection } from '@/shared/sync';
import { Toast } from '@/shared/ui';

/**
 * «Не удалось сохранить» (with the reason, when there is one) after the server rejected a change,
 * shown once on whatever screen the Member is (spec #3 "Rejected operation").
 */
export function SaveRejectedToast() {
  const { t } = useTranslation();
  const { message, dismiss } = useSaveRejection();
  return (
    <Toast
      message={message === undefined ? undefined : t(message.key, message.values)}
      onClose={dismiss}
    />
  );
}
