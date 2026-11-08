import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  asApiError,
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { Button, Form, GroupedSection, InputRow, useFooterLines } from '@/shared/ui';
import { completePasswordReset, fetchPasswordReset } from './authApi';
import { LinkScreen } from './LinkScreen';
import { useSession } from './session';
import { useLinkCheck } from './useLinkCheck';

/** The codes that mean the link itself doesn't work; the form makes no sense then. */
const FIELDS = ['newPassword'] as const;

const LINK_ERRORS: ReadonlySet<string> = new Set([
  'password_reset.not_found',
  'password_reset.expired',
  'password_reset.used',
]);

/**
 * Setting a new password from a one-time reset link (`/reset-password/:token`) that the operator
 * created. Says up front when the link is expired, used or unknown. On success this device is
 * logged in and every other device of the Member is logged out (by the server).
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const { loggedIn } = useSession();

  const { link, retry, broke } = useLinkCheck(() => fetchPasswordReset(token), token, LINK_ERRORS);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<'newPassword'>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    setFormError(undefined);
    if (password === '') {
      setFieldErrors({ newPassword: fieldMessageKey('required') });
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      loggedIn(await completePasswordReset(token, password));
      await navigate('/', { replace: true });
    } catch (error: unknown) {
      setSubmitting(false);
      const apiError = asApiError(error);
      if (broke(apiError.code)) return;
      const { fieldMessages, formMessage } = failureMessages(apiError, FIELDS);
      setFieldErrors(fieldMessages);
      setFormError(formMessage);
    }
  }

  return (
    <LinkScreen
      title={t('resetPassword.title')}
      intro={t('resetPassword.intro')}
      link={link}
      retry={retry}
      toLogin={t('resetPassword.toLogin')}
    >
      <Form onSubmit={() => void save()}>
        <GroupedSection
          messages={lines.form({
            fields: FIELDS,
            fieldErrors,
            formError,
            hints: { newPassword: t('resetPassword.passwordHint') },
          })}
        >
          <InputRow
            label={t('resetPassword.newPassword')}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
        </GroupedSection>
        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
        </Button>
      </Form>
    </LinkScreen>
  );
}
