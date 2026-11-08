import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CenteredPage } from '@/shared/ui';
import { bootstrap, type Registration } from './authApi';
import { RegistrationForm } from './RegistrationForm';
import { useSession } from './session';

/** One-time registration of the first Member on a fresh installation (`/setup`). */
export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loggedIn } = useSession();

  async function register(registration: Registration) {
    loggedIn(await bootstrap(registration));
    await navigate('/', { replace: true });
  }

  return (
    <CenteredPage title={t('setup.title')} intro={t('setup.intro')}>
      <RegistrationForm
        submitLabel={t('setup.submit')}
        submittingLabel={t('setup.submitting')}
        register={register}
      />
    </CenteredPage>
  );
}
