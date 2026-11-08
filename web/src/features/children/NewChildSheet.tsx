import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { GroupedSection, Sheet } from '@/shared/ui';
import { ChildRows } from './ChildRows';
import type { ChildDetails } from './childrenApi';

type Field = 'name' | 'color' | 'birthday';
const FIELDS: readonly Field[] = ['name', 'color', 'birthday'];

interface NewChildSheetProps {
  /** The new Child's id, made once when the sheet opened, so a retried save repeats the same PUT. */
  id: string;
  /** Saves the Child; rejects with the API error when the save failed. */
  save: (id: string, details: ChildDetails) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Новый ребёнок»: the Child's rows, as on the Child screen, saved only with «Готово». Name and
 * colour are required; the birthday is optional.
 */
export function NewChildSheet({ id, save, onClose }: NewChildSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>();
  const [birthday, setBirthday] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  async function done() {
    setFormError(undefined);
    const missing: FieldMessages<Field> = {};
    if (name.trim() === '') missing.name = fieldMessageKey('required');
    if (color === undefined) missing.color = fieldMessageKey('required', true);
    setFieldErrors(missing);
    if (color === undefined || Object.keys(missing).length > 0) return;

    setSaving(true);
    try {
      await save(id, { name: name.trim(), color, birthday: birthday === '' ? null : birthday });
      onClose();
    } catch (error: unknown) {
      const { fieldMessages, formMessage } = failureMessages(error, FIELDS, ['color']);
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
      title={t('children.newTitle')}
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
        <ChildRows
          name={{ name: 'name', value: name, onChange: setName }}
          color={{ name: 'color', value: color, onChange: setColor }}
          birthday={{ name: 'birthday', value: birthday, onChange: setBirthday }}
        />
      </GroupedSection>
    </Sheet>
  );
}
