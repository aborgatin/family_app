import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldMessageKey } from '@/shared/api';
import { InputRow } from '@/shared/ui';
import { EventSheet, type EventTarget } from './EventSheet';
import type { EventPlace, NoteEventDetails } from './useMedicalCard';

interface NoteEventSheetProps extends EventTarget {
  save: (place: EventPlace, details: NoteEventDetails) => Promise<unknown>;
}

const FIELDS = ['title'] as const;

/**
 * «Заметка»: a Note («Сходили к доктору»), saved only with «Готово». «Название» is required;
 * «Время» starts empty. The rest is every event sheet's (`EventSheet`).
 */
export function NoteEventSheet({ save, ...target }: NoteEventSheetProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(() => target.editing?.event.title ?? '');
  return (
    <EventSheet
      untimed
      {...target}
      title={t('medical.noteEvent')}
      fields={FIELDS}
      check={() => (title.trim() === '' ? { title: fieldMessageKey('required') } : {})}
      save={(place, timing) => save(place, { title: title.trim(), ...timing })}
    >
      <InputRow
        label={t('medical.name')}
        name="title"
        autoComplete="off"
        value={title}
        onChange={setTitle}
      />
    </EventSheet>
  );
}
