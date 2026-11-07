import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { ApiError, errorMessage, fieldErrorMessageKey, type ErrorMessage } from '@/shared/api';
import { TextField } from '@/shared/ui';
import type { ChildField, ValueType } from './childFieldsApi';
import { useChildFields, type Direction } from './useChildFields';

const VALUE_TYPE_KEYS = {
  TEXT: 'childFields.valueType.text',
  DATE: 'childFields.valueType.date',
} as const satisfies Record<ValueType, ParseKeys>;

/** A failed save: the message for the name field if the server blamed it, else for the form. */
function failure(error: unknown): { name?: ParseKeys; form?: ErrorMessage } {
  const apiError = error instanceof ApiError ? error : new ApiError(0, 'unknown');
  const nameError = apiError.fieldErrors.find((e) => e.field === 'name');
  return nameError === undefined
    ? { form: errorMessage(apiError) }
    : { name: fieldErrorMessageKey(nameError.code) };
}

/**
 * The Child fields section of Settings («Поля профиля»): the fields in order, adding one with a
 * value type, renaming, reordering and removing (with confirmation). The value type is shown but
 * can't be changed after creation (ADR-0007).
 */
export function ChildFieldsSettings() {
  const { t } = useTranslation();
  const { load, retry, add, rename, move, remove } = useChildFields();
  const [actionError, setActionError] = useState<ErrorMessage>();

  async function run(action: () => Promise<void>): Promise<boolean> {
    setActionError(undefined);
    try {
      await action();
      return true;
    } catch (error: unknown) {
      setActionError(failure(error).form);
      return false;
    }
  }

  if (load.status === 'loading') {
    return <p role="status">{t('common.loading')}</p>;
  }
  if (load.status === 'failed') {
    const message = errorMessage(load.error);
    return (
      <>
        <p role="alert">{t(message.key, message.values)}</p>
        <button type="button" onClick={retry}>
          {t('common.retry')}
        </button>
      </>
    );
  }

  const { fields } = load;
  return (
    <>
      {fields.length === 0 ? (
        <p>{t('childFields.empty')}</p>
      ) : (
        <ol aria-label={t('settings.childFields')}>
          {fields.map((field, index) => (
            <ChildFieldRow
              key={field.id}
              field={field}
              first={index === 0}
              last={index === fields.length - 1}
              onRename={(name) => run(() => rename(field, name))}
              onMove={(direction) => void run(() => move(field, direction))}
              onRemove={() => void run(() => remove(field))}
            />
          ))}
        </ol>
      )}
      {actionError !== undefined && <p role="alert">{t(actionError.key, actionError.values)}</p>}
      <AddChildFieldForm onAdd={add} />
    </>
  );
}

interface ChildFieldRowProps {
  field: ChildField;
  first: boolean;
  last: boolean;
  /** Resolves `true` when saved. */
  onRename: (name: string) => Promise<boolean>;
  onMove: (direction: Direction) => void;
  onRemove: () => void;
}

function ChildFieldRow({ field, first, last, onRename, onMove, onRemove }: ChildFieldRowProps) {
  const { t } = useTranslation();
  const confirmId = useId();
  const [mode, setMode] = useState<'view' | 'rename' | 'confirmRemove'>('view');
  const [name, setName] = useState(field.name);
  const [nameError, setNameError] = useState<ParseKeys>();
  const [saving, setSaving] = useState(false);
  const label = { name: field.name };

  async function saveName() {
    if (name.trim() === '') {
      setNameError(fieldErrorMessageKey('required'));
      return;
    }
    setNameError(undefined);
    setSaving(true);
    const ok = await onRename(name.trim());
    setSaving(false);
    if (ok) setMode('view');
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveName();
  }

  return (
    <li>
      {mode === 'rename' ? (
        <form noValidate onSubmit={onSubmit}>
          <TextField
            label={t('childFields.name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            error={nameError === undefined ? undefined : t(nameError)}
          />
          <span>{t(VALUE_TYPE_KEYS[field.valueType])}</span>{' '}
          <button type="submit" disabled={saving}>
            {t('childFields.save')}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setName(field.name);
              setNameError(undefined);
              setMode('view');
            }}
          >
            {t('childFields.cancel')}
          </button>
        </form>
      ) : (
        <>
          <span>{field.name}</span> <span>{t(VALUE_TYPE_KEYS[field.valueType])}</span>{' '}
          <button
            type="button"
            aria-label={t('childFields.renameField', label)}
            onClick={() => {
              setName(field.name);
              setMode('rename');
            }}
          >
            {t('childFields.rename')}
          </button>{' '}
          <button
            type="button"
            aria-label={t('childFields.moveUpField', label)}
            disabled={first}
            onClick={() => {
              onMove('up');
            }}
          >
            {t('childFields.moveUp')}
          </button>{' '}
          <button
            type="button"
            aria-label={t('childFields.moveDownField', label)}
            disabled={last}
            onClick={() => {
              onMove('down');
            }}
          >
            {t('childFields.moveDown')}
          </button>{' '}
          <button
            type="button"
            aria-label={t('childFields.removeField', label)}
            onClick={() => {
              setMode('confirmRemove');
            }}
          >
            {t('childFields.remove')}
          </button>
        </>
      )}
      {mode === 'confirmRemove' && (
        <div role="alertdialog" aria-labelledby={confirmId}>
          <p id={confirmId}>{t('childFields.confirmRemove', label)}</p>
          <button
            type="button"
            onClick={() => {
              setMode('view');
              onRemove();
            }}
          >
            {t('childFields.remove')}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setMode('view');
            }}
          >
            {t('childFields.cancel')}
          </button>
        </div>
      )}
    </li>
  );
}

interface AddChildFieldFormProps {
  /** Rejects with an `ApiError` when the field wasn't saved. */
  onAdd: (name: string, valueType: ValueType) => Promise<void>;
}

/** «Новое поле»: a name and a value type («Текст» unless the Member picks «Дата»). */
function AddChildFieldForm({ onAdd }: AddChildFieldFormProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const typeName = useId();
  const [name, setName] = useState('');
  const [valueType, setValueType] = useState<ValueType>('TEXT');
  const [nameError, setNameError] = useState<ParseKeys>();
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  async function save() {
    setFormError(undefined);
    if (name.trim() === '') {
      setNameError(fieldErrorMessageKey('required'));
      return;
    }
    setNameError(undefined);
    setSaving(true);
    try {
      await onAdd(name.trim(), valueType);
      setName('');
      setValueType('TEXT');
    } catch (error: unknown) {
      const messages = failure(error);
      setNameError(messages.name);
      setFormError(messages.form);
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit}>
      <h3 id={headingId}>{t('childFields.add.title')}</h3>
      <TextField
        label={t('childFields.name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        error={nameError === undefined ? undefined : t(nameError)}
      />
      <fieldset className="field">
        <legend>{t('childFields.valueType.label')}</legend>
        {(['TEXT', 'DATE'] as const).map((type) => (
          <label key={type}>
            <input
              type="radio"
              name={typeName}
              value={type}
              checked={valueType === type}
              onChange={() => {
                setValueType(type);
              }}
            />
            {t(VALUE_TYPE_KEYS[type])}
          </label>
        ))}
      </fieldset>
      {formError !== undefined && <p role="alert">{t(formError.key, formError.values)}</p>}
      <button type="submit" disabled={saving}>
        {saving ? t('childFields.add.saving') : t('childFields.add.submit')}
      </button>
    </form>
  );
}
