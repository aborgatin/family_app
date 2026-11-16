import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EventSheet, type EventTarget } from './EventSheet';
import { DEFAULT_TEMPERATURE, TemperatureRow } from './TemperatureRow';
import type { IllnessChoice, TemperatureDetails } from './useMedicalCard';

interface TemperatureSheetProps extends EventTarget {
  save: (target: IllnessChoice, details: TemperatureDetails, eventId?: string) => Promise<unknown>;
}

const NO_FIELDS: readonly never[] = [];

/**
 * «Температура»: a Temperature, saved only with «Готово». «Температура» is a wheel defaulting to
 * 37,0; the rest is every event sheet's (`EventSheet`): «Дата», «Время», «Описание» and, from the
 * card, «Добавить к». Editing a Temperature, the wheel shows its value.
 */
export function TemperatureSheet({ save, ...target }: TemperatureSheetProps) {
  const { t } = useTranslation();
  const [temperature, setTemperature] = useState(
    () => target.editing?.event.temperature?.toFixed(1) ?? DEFAULT_TEMPERATURE,
  );
  return (
    <EventSheet
      {...target}
      title={t('medical.temperature')}
      fields={NO_FIELDS}
      check={() => ({})}
      save={(choice, timing) =>
        save(choice, { temperature: Number(temperature), ...timing }, target.editing?.event.id)
      }
    >
      <TemperatureRow value={temperature} onChange={setTemperature} />
    </EventSheet>
  );
}
