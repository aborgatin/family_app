import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldMessageKey, type FieldMessages } from '@/shared/api';
import { GroupedSection, InputRow, SegmentedControl, Sheet, useFooterLines } from '@/shared/ui';
import {
  CHILD_LIST_KINDS,
  hasVisibility,
  KIND_TEXTS,
  LIST_KINDS,
  type ListDetails,
  type ListKind,
  type Visibility,
  VISIBILITY_CHOICES,
} from './listTypes';

type Field = 'name' | 'kind';
const FIELDS: readonly Field[] = ['name', 'kind'];

interface NewListSheetProps {
  /** The new List's id, made once when the sheet opened (S3). */
  id: string;
  /** Saves the List in the local store and the Outbox; resolves at once, offline too. */
  save: (id: string, details: ListDetails) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
  /** Opened on a Child page: the Child the new List is about (a Child list). */
  childId?: string;
}

/**
 * «Новый список»: Название, Вид (Покупки / TODO / Желания) and Visibility (Личный / Общий,
 * «Общий» unless changed), saved only with «Готово». Visibility is hidden while «Желания» is
 * chosen: a Wish list is always Shared. With `childId` it creates a Child list: Вид is TODO /
 * Желания only and there is no Visibility, since a Child list is always Shared.
 */
export function NewListSheet({ id, save, onClose, childId }: NewListSheetProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>();
  const [visibility, setVisibility] = useState<Visibility>('SHARED');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});

  async function done() {
    const missing: FieldMessages<Field> = {};
    if (name.trim() === '') missing.name = fieldMessageKey('required');
    if (kind === undefined) missing.kind = fieldMessageKey('required', true);
    setFieldErrors(missing);
    if (kind === undefined || Object.keys(missing).length > 0) return;

    await save(id, {
      name: name.trim(),
      kind,
      visibility: choosesVisibility(kind) ? visibility : 'SHARED',
      ...(childId !== undefined && { childId }),
    });
    onClose();
  }

  /** Whether Visibility is a choice: never for a Child list or a Wish list. */
  function choosesVisibility(chosen: ListKind | undefined) {
    return childId === undefined && (chosen === undefined || hasVisibility(chosen));
  }

  const kinds = (childId === undefined ? LIST_KINDS : CHILD_LIST_KINDS).map((value) => ({
    value,
    label: t(KIND_TEXTS[value].choice),
  }));
  const visibilities = VISIBILITY_CHOICES.map(({ value, label }) => ({ value, label: t(label) }));

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('lists.newTitle')}
      onDone={() => void done()}
    >
      <GroupedSection messages={lines.form({ fields: FIELDS, fieldErrors })}>
        <InputRow
          label={t('lists.name')}
          name="name"
          autoComplete="off"
          value={name}
          onChange={setName}
        />
        <SegmentedControl
          label={t('lists.kind.label')}
          name="kind"
          options={kinds}
          value={kind}
          onChange={setKind}
        />
        {choosesVisibility(kind) && (
          <SegmentedControl
            label={t('lists.visibility.label')}
            labelHidden
            name="visibility"
            options={visibilities}
            value={visibility}
            onChange={setVisibility}
          />
        )}
      </GroupedSection>
    </Sheet>
  );
}
