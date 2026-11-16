import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupedSection, ListRow } from '@/shared/ui';
import { DoseSheet } from './DoseSheet';
import type { EventTarget } from './EventSheet';
import { NoteSheet } from './NoteSheet';
import { TemperatureSheet } from './TemperatureSheet';
import type { useMedicalCard } from './useMedicalCard';
import { useMedicines } from './useMedicines';

interface LogSectionProps {
  /** The card's `useMedicalCard`, which saves the events. */
  card: Pick<
    ReturnType<typeof useMedicalCard>,
    'lastAmountOf' | 'logTemperature' | 'logDose' | 'logNote'
  >;
  /**
   * Where the logged event goes: «Добавить к» from the card, or the open Illness; `undefined` while
   * the card loads (the rows show, the sheets wait).
   */
  target: Omit<EventTarget, 'onClose'> | undefined;
  /**
   * The rows' titles: «Добавить приём лекарства» on the card, «Приём лекарства» on an Illness;
   * «Заметка» only on an Illness.
   */
  titles: { dose: string; temperature: string; note?: string };
}

/**
 * «Записать»: a row that opens the dose sheet, one that opens the Temperature sheet and, given its
 * title, one that opens the Note sheet, into `target`. Shared by the card and the Illness screen.
 */
export function LogSection({ card, target, titles }: LogSectionProps) {
  const { t } = useTranslation();
  const { lastAmountOf, logTemperature, logDose, logNote } = card;
  const medicines = useMedicines().load;
  const [logging, setLogging] = useState<'dose' | 'temperature' | 'note'>();
  const close = () => {
    setLogging(undefined);
  };

  return (
    <>
      <GroupedSection label={t('medical.log')}>
        <ListRow
          title={titles.dose}
          accent
          onClick={() => {
            setLogging('dose');
          }}
        />
        <ListRow
          title={titles.temperature}
          accent
          onClick={() => {
            setLogging('temperature');
          }}
        />
        {titles.note !== undefined && (
          <ListRow
            title={titles.note}
            accent
            onClick={() => {
              setLogging('note');
            }}
          />
        )}
      </GroupedSection>
      {logging === 'note' && target !== undefined && (
        <NoteSheet {...target} save={logNote} onClose={close} />
      )}
      {logging === 'temperature' && target !== undefined && (
        <TemperatureSheet {...target} save={logTemperature} onClose={close} />
      )}
      {logging === 'dose' && target !== undefined && medicines.status === 'ready' && (
        <DoseSheet
          {...target}
          medicines={medicines.value}
          lastAmountOf={lastAmountOf}
          save={logDose}
          onClose={close}
        />
      )}
    </>
  );
}
