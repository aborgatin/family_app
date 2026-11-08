import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage, fieldErrorMessageKey } from '@/shared/api';
import { Button, CenteredPage, Form, GroupedSection, InputRow } from '@/shared/ui';
import { login } from './authApi';
import { useSession } from './session';

/**
 * Login on this device (`/login`). On success the route guard takes the Member to where they were
 * going before it sent them here.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { loggedIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [formError, setFormError] = useState<ErrorMessage>();
  const [submitting, setSubmitting] = useState(false);

  async function logIn() {
    const nowMissing = { email: email.trim() === '', password: password === '' };
    setMissing(nowMissing);
    setFormError(undefined);
    if (nowMissing.email || nowMissing.password) {
      return;
    }

    setSubmitting(true);
    try {
      loggedIn(await login({ email, password }));
    } catch (error: unknown) {
      setSubmitting(false);
      const apiError = asApiError(error);
      if (apiError.code === 'auth.invalid_credentials') {
        setPassword('');
      }
      setFormError(errorMessage(apiError));
    }
  }

  const required = t(fieldErrorMessageKey('required'));

  return (
    <CenteredPage title={t('login.title')}>
      <Form onSubmit={() => void logIn()}>
        <GroupedSection
          messages={[
            missing.email && { row: 'email', text: required, tone: 'error' },
            missing.password && { row: 'password', text: required, tone: 'error' },
            formError !== undefined && {
              text: t(formError.key, formError.values),
              tone: 'error',
            },
          ]}
        >
          <InputRow
            label={t('login.email')}
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={setEmail}
          />
          <InputRow
            label={t('login.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
        </GroupedSection>
        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </Button>
      </Form>
    </CenteredPage>
  );
}
