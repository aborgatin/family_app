import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GroupedSection, ListRow } from '@/shared/ui';
import { DoseSheet } from './DoseSheet';
import type { EventTarget } from './EventSheet';
import { NoteEventSheet } from './NoteEventSheet';
import { TemperatureSheet } from './TemperatureSheet';
import type { EventDocuments } from './useDocuments';
import type { useMedicalCard } from './useMedicalCard';
import { useMedicines } from './useMedicines';

interface AddEventSectionProps {
  /** The card's `useMedicalCard`, which saves the events. */
  card: Pick<
    ReturnType<typeof useMedicalCard>,
    'lastAmountOf' | 'saveTemperature' | 'saveDose' | 'saveNoteEvent'
  >;
  /**
   * Where the new event goes: «Добавить к» from the card, or the open Illness; `undefined` while
   * the card loads (the rows show, the sheets wait).
   */
  target: Omit<EventTarget, 'onClose' | 'documents'> | undefined;
  /** The card's Documents of events (`useEventDocuments`), for the sheets' «Документ». */
  documents: EventDocuments;
  /**
   * The rows' titles, each row only given its title: «Добавить приём лекарства» and «Записать
   * температуру» on the card; «Приём лекарства», «Температура» and «Заметка» on an Illness;
   * «Заметка» alone on a Condition (it holds Note events only).
   */
  titles: { dose?: string; temperature?: string; noteEvent?: string };
}

/**
 * «Записать»: given their titles, a row that opens the dose sheet, one that opens the Temperature
 * sheet and one that opens the Note sheet, into `target`. Shared by the card and the Illness screen.
 */
export function AddEventSection({ card, target, documents, titles }: AddEventSectionProps) {
  const { t } = useTranslation();
  const { lastAmountOf, saveTemperature, saveDose, saveNoteEvent } = card;
  const medicines = useMedicines().load;
  const [adding, setAdding] = useState<'dose' | 'temperature' | 'noteEvent'>();
  const close = () => {
    setAdding(undefined);
  };

  return (
    <>
      <GroupedSection label={t('medical.log')}>
        {titles.dose !== undefined && (
          <ListRow
            title={titles.dose}
            accent
            onClick={() => {
              setAdding('dose');
            }}
          />
        )}
        {titles.temperature !== undefined && (
          <ListRow
            title={titles.temperature}
            accent
            onClick={() => {
              setAdding('temperature');
            }}
          />
        )}
        {titles.noteEvent !== undefined && (
          <ListRow
            title={titles.noteEvent}
            accent
            onClick={() => {
              setAdding('noteEvent');
            }}
          />
        )}
      </GroupedSection>
      {adding === 'noteEvent' && target !== undefined && (
        <NoteEventSheet {...target} documents={documents} save={saveNoteEvent} onClose={close} />
      )}
      {adding === 'temperature' && target !== undefined && (
        <TemperatureSheet
          {...target}
          documents={documents}
          save={saveTemperature}
          onClose={close}
        />
      )}
      {adding === 'dose' && target !== undefined && medicines.status === 'ready' && (
        <DoseSheet
          {...target}
          documents={documents}
          medicines={medicines.value}
          lastAmountOf={lastAmountOf}
          save={saveDose}
          onClose={close}
        />
      )}
    </>
  );
}
