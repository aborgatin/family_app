import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  asApiError,
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { GroupedSection, InputRow, Sheet, useFooterLines } from '@/shared/ui';
import { MEDICINE_DUPLICATE } from './useMedicines';

type Field = 'name';
const FIELDS: readonly Field[] = ['name'];

interface NewMedicineSheetProps {
  /** The new Medicine's id, made once when the sheet opened, so a retried save repeats it. */
  id: string;
  /** Adds the Medicine; rejects with `medicine.duplicate` for a name the list already has. */
  add: (id: string, name: string) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/** «Новое лекарство»: its name with its strength («Ибупрофен 20 мг/мл»), saved with «Готово». */
export function NewMedicineSheet({ id, add, onClose }: NewMedicineSheetProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  async function done() {
    setFormError(undefined);
    if (name.trim() === '') {
      setFieldErrors({ name: fieldMessageKey('required') });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      await add(id, name.trim());
      onClose();
    } catch (error: unknown) {
      if (asApiError(error).code === MEDICINE_DUPLICATE) {
        setFieldErrors({ name: 'errors.medicineDuplicate' });
      } else {
        const { fieldMessages, formMessage } = failureMessages(error, FIELDS);
        setFieldErrors(fieldMessages);
        setFormError(formMessage);
      }
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('medicines.newTitle')}
      onDone={() => void done()}
      busy={saving}
    >
      <GroupedSection messages={lines.form({ fields: FIELDS, fieldErrors, formError })}>
        <InputRow
          label={t('medicines.name')}
          name="name"
          placeholder={t('medicines.namePlaceholder')}
          value={name}
          onChange={setName}
        />
      </GroupedSection>
    </Sheet>
  );
}
