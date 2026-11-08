import { useTranslation } from 'react-i18next';
import { useSession, type Member } from '@/features/auth';
import { errorMessage } from '@/shared/api';
import type { ReactNode } from 'react';
import { Avatar, GroupedSection, ListRow, SectionContent, type SectionMessage } from '@/shared/ui';
import { InvitesSection, useInviteAdult, useInvites } from './InvitesSettings';
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
  const invites = useInvites();
  const inviting = useInviteAdult(invites.added);

  function saved(member: Member) {
    memberChanged(member);
    replaced(member);
  }

  return (
    <>
      <MembersSection
        load={load}
        retry={retry}
        myId={me?.id}
        inviteRows={inviting.rows}
        inviteMessages={inviting.messages}
      />
      <InvitesSection invites={invites} onRevoked={inviting.revoked} />
      {/* The password keeps its M1 content until its own ticket (spec #35). */}
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
  /** «Пригласить взрослого…» (and the link it couldn't copy), after the Members. */
  inviteRows: ReactNode;
  inviteMessages: readonly SectionMessage[];
}

/**
 * «Взрослые»: a row per Member, not tappable; the own row says «(вы)». Then «Пригласить
 * взрослого…».
 */
function MembersSection({ load, retry, myId, inviteRows, inviteMessages }: MembersSectionProps) {
  const { t } = useTranslation();
  const failure = load.status === 'failed' ? errorMessage(load.error) : undefined;
  const messages: SectionMessage[] = [];
  if (failure !== undefined) {
    messages.push({
      text: t(failure.key, failure.values),
      tone: 'error',
      action: { label: t('common.retry'), onClick: retry },
    });
  }
  messages.push(...inviteMessages);
  if (messages.length === 0) messages.push({ text: t('members.invites.hint') });

  return (
    <GroupedSection header={t('settings.members')} messages={messages}>
      {load.status === 'loading' && (
        <ListRow title={<span role="status">{t('common.loading')}</span>} />
      )}
      {load.status === 'ready' &&
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
        ))}
      {inviteRows}
    </GroupedSection>
  );
}
