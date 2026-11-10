import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  SortableList,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  useReportFailure,
  useRowFailures,
  type ReportFailure,
  type SortableRow,
} from '@/shared/ui';
import type { ChildField } from './childFieldTypes';
import { NewChildFieldSheet } from './NewChildFieldSheet';
import { newChildFieldId, useChildFields } from './useChildFields';
import { VALUE_TYPE_KEYS } from './valueTypes';

/**
 * «Поля профиля» in Settings: a row per Child field with its name (renamed in place, auto-saved)
 * and its value type on the right, which can't change after creation (ADR-0007). Edit mode
 * deletes (⊖) and reorders (drag handle); a swipe or right-click deletes too, always after the
 * action sheet. «Добавить поле» opens the «Новое поле» sheet. All data access goes through
 * `useChildFields()` (the local store + Outbox).
 */
export function ChildFieldsSettings() {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { load, add, rename, move, remove } = useChildFields();
  const list = useEditableList();
  const failures = useRowFailures();
  // The id of the field being added, made once when the sheet opens, so a retried save repeats
  // the same idempotent upsert instead of creating a second field (S3).
  const [addingId, setAddingId] = useState<string>();

  const fields = load.status === 'ready' ? load.value : [];

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
        {...(fields.length > 0 && { edit: list.edit })}
        messages={[
          ...failures.messages,
          lines.failure(list.error),
          load.status === 'ready' && fields.length === 0 && { text: t('childFields.empty') },
        ]}
        after={
          load.status === 'loading' ? (
            <LoadingRow />
          ) : (
            <ListRow
              accent
              title={t('childFields.add')}
              onClick={() => {
                setAddingId(newChildFieldId());
              }}
            />
          )
        }
      >
        {fields.length > 0 && (
          <SortableList
            items={fields}
            itemId={(field) => field.id}
            itemTitle={(field) => field.name}
            onMove={(field, to) => list.attempt(() => move(field, to))}
          >
            {(field, sortable) => (
              <ChildFieldRow
                field={field}
                sortable={sortable}
                rename={rename}
                onFailure={failures.report}
                busy={list.deleting === field.id}
                onDelete={() => {
                  void list.remove(field.id, fields.length === 1, () => remove(field));
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
  onFailure: ReportFailure;
  busy: boolean;
  onDelete: () => void;
}

function ChildFieldRow({ field, sortable, rename, onFailure, busy, onDelete }: ChildFieldRowProps) {
  const { t } = useTranslation();
  const save = useCallback(
    async (name: string) => (await rename(field, name.trim())).name,
    [field, rename],
  );
  const name = useAutoSaveText({ name: field.id, saved: field.name, save, required: true });

  useReportFailure(onFailure, field.id, name.failure);

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
