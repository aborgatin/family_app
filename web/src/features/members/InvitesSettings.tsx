import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { useLoad } from '@/shared/load';
import {
  Button,
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  useEditableList,
  useFooterLines,
  type SectionMessage,
} from '@/shared/ui';
import {
  createInvite,
  fetchInvites,
  revokeInvite,
  type Invite,
  type NewInvite,
} from './invitesApi';

// Invites are online-only by design (S4 exception).

const EXPIRY_FORMAT = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

/** How long the footer says «Ссылка скопирована». */
export const COPIED_MS = 3000;

/** The active Invites, loaded once for both «Взрослые» (adds to them) and «Приглашения». */
export function useInvites() {
  const { load, retry, update } = useLoad(fetchInvites);
  const added = useCallback(
    (invite: Invite) => {
      update((invites) => [invite, ...invites]);
    },
    [update],
  );
  const removed = useCallback(
    (id: string) => {
      update((invites) => invites.filter((invite) => invite.id !== id));
    },
    [update],
  );
  return { load, retry, added, removed };
}

export type Invites = ReturnType<typeof useInvites>;

type Copy = 'idle' | 'copied' | 'failed';

/**
 * Starts copying the link of an Invite that is still being created. The clipboard is written in
 * the same tick as the tap, with the link as a promise, so Safari keeps the user activation it
 * needs. Resolves with whether the link was copied; never rejects (no `ClipboardItem`, a
 * refusal, or a failed create are all «not copied»).
 */
function copyWhenCreated(invite: Promise<NewInvite>): Promise<boolean> {
  const link = invite.then((created) => new Blob([created.url], { type: 'text/plain' }));
  link.catch(() => undefined); // A failed create is reported by the caller.
  try {
    return navigator.clipboard.write([new ClipboardItem({ 'text/plain': link })]).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * «Пригласить взрослого…» at the end of «Взрослые»: one tap creates an Invite and copies its link.
 * If copying fails the new link shows as a row with «Скопировать» (a fresh tap). Returns the rows
 * and the section's footer lines.
 */
export function useInviteMember(onCreated: (invite: Invite) => void) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<ErrorMessage>();
  const [uncopied, setUncopied] = useState<NewInvite>();
  const [copy, setCopy] = useState<Copy>('idle');

  useEffect(() => {
    if (copy !== 'copied') return;
    const timer = setTimeout(() => {
      setCopy('idle');
    }, COPIED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copy]);

  async function invite() {
    setCreating(true);
    setError(undefined);
    setCopy('idle');
    setUncopied(undefined);
    const created = createInvite();
    const copied = copyWhenCreated(created);
    let newInvite: NewInvite;
    try {
      newInvite = await created;
    } catch (failure: unknown) {
      setCreating(false);
      setError(errorMessage(asApiError(failure)));
      return;
    }
    setCreating(false);
    onCreated(newInvite);
    if (await copied) setCopy('copied');
    else setUncopied(newInvite);
  }

  async function copyAgain(url: string) {
    setCopy('idle');
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  const rows = (
    <>
      <ListRow
        accent
        title={t('members.invites.create')}
        busy={creating}
        disabled={creating}
        onClick={() => {
          void invite();
        }}
      />
      {uncopied !== undefined && (
        <ListRow
          title={t('members.invites.newLink')}
          subtitle={uncopied.url}
          wrapSubtitle
          value={
            <Button
              onClick={() => {
                void copyAgain(uncopied.url);
              }}
            >
              {t('members.invites.copy')}
            </Button>
          }
        />
      )}
    </>
  );

  const messages: SectionMessage[] = [];
  const failure = lines.failure(error);
  if (failure !== false) messages.push(failure);
  if (copy === 'failed') messages.push({ text: t('members.invites.copyFailed'), tone: 'error' });
  if (copy === 'copied') messages.push({ text: t('members.invites.copied'), announce: true });

  /** Forgets the uncopied link once its Invite is revoked. */
  const revoked = useCallback((id: string) => {
    setUncopied((previous) => (previous?.id === id ? undefined : previous));
  }, []);

  return { rows, messages, revoked };
}

/**
 * «Приглашения»: the active Invites as rows «Ссылка · до 14 ноября», revoked through edit mode,
 * a swipe or right-click, each time after the action sheet; «Активных приглашений нет» when there
 * are none.
 */
export function InvitesSection({
  invites,
  onRevoked,
}: {
  invites: Invites;
  onRevoked: (id: string) => void;
}) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { load, retry, removed } = invites;
  const list = useEditableList();

  async function revoke(id: string) {
    await revokeInvite(id);
    removed(id);
    onRevoked(id);
  }

  const active = load.status === 'ready' ? load.value : [];
  return (
    <GroupedSection
      header={t('members.invites.title')}
      {...(active.length > 0 && { edit: list.edit })}
      messages={[
        load.status === 'failed' && lines.failure(errorMessage(load.error), retry),
        lines.failure(list.error),
      ]}
    >
      {load.status === 'loading' && <LoadingRow />}
      {load.status === 'ready' && active.length === 0 && (
        <ListRow title={t('members.invites.none')} />
      )}
      {active.map((invite) => (
        <EditableRow
          key={invite.id}
          title={t('members.invites.row', {
            date: EXPIRY_FORMAT.format(new Date(invite.expiresAt)),
          })}
          busy={list.deleting === invite.id}
          confirm={{
            title: t('members.invites.confirmRevoke'),
            message: t('members.invites.confirmRevokeMessage'),
          }}
          onDelete={() => {
            void list.remove(invite.id, active.length === 1, () => revoke(invite.id));
          }}
        />
      ))}
    </GroupedSection>
  );
}
