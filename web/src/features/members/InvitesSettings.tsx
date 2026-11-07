import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { TextField } from '@/shared/ui';
import {
  createInvite,
  fetchInvites,
  revokeInvite,
  type Invite,
  type NewInvite,
} from './invitesApi';

type InvitesLoad =
  | { status: 'loading' }
  | { status: 'failed'; error: ApiError }
  | { status: 'ready'; invites: Invite[] };

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown');
}

const EXPIRY_FORMAT = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

/**
 * Invites in Settings › Members: create a link and send it through the share sheet (or copy it),
 * see the active Invites and revoke one after confirming. Online-only by design (S4 exception).
 */
export function InvitesSettings() {
  const { t } = useTranslation();
  const headingId = useId();
  const [load, setLoad] = useState<InvitesLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [newInvite, setNewInvite] = useState<NewInvite>();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ErrorMessage>();

  useEffect(() => {
    let current = true;
    fetchInvites().then(
      (invites) => {
        if (current) setLoad({ status: 'ready', invites });
      },
      (error: unknown) => {
        if (current) setLoad({ status: 'failed', error: asApiError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  async function create() {
    setCreating(true);
    setCreateError(undefined);
    try {
      const invite = await createInvite();
      setNewInvite(invite);
      setLoad((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', invites: [invite, ...previous.invites] }
          : previous,
      );
    } catch (error: unknown) {
      setCreateError(errorMessage(asApiError(error)));
    } finally {
      setCreating(false);
    }
  }

  const revoked = useCallback((id: string) => {
    setLoad((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', invites: previous.invites.filter((invite) => invite.id !== id) }
        : previous,
    );
    setNewInvite((previous) => (previous?.id === id ? undefined : previous));
  }, []);

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{t('members.invites.title')}</h3>
      <p>{t('members.invites.intro')}</p>
      <button
        type="button"
        disabled={creating}
        onClick={() => {
          void create();
        }}
      >
        {creating ? t('members.invites.creating') : t('members.invites.create')}
      </button>
      {createError !== undefined && <p role="alert">{t(createError.key, createError.values)}</p>}
      {newInvite !== undefined && <NewInviteLink key={newInvite.id} url={newInvite.url} />}
      {load.status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {load.status === 'failed' && (
        <>
          <p role="alert">{t(errorMessage(load.error).key, errorMessage(load.error).values)}</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </>
      )}
      {load.status === 'ready' && load.invites.length === 0 && <p>{t('members.invites.none')}</p>}
      {load.status === 'ready' && load.invites.length > 0 && (
        <ul aria-label={t('members.invites.active')}>
          {load.invites.map((invite) => (
            <InviteItem key={invite.id} invite={invite} onRevoked={revoked} />
          ))}
        </ul>
      )}
    </section>
  );
}

type Sent = 'idle' | 'copied' | 'copyFailed';

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** The link just created, the only time it can be seen: share it, or copy it as a fallback. */
function NewInviteLink({ url }: { url: string }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState<Sent>('idle');
  const canShare = 'share' in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setSent('copied');
    } catch {
      setSent('copyFailed');
    }
  }

  async function share() {
    setSent('idle');
    try {
      await navigator.share({ title: t('members.invites.shareTitle'), url });
    } catch (error: unknown) {
      // Closing the share sheet is not a failure; anything else falls back to copying.
      if (!isAbort(error)) await copy();
    }
  }

  return (
    <div>
      <TextField
        label={t('members.invites.link')}
        readOnly
        value={url}
        onFocus={(event) => {
          event.target.select();
        }}
      />
      <button
        type="button"
        onClick={() => {
          void (canShare ? share() : copy());
        }}
      >
        {canShare ? t('members.invites.share') : t('members.invites.copy')}
      </button>
      {sent === 'copied' && <p role="status">{t('members.invites.copied')}</p>}
      {sent === 'copyFailed' && <p role="alert">{t('members.invites.copyFailed')}</p>}
    </div>
  );
}

interface InviteItemProps {
  invite: Invite;
  onRevoked: (id: string) => void;
}

/** One active Invite, with «Отозвать» behind a confirmation. */
function InviteItem({ invite, onRevoked }: InviteItemProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<ErrorMessage>();

  async function revoke() {
    setRevoking(true);
    setError(undefined);
    try {
      await revokeInvite(invite.id);
      onRevoked(invite.id);
    } catch (failure: unknown) {
      setRevoking(false);
      setError(errorMessage(asApiError(failure)));
    }
  }

  return (
    <li>
      <span>
        {t('members.invites.expiresAt', {
          date: EXPIRY_FORMAT.format(new Date(invite.expiresAt)),
        })}
      </span>{' '}
      {confirming ? (
        <>
          <span>{t('members.invites.confirmRevoke')}</span>{' '}
          <button
            type="button"
            disabled={revoking}
            onClick={() => {
              void revoke();
            }}
          >
            {t('members.invites.revokeConfirmed')}
          </button>{' '}
          <button
            type="button"
            disabled={revoking}
            onClick={() => {
              setConfirming(false);
              setError(undefined);
            }}
          >
            {t('members.invites.cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t('members.invites.revoke')}
        </button>
      )}
      {error !== undefined && <p role="alert">{t(error.key, error.values)}</p>}
    </li>
  );
}
