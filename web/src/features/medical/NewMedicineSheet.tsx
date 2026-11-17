import { useTranslation } from 'react-i18next';
import { NewNameSheet } from './NewNameSheet';
import { MEDICINE_DUPLICATE } from './useMedicines';

interface NewMedicineSheetProps {
  /** The new Medicine's id, made once when the sheet opened, so a retried save repeats it. */
  id: string;
  /** Adds the Medicine; rejects with `medicine.duplicate` for a name the list already has. */
  add: (id: string, name: string) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Новое лекарство»: its name with its strength («Ибупрофен 20 мг/мл»), saved with «Готово»; a
 * name the list already has is said under «Название».
 */
export function NewMedicineSheet({ id, add, onClose }: NewMedicineSheetProps) {
  const { t } = useTranslation();
  return (
    <NewNameSheet
      id={id}
      add={add}
      onClose={onClose}
      title={t('medicines.newTitle')}
      label={t('medicines.name')}
      placeholder={t('medicines.namePlaceholder')}
      nameCodes={[MEDICINE_DUPLICATE]}
    />
  );
}
