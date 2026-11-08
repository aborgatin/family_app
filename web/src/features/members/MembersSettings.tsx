import { useTranslation } from 'react-i18next';
import { useSession, type Member } from '@/features/auth';
import { errorMessage } from '@/shared/api';
import { Avatar, GroupedSection, ListRow, SectionContent } from '@/shared/ui';
import { InvitesSettings } from './InvitesSettings';
import { PasswordForm } from './PasswordForm';
import { ProfileSection } from './ProfileSection';
import { useMembers, type MembersLoad } from './useMembers';

/**
 * The Members' sections of Settings: «Взрослые», the Invites, the logged-in Member's own profile
 * and password. All of it is online-only by design (S4 exception).
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
      <MembersSection load={load} retry={retry} myId={me?.id} />
      {/* Invites and the password keep their M1 content, with its own heading, until their own
          tickets (spec #35). */}
      <GroupedSection>
        <SectionContent>
          <InvitesSettings />
        </SectionContent>
      </GroupedSection>
      {me !== null && <ProfileSection member={me} onSaved={saved} />}
      <GroupedSection>
        <SectionContent>
          <PasswordForm />
        </SectionContent>
      </GroupedSection>
    </>
  );
}

interface MembersSectionProps {
  load: MembersLoad;
  retry: () => void;
  myId: string | undefined;
}

/** «Взрослые»: a row per Member, not tappable; the own row says «(вы)». */
function MembersSection({ load, retry, myId }: MembersSectionProps) {
  const { t } = useTranslation();

  if (load.status === 'failed') {
    const message = errorMessage(load.error);
    return (
      <GroupedSection
        header={t('settings.members')}
        messages={[
          {
            text: t(message.key, message.values),
            tone: 'error',
            action: { label: t('common.retry'), onClick: retry },
          },
        ]}
      />
    );
  }
  return (
    <GroupedSection header={t('settings.members')}>
      {load.status === 'loading' ? (
        <ListRow title={<span role="status">{t('common.loading')}</span>} />
      ) : (
        load.value.map((member) => (
          <ListRow
            key={member.id}
            leading={<Avatar name={member.displayName} />}
            title={
              member.id === myId
                ? t('members.me', { name: member.displayName })
                : member.displayName
            }
            subtitle={member.email}
          />
        ))
      )}
    </GroupedSection>
  );
}
