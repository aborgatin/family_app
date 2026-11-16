import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldMessageKey, type FieldMessages } from '@/shared/api';
import { dayOf, localDay, longDay, timeOf } from '@/shared/dates';
import {
  DateRow,
  GroupedSection,
  SelectRow,
  Sheet,
  TextAreaRow,
  useFooterLines,
} from '@/shared/ui';
import { formatTemperature, illnessToJoin } from './illnessRules';
import type { Illness, IllnessEvent } from './medicalTypes';
import type { IllnessChoice, TemperatureDetails } from './useMedicalCard';

/** The wheel's values: 34,0 to 43,0 °C in steps of 0,1, as `"38.5"`. */
const TEMPERATURES = Array.from({ length: 91 }, (_, step) => ((340 + step) / 10).toFixed(1));
const DEFAULT_TEMPERATURE = '37.0';

/** «Добавить к» choices besides an Illness's id. */
const NEW = 'new';
const OTHER = 'other';

type Field = 'date';
const FIELDS: readonly Field[] = ['date'];

interface TemperatureSheetProps {
  /**
   * From the card: the person's Illnesses, for «Добавить к» (what a new Temperature joins), with
   * their events. Without it (from an Illness screen) the Temperature goes to `illnessId`.
   */
  addTo?: {
    illnesses: readonly Illness[];
    eventsOf: (illnessId: string) => readonly IllnessEvent[];
  };
  /** The Illness the sheet was opened from. */
  illnessId?: string;
  save: (target: IllnessChoice, details: TemperatureDetails) => Promise<unknown>;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Температура»: a Temperature, saved only with «Готово». «Температура» is a wheel (a native
 * select) defaulting to 37,0; «Дата» and «Время» default to now (the time may be cleared);
 * «Описание» is optional. From the card, «Добавить к» preselects the Illness to join
 * (`illnessToJoin`) or «Новая болезнь», named after the event's date; «Другая…» picks another of
 * the person's Illnesses.
 */
export function TemperatureSheet({ addTo, illnessId, save, onClose }: TemperatureSheetProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const [opened] = useState(() => new Date());
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [date, setDate] = useState(() => dayOf(opened));
  const [time, setTime] = useState(() => timeOf(opened));
  const [description, setDescription] = useState('');
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
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [saving, setSaving] = useState(false);

  function illnessChoice(): IllnessChoice {
    if (illnessId !== undefined) return { illnessId };
    if (target === NEW) {
      return {
        newIllnessName: t('medical.newIllnessName', { date: longDay(localDay(date), 'always') }),
      };
    }
    return { illnessId: target === OTHER ? other : target };
  }

  async function done() {
    if (date === '') {
      setFieldErrors({ date: fieldMessageKey('required') });
      return;
    }
    setSaving(true);
    await save(illnessChoice(), {
      temperature: Number(temperature),
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
      title={t('medical.temperature')}
      onDone={() => void done()}
      busy={saving}
    >
      <GroupedSection messages={lines.form({ fields: FIELDS, fieldErrors })}>
        <SelectRow
          label={t('medical.temperature')}
          name="temperature"
          options={TEMPERATURES.map((value) => ({
            value,
            label: formatTemperature(t, Number(value)),
          }))}
          value={temperature}
          onChange={setTemperature}
        />
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
    </Sheet>
  );
}
