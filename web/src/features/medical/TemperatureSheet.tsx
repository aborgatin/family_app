import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EventSheet, type EventTarget } from './EventSheet';
import { DEFAULT_TEMPERATURE, TemperatureRow, wheelValue } from './TemperatureRow';
import type { EventPlace, TemperatureDetails } from './useMedicalCard';

interface TemperatureSheetProps extends EventTarget {
  save: (place: EventPlace, details: TemperatureDetails) => Promise<unknown>;
}

const NO_FIELDS: readonly never[] = [];

/**
 * «Температура»: a Temperature, saved only with «Готово». «Температура» is a wheel defaulting to
 * 37,0; the rest is every event sheet's (`EventSheet`): «Дата», «Время», «Описание» and, from the
 * card, «Добавить к». Editing a Temperature, the wheel shows its value.
 */
export function TemperatureSheet({ save, ...target }: TemperatureSheetProps) {
  const { t } = useTranslation();
  const [temperature, setTemperature] = useState(() =>
    wheelValue(target.editing?.event.temperature, DEFAULT_TEMPERATURE),
  );
  return (
    <EventSheet
      {...target}
      title={t('medical.temperature')}
      fields={NO_FIELDS}
      check={() => ({})}
      save={(place, timing) => save(place, { temperature: Number(temperature), ...timing })}
    >
      <TemperatureRow value={temperature} onChange={setTemperature} />
    </EventSheet>
  );
}
