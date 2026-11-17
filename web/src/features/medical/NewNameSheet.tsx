import { useState } from 'react';
import {
  asApiError,
  errorMessageKey,
  failureMessages,
  fieldMessageKey,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { GroupedSection, InputRow, Sheet, useFooterLines } from '@/shared/ui';

type Field = 'name';
const FIELDS: readonly Field[] = ['name'];

interface NewNameSheetProps {
  /** The new row's id, made once when the sheet opened, so a retried save repeats it. */
  id: string;
  /** Adds it with the name, trimmed; rejects when the save failed. */
  add: (id: string, name: string) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
  /** The sheet's title, «Название»'s label and placeholder (translated). */
  title: string;
  label: string;
  placeholder: string;
  /** Rejection codes shown under «Название» rather than for the whole form. */
  nameCodes?: readonly string[];
}

/**
 * A sheet that adds something by its name alone (a Condition, a Medicine): «Название» is
 * required, and saved, trimmed, only with «Готово».
 */
export function NewNameSheet({
  id,
  add,
  onClose,
  title,
  label,
  placeholder,
  nameCodes = [],
}: NewNameSheetProps) {
  const lines = useFooterLines();
  const [name, setName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  async function done() {
    setFormError(undefined);
    const trimmed = name.trim();
    if (trimmed === '') {
      setFieldErrors({ name: fieldMessageKey('required') });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      await add(id, trimmed);
      onClose();
    } catch (error: unknown) {
      const { code } = asApiError(error);
      if (nameCodes.includes(code)) {
        setFieldErrors({ name: errorMessageKey(code) });
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
      title={title}
      onDone={() => void done()}
      busy={saving}
    >
      <GroupedSection messages={lines.form({ fields: FIELDS, fieldErrors, formError })}>
        <InputRow
          label={label}
          name="name"
          autoComplete="off"
          placeholder={placeholder}
          value={name}
          onChange={setName}
        />
      </GroupedSection>
    </Sheet>
  );
}
