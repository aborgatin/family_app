import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldMessageKey, type FieldMessages } from '@/shared/api';
import { dayOf, localDay, longDay, timeOf } from '@/shared/dates';
import {
  ActionSheet,
  ConfirmRow,
  DateRow,
  GroupedSection,
  ListRow,
  SelectRow,
  Sheet,
  TextAreaRow,
  useFooterLines,
} from '@/shared/ui';
import { illnessToJoin } from './illnessRules';
import type { Illness, IllnessEvent } from './medicalTypes';
import type { EventTiming, IllnessChoice } from './useMedicalCard';

/** «Добавить к» choices besides an Illness's id. */
const NEW = 'new';
const OTHER = 'other';

/** Where a new event goes, as a sheet gets it from the screen that opens it. */
export interface EventTarget {
  /**
   * From the card: the person's Illnesses, for «Добавить к» (what the new event joins), with
   * their events. Without it (from an Illness screen) the event goes to `illnessId`.
   */
  addTo?: {
    illnesses: readonly Illness[];
    eventsOf: (illnessId: string) => readonly IllnessEvent[];
  };
  /** The Illness the sheet was opened from. */
  illnessId?: string;
  /** «Время» starts empty, not at now (a Note's). */
  untimed?: boolean;
  /** The event the sheet edits, rather than adding one. */
  editing?: EventEditing;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/** An event opened from its row: its values fill the sheet; it may be moved or deleted. */
export interface EventEditing {
  event: IllnessEvent;
  /** The person's Illnesses, for «Перенести в…» (those that aren't Ended, but its own). */
  illnesses: readonly Illness[];
  /** Deletes the event (after «Удалить» is confirmed). */
  remove: () => Promise<unknown>;
}

interface EventSheetProps extends EventTarget {
  /** Names the sheet: «Температура», «Приём лекарства». */
  title: string;
  /** The rows of the event's kind, in their own group before «Дата» (their lines under them). */
  children: ReactNode;
  /** Those rows' names, in order, for their footer lines. */
  fields: readonly string[];
  /** Checks those rows on «Готово»: an error key per row that isn't right; empty when all are. */
  check: () => FieldMessages<string>;
  /** Hints under those rows (already translated), shown while they have no error. */
  hints?: Partial<Record<string, string>>;
  /** Saves the event; the sheet closes once it resolves. */
  save: (target: IllnessChoice, timing: EventTiming) => Promise<unknown>;
}

/**
 * What every Illness event sheet has, around the rows of its kind: «Дата» and «Время» default to
 * when the sheet opened (the time may be cleared; `untimed`, it starts empty), «Описание» is optional, and, from the card,
 * «Добавить к» preselects the Illness to join (`illnessToJoin`) or «Новая болезнь», named after
 * the event's date; «Другая…» picks another of the person's Illnesses that isn't Ended. Saved only
 * with «Готово», once the kind's rows pass `check`. `editing` an event, its values fill the sheet,
 * «Готово» saves what changed, «Перенести в…» saves it into another of the person's Illnesses that
 * isn't Ended or a «Новая болезнь» named after its date, and «Удалить» deletes it after asking.
 */
export function EventSheet({
  title,
  children,
  fields,
  check,
  hints,
  save,
  addTo,
  illnessId,
  untimed = false,
  editing,
  onClose,
}: EventSheetProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const [opened] = useState(() => new Date());
  const [date, setDate] = useState(() => editing?.event.date ?? dayOf(opened));
  const [time, setTime] = useState(() => {
    if (editing !== undefined) return editing.event.time ?? '';
    return untimed ? '' : timeOf(opened);
  });
  const [description, setDescription] = useState(() => editing?.event.description ?? '');
  const joined = useMemo(
    () =>
      addTo === undefined ? undefined : illnessToJoin(addTo.illnesses, addTo.eventsOf, opened),
    [addTo, opened],
  );
  const others = (addTo?.illnesses ?? []).filter(
    (illness) => illness.id !== joined?.id && illness.ended !== true,
  );
  const [target, setTarget] = useState(joined?.id ?? NEW);
  const [other, setOther] = useState(others[0]?.id ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<string>>({});
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);

  function newIllness(): IllnessChoice {
    return {
      newIllnessName: t('medical.newIllnessName', { date: longDay(localDay(date), 'always') }),
    };
  }

  function illnessChoice(): IllnessChoice {
    if (editing !== undefined) return { illnessId: editing.event.illnessId };
    if (illnessId !== undefined) return { illnessId };
    if (target === NEW) return newIllness();
    return { illnessId: target === OTHER ? other : target };
  }

  /** Checks the rows, then saves the event into `choice` (moving an edited one there). */
  async function done(choice: () => IllnessChoice = illnessChoice) {
    const errors: FieldMessages<string> = { ...check() };
    if (date === '') errors.date = fieldMessageKey('required');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    await save(choice(), {
      date,
      time: time === '' ? null : time,
      description: description.trim() === '' ? null : description.trim(),
    });
    onClose();
  }

  const targets = [
    ...(joined === undefined ? [] : [{ value: joined.id, label: joined.name }]),
    { value: NEW, label: t('medical.newIllness') },
    ...(others.length === 0 ? [] : [{ value: OTHER, label: t('medical.otherIllness') }]),
  ];

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
      <GroupedSection
        messages={lines.form({ fields, fieldErrors, ...(hints !== undefined && { hints }) })}
      >
        {children}
      </GroupedSection>
      <GroupedSection messages={lines.form({ fields: ['date'], fieldErrors })}>
        <DateRow label={t('medical.date')} name="date" value={date} onChange={setDate} />
        <DateRow
          label={t('medical.time')}
          name="time"
          type="time"
          value={time}
          onChange={setTime}
        />
        <TextAreaRow
          label={t('medical.description')}
          name="description"
          value={description}
          onChange={setDescription}
        />
      </GroupedSection>
      {addTo !== undefined && (
        <GroupedSection>
          <SelectRow
            label={t('medical.addTo')}
            name="addTo"
            options={targets}
            value={target}
            onChange={setTarget}
          />
          {target === OTHER && (
            <SelectRow
              label={t('medical.illness')}
              name="other"
              options={others.map((illness) => ({ value: illness.id, label: illness.name }))}
              value={other}
              onChange={setOther}
            />
          )}
        </GroupedSection>
      )}
      {editing !== undefined && (
        <GroupedSection>
          <ListRow
            title={t('medical.moveTo')}
            accent
            onClick={() => {
              setMoving(true);
            }}
          />
          <ActionSheet
            open={moving}
            onOpenChange={setMoving}
            title={t('medical.moveTo')}
            actions={[
              ...editing.illnesses
                .filter(({ id, ended }) => id !== editing.event.illnessId && ended !== true)
                .map((illness) => ({
                  label: illness.name,
                  onSelect: () => void done(() => ({ illnessId: illness.id })),
                })),
              { label: t('medical.newIllness'), onSelect: () => void done(newIllness) },
            ]}
          />
          <ConfirmRow
            title={t('ui.delete')}
            confirm={{ title: t('medical.confirmDeleteEvent'), action: t('ui.delete') }}
            onConfirm={() => {
              void editing.remove();
              onClose();
            }}
          />
        </GroupedSection>
      )}
    </Sheet>
  );
}
