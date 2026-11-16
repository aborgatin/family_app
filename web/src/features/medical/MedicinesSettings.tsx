import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  useAutoSaveText,
  useEditableList,
  useFooterLines,
  useReportFailure,
  useRowFailures,
  type ReportFailure,
} from '@/shared/ui';
import type { Medicine } from './medicalTypes';
import { NewMedicineSheet } from './NewMedicineSheet';
import { newMedicineId, useMedicines } from './useMedicines';

/**
 * «Лекарства» in Settings, built like «Поля профиля»: a row per Medicine, by name, renamed in place
 * (auto-saved; a name the list already has is refused); edit mode, a swipe or right-click deletes,
 * always after the action sheet. «Добавить лекарство» opens the «Новое лекарство» sheet. All data
 * access goes through `useMedicines()`.
 */
export function MedicinesSettings() {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const { load, add, rename, remove } = useMedicines();
  const list = useEditableList();
  const failures = useRowFailures();
  // Made once when the sheet opens, so a retried save repeats the same idempotent upsert (S3).
  const [addingId, setAddingId] = useState<string>();

  const medicines = load.status === 'ready' ? load.value : [];

  return (
    <>
      {addingId !== undefined && (
        <NewMedicineSheet
          key={addingId}
          id={addingId}
          add={add}
          onClose={() => {
            setAddingId(undefined);
          }}
        />
      )}
      <GroupedSection
        header={t('medicines.title')}
        {...(medicines.length > 0 && { edit: list.edit })}
        messages={[
          ...failures.messages,
          lines.failure(list.error),
          load.status === 'ready' && medicines.length === 0 && { text: t('medicines.empty') },
        ]}
        after={
          load.status === 'loading' ? (
            <LoadingRow />
          ) : (
            <ListRow
              accent
              title={t('medicines.add')}
              onClick={() => {
                setAddingId(newMedicineId());
              }}
            />
          )
        }
      >
        {medicines.map((medicine) => (
          <MedicineRow
            key={medicine.id}
            medicine={medicine}
            rename={rename}
            onFailure={failures.report}
            busy={list.deleting === medicine.id}
            onDelete={() => {
              void list.remove(medicine.id, medicines.length === 1, () => remove(medicine));
            }}
          />
        ))}
      </GroupedSection>
    </>
  );
}

interface MedicineRowProps {
  medicine: Medicine;
  rename: (medicine: Medicine, name: string) => Promise<Medicine>;
  /** Tells the section about this row's failed save (or that it cleared), for its footer. */
  onFailure: ReportFailure;
  busy: boolean;
  onDelete: () => void;
}

function MedicineRow({ medicine, rename, onFailure, busy, onDelete }: MedicineRowProps) {
  const { t } = useTranslation();
  const save = useCallback(
    async (name: string) => (await rename(medicine, name.trim())).name,
    [medicine, rename],
  );
  const name = useAutoSaveText({ name: medicine.id, saved: medicine.name, save, required: true });

  useReportFailure(onFailure, medicine.id, name.failure);

  return (
    <EditableRow
      title={medicine.name}
      busy={busy}
      input={{ ...name.input, label: t('medicines.nameOf', { name: medicine.name }) }}
      confirm={{ title: t('medicines.confirmDelete', { name: medicine.name }) }}
      onDelete={onDelete}
    />
  );
}
