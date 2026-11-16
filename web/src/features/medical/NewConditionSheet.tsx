import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { GroupedSection, InputRow, Sheet, useFooterLines } from '@/shared/ui';

type Field = 'name';
const FIELDS: readonly Field[] = ['name'];

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
      await add(id, name);
      onClose();
    } catch (error: unknown) {
      const { fieldMessages, formMessage } = failureMessages(error, FIELDS);
      setFieldErrors(fieldMessages);
      setFormError(formMessage);
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('medical.condition')}
      onDone={() => void done()}
      busy={saving}
    >
      <GroupedSection messages={lines.form({ fields: FIELDS, fieldErrors, formError })}>
        <InputRow
          label={t('medical.name')}
          name="name"
          autoComplete="off"
          placeholder={t('medical.conditionPlaceholder')}
          value={name}
          onChange={setName}
        />
      </GroupedSection>
    </Sheet>
  );
}
