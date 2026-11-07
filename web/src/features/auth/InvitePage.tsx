import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import type { ApiError } from '@/shared/api';
import { acceptInvite, fetchInvite, type Registration } from './authApi';
import { LOGIN_PATH } from './AuthGuard';
import { RegistrationForm } from './RegistrationForm';
import { useSession } from './session';
import { useLinkCheck } from './useLinkCheck';

/** The codes that mean the link itself doesn't work; the form makes no sense then. */
const LINK_ERRORS: ReadonlySet<string> = new Set([
  'invite.not_found',
  'invite.expired',
  'invite.used',
  'invite.revoked',
]);

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

  const { link, retry, broke } = useLinkCheck(() => fetchInvite(token), token, LINK_ERRORS);

  async function register(registration: Registration) {
    loggedIn(await acceptInvite(token, registration));
    await navigate('/', { replace: true });
  }

  function linkBroke(error: ApiError): boolean {
    return broke(error.code);
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
          <button type="button" onClick={retry}>
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
