import { DoseSheet } from './DoseSheet';
import type { EventEditing } from './EventSheet';
import type { IllnessEvent } from './medicalTypes';
import { NoteEventSheet } from './NoteEventSheet';
import { TemperatureSheet } from './TemperatureSheet';
import type { EventDocuments } from './useDocuments';
import type { useMedicalCard } from './useMedicalCard';
import { useMedicines } from './useMedicines';

interface EditEventSheetProps {
  event: IllnessEvent;
  /** The card's `useMedicalCard`, which saves and deletes the event. */
  card: Pick<
    ReturnType<typeof useMedicalCard>,
    'all' | 'lastAmountOf' | 'saveTemperature' | 'saveDose' | 'saveNoteEvent' | 'removeEvent'
  >;
  /** The card's Documents of events (`useEventDocuments`), for «Документ». */
  documents: EventDocuments;
  onClose: () => void;
}

/**
 * The sheet of an event opened from its row on the Illness screen: the sheet of its kind
 * («Температура», «Приём лекарства», «Заметка»), filled with its values.
 */
export function EditEventSheet({ event, card, documents, onClose }: EditEventSheetProps) {
  const { load, nameOf } = useMedicines();
  const editing: EventEditing = {
    event,
    illnesses: card.all ?? [],
    remove: async () => {
      await documents.removeOfEvents([event]);
      await card.removeEvent(event);
    },
  };
  switch (event.kind) {
    case 'TEMPERATURE':
      return (
        <TemperatureSheet
          editing={editing}
          documents={documents}
          save={card.saveTemperature}
          onClose={onClose}
        />
      );
    case 'NOTE':
      return (
        <NoteEventSheet
          editing={editing}
          documents={documents}
          save={card.saveNoteEvent}
          onClose={onClose}
        />
      );
    case 'MEDICINE_DOSE':
      return load.status === 'ready' ? (
        <DoseSheet
          editing={editing}
          documents={documents}
          medicines={load.value}
          medicineName={event.medicineId == null ? undefined : nameOf(event.medicineId)}
          lastAmountOf={card.lastAmountOf}
          save={card.saveDose}
          onClose={onClose}
        />
      ) : null;
  }
}
