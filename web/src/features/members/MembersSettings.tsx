import { useTranslation } from 'react-i18next';
import { useSession, type Member } from '@/features/auth';
import { errorMessage } from '@/shared/api';
import { InvitesSettings } from './InvitesSettings';
import { PasswordForm } from './PasswordForm';
import { ProfileForm } from './ProfileForm';
import { useMembers, type MembersLoad } from './useMembers';

/**
 * The Members section of Settings: the list of Members, the Invites, then the logged-in Member's
 * own profile and password. All of it is online-only by design (S4 exception).
 */
export function MembersSettings() {
  const { session, memberChanged } = useSession();
  const { load, retry, replaced } = useMembers();
  const me = session.member;

  function saved(member: Member) {
    memberChanged(member);
    replaced(member);
  }

  return (
    <>
      <MembersList load={load} retry={retry} myId={me?.id} />
      <InvitesSettings />
      {me !== null && <ProfileForm member={me} onSaved={saved} />}
      <PasswordForm />
    </>
  );
}

interface MembersListProps {
  load: MembersLoad;
  retry: () => void;
  myId: string | undefined;
}

function MembersList({ load, retry, myId }: MembersListProps) {
  const { t } = useTranslation();

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
      {load.value.map((member) => (
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
