import { useTranslation } from 'react-i18next';
import { NewNameSheet } from './NewNameSheet';

interface NewIllnessSheetProps {
  /** The new Illness's id, made once when the sheet opened, so a retried save repeats it. */
  id: string;
  /** Adds the Illness, empty; rejects when the save failed. */
  add: (id: string, name: string) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Новая болезнь»: an Illness added by hand, before it has any events. «Название» is required
 * («Например: ОРВИ, Отит»); saved only with «Готово».
 */
export function NewIllnessSheet({ id, add, onClose }: NewIllnessSheetProps) {
  const { t } = useTranslation();
  return (
    <NewNameSheet
      id={id}
      add={add}
      onClose={onClose}
      title={t('medical.newIllness')}
      label={t('medical.name')}
      placeholder={t('medical.illnessPlaceholder')}
    />
  );
}
