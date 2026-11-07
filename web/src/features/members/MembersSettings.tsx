import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { errorMessage } from '@/shared/api';
import { useMembers } from './useMembers';

/** The Members section of Settings: the list of Members and the own profile and password. */
export function MembersSettings() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { load, retry } = useMembers();
  const myId = session.member?.id;

  if (load.status === 'loading') {
    return <p role="status">{t('common.loading')}</p>;
  }
  if (load.status === 'failed') {
    const message = errorMessage(load.error);
    return (
      <>
        <p role="alert">{t(message.key, message.values)}</p>
        <button type="button" onClick={retry}>
          {t('common.retry')}
        </button>
      </>
    );
  }

  return (
    <ul aria-label={t('settings.members')}>
      {load.members.map((member) => (
        <li key={member.id}>
          <span>
            {member.id === myId
              ? t('members.me', { name: member.displayName })
              : member.displayName}
          </span>{' '}
          <span>{member.email}</span>
        </li>
      ))}
    </ul>
  );
}
