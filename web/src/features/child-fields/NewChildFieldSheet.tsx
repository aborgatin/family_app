import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { GroupedSection, InputRow, SegmentedControl, Sheet } from '@/shared/ui';
import type { ValueType } from './childFieldsApi';
import { VALUE_TYPE_KEYS } from './valueTypes';

type Field = 'name' | 'valueType';
const FIELDS: readonly Field[] = ['name', 'valueType'];

interface NewChildFieldSheetProps {
  /** The new field's id, made once when the sheet opened, so a retried save repeats the same PUT. */
  id: string;
  /** Adds the field at the end; rejects with the API error when the save failed. */
  add: (id: string, name: string, valueType: ValueType) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Новое поле»: the name and the value type («Текст» unless the Member picks «Дата»), saved only
 * with «Готово». The value type can't be changed afterwards (ADR-0007).
 */
export function NewChildFieldSheet({ id, add, onClose }: NewChildFieldSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [valueType, setValueType] = useState<ValueType>('TEXT');
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
      await add(id, name.trim(), valueType);
      onClose();
    } catch (error: unknown) {
      const { fieldMessages, formMessage } = failureMessages(error, FIELDS);
      setFieldErrors(fieldMessages);
      setFormError(formMessage);
      setSaving(false);
    }
  }

  const types = (['TEXT', 'DATE'] as const).map((type) => ({
    value: type,
    label: t(VALUE_TYPE_KEYS[type]),
  }));

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('childFields.newTitle')}
      onDone={() => void done()}
      busy={saving}
    >
      <GroupedSection
        messages={[
          ...FIELDS.map((field) => {
            const key = fieldErrors[field];
            return key !== undefined && { row: field, text: t(key), tone: 'error' as const };
          }),
          formError !== undefined && { text: t(formError.key, formError.values), tone: 'error' },
        ]}
      >
        <InputRow label={t('childFields.name')} name="name" value={name} onChange={setName} />
        <SegmentedControl
          label={t('childFields.valueType.label')}
          name="valueType"
          options={types}
          value={valueType}
          onChange={setValueType}
        />
      </GroupedSection>
    </Sheet>
  );
}
