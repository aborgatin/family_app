import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type ErrorMessage } from '@/shared/api';
import { TextField } from '@/shared/ui';
import { failureMessages, fieldMessageKey, type FieldMessages } from './fieldMessages';
import { changePassword } from './membersApi';

type Field = 'currentPassword' | 'newPassword';
const FIELDS: readonly Field[] = ['currentPassword', 'newPassword'];

/**
 * Changes the logged-in Member's password after asking for the current one. Online-only; this
 * device stays logged in.
 */
export function PasswordForm() {
  const { t } = useTranslation();
  const headingId = useId();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setChanged(false);
    setFormError(undefined);
    const missing: FieldMessages<Field> = {};
    if (currentPassword === '') missing.currentPassword = fieldMessageKey('required');
    if (newPassword === '') missing.newPassword = fieldMessageKey('required');
    setFieldErrors(missing);
    if (Object.keys(missing).length > 0) {
      return;
    }

    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setChanged(true);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === 'auth.invalid_credentials') {
        setCurrentPassword('');
        setFieldErrors({ currentPassword: 'members.password.wrongCurrent' });
      } else {
        const { fieldMessages, formMessage } = failureMessages(error, FIELDS);
        setFieldErrors(fieldMessages);
        setFormError(formMessage);
      }
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  const message = (field: Field) => {
    const key = fieldErrors[field];
    return key === undefined ? undefined : t(key);
  };

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit}>
      <h3 id={headingId}>{t('members.password.title')}</h3>
      <TextField
        label={t('members.password.current')}
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
          setChanged(false);
        }}
        error={message('currentPassword')}
      />
      <TextField
        label={t('members.password.new')}
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => {
          setNewPassword(event.target.value);
          setChanged(false);
        }}
        error={message('newPassword')}
      />
      {formError !== undefined && <p role="alert">{t(formError.key, formError.values)}</p>}
      {changed && <p role="status">{t('members.password.changed')}</p>}
      <button type="submit" disabled={saving}>
        {saving ? t('members.password.saving') : t('members.password.save')}
      </button>
    </form>
  );
}
