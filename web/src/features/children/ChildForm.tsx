import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { TextField } from '@/shared/ui';
import type { ChildDetails } from './childrenApi';
import { ColorChoice } from './ColorChoice';

type Field = 'name' | 'color' | 'birthday';
const FIELDS: readonly Field[] = ['name', 'color', 'birthday'];

interface ChildFormProps {
  /** Already translated heading; also names the form. */
  title: string;
  /** The Child being edited; absent when adding one. */
  initial?: ChildDetails;
  /** Saves the details; rejects with the API error when the save failed. */
  onSave: (details: ChildDetails) => Promise<unknown>;
  onCancel: () => void;
}

/** Name, color and optional birthday of a Child, for adding and editing. */
export function ChildForm({ title, initial, onSave, onCancel }: ChildFormProps) {
  const { t } = useTranslation();
  const headingId = useId();

  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<string | undefined>(initial?.color);
  const [birthday, setBirthday] = useState(initial?.birthday ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  async function save() {
    setFormError(undefined);
    const missing: FieldMessages<Field> = {};
    if (name.trim() === '') missing.name = fieldMessageKey('required');
    if (color === undefined) missing.color = fieldMessageKey('required', true);
    setFieldErrors(missing);
    if (color === undefined || Object.keys(missing).length > 0) return;

    setSaving(true);
    try {
      await onSave({ name, color, birthday: birthday === '' ? null : birthday });
    } catch (error: unknown) {
      const { fieldMessages, formMessage } = failureMessages(error, FIELDS, ['color']);
      setFieldErrors(fieldMessages);
      setFormError(formMessage);
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
      <h3 id={headingId}>{title}</h3>
      <TextField
        label={t('children.form.name')}
        autoComplete="off"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        error={message('name')}
      />
      <ColorChoice value={color} onChange={setColor} error={message('color')} />
      <TextField
        label={t('children.form.birthday')}
        type="date"
        value={birthday}
        onChange={(event) => {
          setBirthday(event.target.value);
        }}
        error={message('birthday')}
      />
      {formError !== undefined && <p role="alert">{t(formError.key, formError.values)}</p>}
      <button type="submit" disabled={saving}>
        {saving ? t('children.form.saving') : t('children.form.save')}
      </button>{' '}
      <button type="button" onClick={onCancel}>
        {t('children.form.cancel')}
      </button>
    </form>
  );
}
