import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupedSection, ListRow } from '@/shared/ui';
import { DoseSheet } from './DoseSheet';
import type { EventTarget } from './EventSheet';
import { NoteEventSheet } from './NoteEventSheet';
import { TemperatureSheet } from './TemperatureSheet';
import type { useMedicalCard } from './useMedicalCard';
import { useMedicines } from './useMedicines';

interface LogSectionProps {
  /** The card's `useMedicalCard`, which saves the events. */
  card: Pick<
    ReturnType<typeof useMedicalCard>,
    'lastAmountOf' | 'saveTemperature' | 'saveDose' | 'saveNoteEvent'
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
  titles: { dose: string; temperature: string; noteEvent?: string };
}

/**
 * «Записать»: a row that opens the dose sheet, one that opens the Temperature sheet and, given its
 * title, one that opens the Note sheet, into `target`. Shared by the card and the Illness screen.
 */
export function LogSection({ card, target, titles }: LogSectionProps) {
  const { t } = useTranslation();
  const { lastAmountOf, saveTemperature, saveDose, saveNoteEvent } = card;
  const medicines = useMedicines().load;
  const [logging, setLogging] = useState<'dose' | 'temperature' | 'noteEvent'>();
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
        {titles.noteEvent !== undefined && (
          <ListRow
            title={titles.noteEvent}
            accent
            onClick={() => {
              setLogging('noteEvent');
            }}
          />
        )}
      </GroupedSection>
      {logging === 'noteEvent' && target !== undefined && (
        <NoteEventSheet {...target} save={saveNoteEvent} onClose={close} />
      )}
      {logging === 'temperature' && target !== undefined && (
        <TemperatureSheet {...target} save={saveTemperature} onClose={close} />
      )}
      {logging === 'dose' && target !== undefined && medicines.status === 'ready' && (
        <DoseSheet
          {...target}
          medicines={medicines.value}
          lastAmountOf={lastAmountOf}
          save={saveDose}
          onClose={close}
        />
      )}
    </>
  );
}
