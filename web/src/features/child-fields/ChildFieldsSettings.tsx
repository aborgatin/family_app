import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import {
  autoSaveMessages,
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  SortableList,
  useAutoSaveText,
  type SaveFailure,
  type SectionMessage,
  type SortableRow,
} from '@/shared/ui';
import type { ChildField } from './childFieldsApi';
import { NewChildFieldSheet } from './NewChildFieldSheet';
import { newChildFieldId, useChildFields } from './useChildFields';
import { VALUE_TYPE_KEYS } from './valueTypes';

/**
 * «Поля профиля» in Settings: a row per Child field with its name (renamed in place, auto-saved)
 * and its value type on the right, which can't change after creation (ADR-0007). Edit mode
 * deletes (⊖) and reorders (drag handle); a swipe or right-click deletes too, always after the
 * action sheet. «Добавить поле» opens the «Новое поле» sheet. All data access goes through
 * `useChildFields()`, so M2 can move it onto the local store + Outbox without touching this
 * component.
 */
export function ChildFieldsSettings() {
  const { t } = useTranslation();
  const { load, retry, add, rename, move, remove } = useChildFields();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [error, setError] = useState<ErrorMessage>();
  const [failures, setFailures] = useState<Record<string, SaveFailure | undefined>>({});
  // The id of the field being added, made once when the sheet opens, so a retried save repeats
  // the same idempotent PUT instead of creating a second field (S3).
  const [addingId, setAddingId] = useState<string>();

  const reportFailure = useCallback((id: string, failure: SaveFailure | undefined) => {
    setFailures((previous) =>
      previous[id] === failure ? previous : { ...previous, [id]: failure },
    );
  }, []);

  async function moveField(field: ChildField, to: number) {
    setError(undefined);
    try {
      await move(field, to);
    } catch (failure: unknown) {
      setError(errorMessage(asApiError(failure)));
    }
  }

  async function deleteField(field: ChildField, last: boolean) {
    setDeleting(field.id);
    setError(undefined);
    try {
      await remove(field);
      if (last) setEditing(false);
    } catch (failure: unknown) {
      setError(errorMessage(asApiError(failure)));
    } finally {
      setDeleting(undefined);
    }
  }

  const fields = load.status === 'ready' ? load.value : [];
  const messages: SectionMessage[] = [];
  if (load.status === 'failed') {
    const message = errorMessage(load.error);
    messages.push({
      text: t(message.key, message.values),
      tone: 'error',
      action: { label: t('common.retry'), onClick: retry },
    });
  }
  messages.push(...autoSaveMessages(fields.map((field) => failures[field.id])));
  if (error !== undefined) messages.push({ text: t(error.key, error.values), tone: 'error' });
  if (load.status === 'ready' && fields.length === 0)
    messages.push({ text: t('childFields.empty') });

  return (
    <>
      {addingId !== undefined && (
        <NewChildFieldSheet
          key={addingId}
          id={addingId}
          add={add}
          onClose={() => {
            setAddingId(undefined);
          }}
        />
      )}
      <GroupedSection
        header={t('settings.childFields')}
        {...(fields.length > 0 && { edit: { editing, onEditingChange: setEditing } })}
        messages={messages}
        after={
          load.status === 'loading' ? (
            <LoadingRow />
          ) : (
            load.status === 'ready' && (
              <ListRow
                accent
                title={t('childFields.add')}
                onClick={() => {
                  setAddingId(newChildFieldId());
                }}
              />
            )
          )
        }
      >
        {fields.length > 0 && (
          <SortableList
            items={fields}
            itemId={(field) => field.id}
            itemTitle={(field) => field.name}
            onMove={moveField}
          >
            {(field, sortable) => (
              <ChildFieldRow
                field={field}
                sortable={sortable}
                rename={rename}
                onFailure={reportFailure}
                busy={deleting === field.id}
                onDelete={() => {
                  void deleteField(field, fields.length === 1);
                }}
              />
            )}
          </SortableList>
        )}
      </GroupedSection>
    </>
  );
}

interface ChildFieldRowProps {
  field: ChildField;
  sortable: SortableRow;
  rename: (field: ChildField, name: string) => Promise<ChildField>;
  /** Tells the section about this row's failed save (or that it cleared), for its footer. */
  onFailure: (id: string, failure: SaveFailure | undefined) => void;
  busy: boolean;
  onDelete: () => void;
}

function ChildFieldRow({ field, sortable, rename, onFailure, busy, onDelete }: ChildFieldRowProps) {
  const { t } = useTranslation();
  const save = useCallback(
    async (name: string) => (await rename(field, name.trim())).name,
    [field, rename],
  );
  const validate = useCallback(
    (name: string) => (name.trim() === '' ? t('errors.field.required') : undefined),
    [t],
  );
  const name = useAutoSaveText({ name: field.id, saved: field.name, save, validate });

  const { id } = field;
  useEffect(() => {
    onFailure(id, name.failure);
  }, [id, name.failure, onFailure]);
  useEffect(
    () => () => {
      onFailure(id, undefined);
    },
    [id, onFailure],
  );

  return (
    <EditableRow
      title={field.name}
      value={t(VALUE_TYPE_KEYS[field.valueType])}
      busy={busy}
      sortable={sortable}
      input={{ ...name.input, label: t('childFields.nameOf', { name: field.name }) }}
      confirm={{ title: t('childFields.confirmDelete', { name: field.name }) }}
      onDelete={onDelete}
    />
  );
}
