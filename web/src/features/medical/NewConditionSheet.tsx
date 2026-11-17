import { useTranslation } from 'react-i18next';
import { NewNameSheet } from './NewNameSheet';

interface NewConditionSheetProps {
  /** The new Condition's id, made once when the sheet opened, so a retried save repeats it. */
  id: string;
  /** Adds the Condition last; rejects when the save failed. */
  add: (id: string, name: string) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Диагноз/наблюдение»: a Condition added by hand, before it has any events. «Название» is
 * required («Например: Зрение, Зубы»); saved only with «Готово».
 */
export function NewConditionSheet({ id, add, onClose }: NewConditionSheetProps) {
  const { t } = useTranslation();
  return (
    <NewNameSheet
      id={id}
      add={add}
      onClose={onClose}
      title={t('medical.condition')}
      label={t('medical.name')}
      placeholder={t('medical.conditionPlaceholder')}
    />
  );
}
