import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member } from '@/features/auth';
import type { ErrorMessage } from '@/shared/api';
import { GrammaticalGenderChoice, TextField, type GrammaticalGender } from '@/shared/ui';
import { failureMessages, fieldMessageKey, type FieldMessages } from './fieldMessages';
import { updateProfile, type ProfileChange } from './membersApi';

type Field = 'displayName' | 'grammaticalGender';
const FIELDS: readonly Field[] = ['displayName', 'grammaticalGender'];

interface ProfileFormProps {
  member: Member;
  onSaved: (member: Member) => void;
}

/** The logged-in Member's own display name and «Добавил» / «Добавила» choice. Online-only. */
export function ProfileForm({ member, onSaved }: ProfileFormProps) {
  const { t } = useTranslation();
  const headingId = useId();

  const [displayName, setDisplayName] = useState(member.displayName);
  const [grammaticalGender, setGrammaticalGender] = useState<GrammaticalGender>(
    member.grammaticalGender,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaved(false);
    setFormError(undefined);
    if (displayName.trim() === '') {
      setFieldErrors({ displayName: fieldMessageKey('required') });
      return;
    }
    setFieldErrors({});

    // Only the fields that changed are sent, so nothing else is overwritten.
    const change: ProfileChange = {};
    if (displayName !== member.displayName) change.displayName = displayName;
    if (grammaticalGender !== member.grammaticalGender) {
      change.grammaticalGender = grammaticalGender;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(change);
      setDisplayName(updated.displayName);
      setGrammaticalGender(updated.grammaticalGender);
      setSaved(true);
      onSaved(updated);
    } catch (error: unknown) {
      const { fieldMessages, formMessage } = failureMessages(error, FIELDS, ['grammaticalGender']);
      setFieldErrors(fieldMessages);
      setFormError(formMessage);
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
      <h3 id={headingId}>{t('members.profile.title')}</h3>
      <TextField
        label={t('members.profile.displayName')}
        autoComplete="name"
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
          setSaved(false);
        }}
        error={message('displayName')}
      />
      <GrammaticalGenderChoice
        value={grammaticalGender}
        onChange={(value) => {
          setGrammaticalGender(value);
          setSaved(false);
        }}
        error={message('grammaticalGender')}
      />
      {formError !== undefined && <p role="alert">{t(formError.key, formError.values)}</p>}
      {saved && <p role="status">{t('members.profile.saved')}</p>}
      <button type="submit" disabled={saving}>
        {saving ? t('members.profile.saving') : t('members.profile.save')}
      </button>
    </form>
  );
}
