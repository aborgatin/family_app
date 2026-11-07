import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { ChildForm } from './ChildForm';
import type { Child, ChildDetails } from './childrenApi';
import { ColorSwatch, useChildColorName } from './ColorSwatch';
import { newChildId, useChildren } from './useChildren';

/**
 * The Children section of Settings, «Дети»: the list of Children, adding one, and editing or
 * removing each. All data access goes through `useChildren()`, so M2 can move it onto the local
 * store + Outbox without touching this component.
 */
export function ChildrenSettings() {
  const { t } = useTranslation();
  const { load, retry, save, remove } = useChildren();
  // The id of the Child being added, generated once when the form opens, so a retried save
  // repeats the same idempotent PUT instead of creating a second Child (S3).
  const [addingId, setAddingId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();

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

  async function add(id: string, details: ChildDetails) {
    await save(id, details);
    setAddingId(undefined);
  }

  async function edit(id: string, details: ChildDetails) {
    await save(id, details);
    setEditingId(undefined);
  }

  return (
    <>
      {load.value.length === 0 ? (
        <p>{t('children.empty')}</p>
      ) : (
        <ul aria-label={t('settings.children')}>
          {load.value.map((child) =>
            child.id === editingId ? (
              <li key={child.id}>
                <ChildForm
                  title={t('children.form.editTitle', { name: child.name })}
                  initial={child}
                  onSave={(details) => edit(child.id, details)}
                  onCancel={() => {
                    setEditingId(undefined);
                  }}
                />
              </li>
            ) : (
              <ChildRow
                key={child.id}
                child={child}
                onEdit={() => {
                  setEditingId(child.id);
                }}
                onRemove={() => remove(child.id)}
              />
            ),
          )}
        </ul>
      )}
      {addingId === undefined ? (
        <button
          type="button"
          onClick={() => {
            setAddingId(newChildId());
          }}
        >
          {t('children.add')}
        </button>
      ) : (
        <ChildForm
          title={t('children.form.addTitle')}
          onSave={(details) => add(addingId, details)}
          onCancel={() => {
            setAddingId(undefined);
          }}
        />
      )}
    </>
  );
}

interface ChildRowProps {
  child: Child;
  onEdit: () => void;
  /** Removes the Child; rejects with the API error when that failed. */
  onRemove: () => Promise<void>;
}

/** One Child: color, name, birthday, and «Изменить» / «Удалить» (after a confirmation). */
function ChildRow({ child, onEdit, onRemove }: ChildRowProps) {
  const { t } = useTranslation();
  const colorName = useChildColorName();
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<ErrorMessage>();

  async function confirmRemove() {
    setError(undefined);
    setRemoving(true);
    try {
      await onRemove();
    } catch (failure: unknown) {
      setError(errorMessage(asApiError(failure)));
      setRemoving(false);
    }
  }

  return (
    <li>
      <ColorSwatch code={child.color} /> <span>{child.name}</span>{' '}
      <span>{colorName(child.color)}</span>
      {child.birthday !== null && (
        <>
          {' '}
          <span>{formatBirthday(child.birthday)}</span>
        </>
      )}{' '}
      {confirming ? (
        <>
          <p>{t('children.remove.question', { name: child.name })}</p>
          <button type="button" disabled={removing} onClick={() => void confirmRemove()}>
            {t('children.remove.confirm')}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setError(undefined);
            }}
          >
            {t('children.remove.cancel')}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            aria-label={t('children.editNamed', { name: child.name })}
            onClick={onEdit}
          >
            {t('children.edit')}
          </button>{' '}
          <button
            type="button"
            aria-label={t('children.remove.actionNamed', { name: child.name })}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t('children.remove.action')}
          </button>
        </>
      )}
      {error !== undefined && <p role="alert">{t(error.key, error.values)}</p>}
    </li>
  );
}

const BIRTHDAY_FORMAT = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2019-04-12` → «12 апреля 2019 г.» */
function formatBirthday(birthday: string): string {
  return BIRTHDAY_FORMAT.format(new Date(`${birthday}T00:00:00Z`));
}
