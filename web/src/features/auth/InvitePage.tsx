import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { ParseKeys } from 'i18next';
import { ApiError, errorMessageKey } from '@/shared/api';
import { acceptInvite, fetchInvite, type Registration } from './authApi';
import { LOGIN_PATH } from './AuthGuard';
import { RegistrationForm } from './RegistrationForm';
import { useSession } from './session';

/** The codes that mean the link itself doesn't work; the form makes no sense then. */
const LINK_ERRORS: ReadonlySet<string> = new Set([
  'invite.not_found',
  'invite.expired',
  'invite.used',
  'invite.revoked',
]);

type LinkState =
  | { status: 'checking' }
  | { status: 'working' }
  | { status: 'broken'; message: ParseKeys }
  | { status: 'unreachable'; message: ParseKeys };

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown');
}

/**
 * Registering through an Invite link (`/invite/:token`). Says the person is invited to the Family,
 * or up front that the link is expired, used, revoked or unknown. On success the new Member is
 * logged in on this device.
 */
export function InvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { loggedIn } = useSession();

  const [link, setLink] = useState<LinkState>({ status: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchInvite(token).then(
      () => {
        if (current) setLink({ status: 'working' });
      },
      (error: unknown) => {
        if (!current) return;
        const { code } = asApiError(error);
        setLink({
          status: LINK_ERRORS.has(code) ? 'broken' : 'unreachable',
          message: errorMessageKey(code),
        });
      },
    );
    return () => {
      current = false;
    };
  }, [token, attempt]);

  async function register(registration: Registration) {
    loggedIn(await acceptInvite(token, registration));
    await navigate('/', { replace: true });
  }

  function linkBroke(error: ApiError): boolean {
    if (!LINK_ERRORS.has(error.code)) return false;
    setLink({ status: 'broken', message: errorMessageKey(error.code) });
    return true;
  }

  if (link.status === 'checking') {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <main>
      <h1>{t('invite.title')}</h1>
      {link.status === 'broken' && (
        <>
          <p role="alert">{t(link.message)}</p>
          <p>
            <Link to={LOGIN_PATH}>{t('invite.toLogin')}</Link>
          </p>
        </>
      )}
      {link.status === 'unreachable' && (
        <>
          <p role="alert">{t(link.message)}</p>
          <button
            type="button"
            onClick={() => {
              setLink({ status: 'checking' });
              setAttempt((n) => n + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </>
      )}
      {link.status === 'working' && (
        <>
          <p>{t('invite.intro')}</p>
          <RegistrationForm
            submitLabel={t('invite.submit')}
            submittingLabel={t('invite.submitting')}
            register={register}
            handled={linkBroke}
          />
        </>
      )}
    </main>
  );
}
