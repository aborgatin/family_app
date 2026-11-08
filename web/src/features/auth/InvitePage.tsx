import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { ApiError } from '@/shared/api';
import { acceptInvite, fetchInvite, type Registration } from './authApi';
import { LinkScreen } from './LinkScreen';
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

  return (
    <LinkScreen
      title={t('invite.title')}
      intro={t('invite.intro')}
      link={link}
      retry={retry}
      toLogin={t('invite.toLogin')}
    >
      <RegistrationForm
        submitLabel={t('invite.submit')}
        submittingLabel={t('invite.submitting')}
        register={register}
        handled={linkBroke}
      />
    </LinkScreen>
  );
}
