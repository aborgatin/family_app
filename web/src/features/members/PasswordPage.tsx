import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, failureMessages, type ErrorMessage, type FieldMessages } from '@/shared/api';
import { Button, Form, GroupedSection, InputRow, Page } from '@/shared/ui';
import { changePassword } from './membersApi';

/** Path of the password screen, opened from «Ваш профиль». */
export const PASSWORD_PATH = '/settings/password';

type Field = 'currentPassword' | 'newPassword';
const FIELDS: readonly Field[] = ['currentPassword', 'newPassword'];

/** What the screen leaves in the history entry of Settings after a change. */
interface ChangedState {
  passwordChanged: true;
}

function isChangedState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Partial<ChangedState>).passwordChanged === true
  );
}

/**
 * Whether Settings was opened by the password screen after changing the password. The flag is
 * taken once and then cleared from the history entry, so coming back to it later (browser back)
 * doesn't say «Пароль изменён» again.
 */
export function usePasswordJustChanged(): boolean {
  const location = useLocation();
  const navigate = useNavigate();
  const [changed] = useState(() => isChangedState(location.state));
  const flagged = isChangedState(location.state);
  const { pathname, search, hash } = location;
  useEffect(() => {
    if (flagged) void navigate({ pathname, search, hash }, { replace: true, state: null });
  }, [flagged, navigate, pathname, search, hash]);
  return changed;
}

interface PasswordPageProps {
  /** Path of Settings, where the screen goes back to. */
  settingsPath: string;
}

/**
 * «Изменить пароль» (`/settings/password`): the current and a new password, confirmed with
 * «Готово» in the nav bar (or Enter) once both are filled. Esc or the back button leave without
 * saving. On success it goes back to Settings, which says «Пароль изменён»; on failure the message
 * shows under the fields. Online-only (S4 exception); this device stays logged in.
 */
export function PasswordPage({ settingsPath }: PasswordPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  const filled = currentPassword !== '' && newPassword !== '';

  async function save() {
    if (!filled || saving) return;
    setFieldErrors({});
    setFormError(undefined);
    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      const state: ChangedState = { passwordChanged: true };
      await navigate(settingsPath, { state });
    } catch (error: unknown) {
      setSaving(false);
      if (error instanceof ApiError && error.code === 'auth.invalid_credentials') {
        setCurrentPassword('');
        setFieldErrors({ currentPassword: 'members.password.wrongCurrent' });
      } else {
        const { fieldMessages, formMessage } = failureMessages(error, FIELDS);
        setFieldErrors(fieldMessages);
        setFormError(formMessage);
      }
    }
  }

  return (
    <Page
      title={t('members.password.title')}
      back={{ to: settingsPath, title: t('settings.title') }}
      actions={
        <Button disabled={!filled || saving} onClick={() => void save()}>
          {t('members.password.done')}
        </Button>
      }
    >
      <Form onSubmit={() => void save()} onCancel={() => void navigate(settingsPath)}>
        <GroupedSection
          messages={[
            ...FIELDS.map((field) => {
              const key = fieldErrors[field];
              return (
                key !== undefined && {
                  row: field,
                  text: t(key),
                  tone: 'error' as const,
                  announce: true,
                }
              );
            }),
            formError !== undefined && {
              text: t(formError.key, formError.values),
              tone: 'error',
            },
          ]}
        >
          <InputRow
            label={t('members.password.current')}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <InputRow
            label={t('members.password.new')}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
        </GroupedSection>
      </Form>
    </Page>
  );
}
