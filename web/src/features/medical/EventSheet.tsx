import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fieldMessageKey, type ErrorMessage, type FieldMessages } from '@/shared/api';
import { dayOf, localDay, longDay, timeOf } from '@/shared/dates';
import {
  ActionSheet,
  ConfirmRow,
  DateRow,
  FileRow,
  GroupedSection,
  ListRow,
  Sections,
  SelectRow,
  Sheet,
  TextAreaRow,
  useFooterLines,
} from '@/shared/ui';
import { illnessToJoin, takesEvent } from './illnessRules';
import { optionalText, type Illness, type IllnessEvent } from './medicalTypes';
import {
  DOCUMENT_TYPES,
  documentFileError,
  newDocumentId,
  uploadFailureMessages,
  type EventDocuments,
} from './useDocuments';
import type { EventPlace, EventTiming, IllnessChoice } from './useMedicalCard';

/** «Документ»'s field, for its footer lines and the upload's field errors. */
const DOCUMENT_FIELDS = ['file'] as const;

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
  /** The card's Documents of events: the edited event's, and attaching one («Документ»). */
  documents: EventDocuments;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/** An event opened from its row: its values fill the sheet; it may be moved or deleted. */
export interface EventEditing {
  event: IllnessEvent;
  /**
   * The person's Illnesses and Conditions, for «Перенести в…»: those that aren't Ended, but its
   * own; Conditions only for a Note event (a Condition holds Notes only).
   */
  illnesses: readonly Illness[];
  /** Deletes the event (after «Удалить» is confirmed). */
  remove: () => Promise<unknown>;
  /** Where the Document the event carries opens, and the history state that brings back here. */
  openDocument: (documentId: string) => { to: string; state: unknown };
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
  /** Saves the event (`place.eventId` set when editing); the sheet closes once it resolves. */
  save: (place: EventPlace, timing: EventTiming) => Promise<string>;
}

/**
 * What every Illness event sheet has, around the rows of its kind: «Дата» and «Время» default to
 * when the sheet opened (the time may be cleared; `untimed`, it starts empty), «Описание» is
 * optional, and, from the card, «Добавить к» preselects the Illness to join (`illnessToJoin`) or
 * «Новая болезнь», named after the event's date; «Другая…» picks another of the person's Illnesses that isn't Ended. Saved only
 * with «Готово», once the kind's rows pass `check`. `editing` an event, its values fill the sheet,
 * «Готово» saves what changed, «Перенести в…» saves it into another of the person's Illnesses that
 * isn't Ended and takes it (a Condition takes a Note only) or a «Новая болезнь» named after its date, and «Удалить» deletes it after asking.
 * «Документ» attaches a PDF or photo to the event once it is saved (replacing the one it carries),
 * which needs the internet: offline the event is saved and the sheet stays, saying so.
 */
export function EventSheet({
  title,
  children,
  fields,
  check,
  save,
  addTo,
  illnessId,
  untimed = false,
  editing,
  documents,
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
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  // The event's id, made once when a new event's sheet opens (S3), so «Готово» again after a file
  // that couldn't be attached changes the same event.
  const [eventId] = useState(() => editing?.event.id ?? crypto.randomUUID());
  // The Illness the event was saved into, once it was while its file couldn't be attached.
  const [savedInto, setSavedInto] = useState<string>();
  // The file chosen for «Документ», and the id of the Document it becomes (S3, kept for a retry).
  const [file, setFile] = useState<File>();
  const [documentId] = useState(newDocumentId);
  const attached = documents.of(eventId);

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

  /**
   * Checks the rows, then saves the event into the chosen Illness, or into `moveTo` (moving an
   * edited one there); then attaches the chosen file, which needs the internet: when it can't, the
   * event stays saved and the sheet stays open, saying why.
   */
  async function done(moveTo?: () => IllnessChoice) {
    const errors: FieldMessages<string> = { ...check() };
    if (date === '') errors.date = fieldMessageKey('required');
    const fileError = file === undefined ? undefined : documentFileError(file);
    if (fileError !== undefined) errors.file = fileError;
    setFieldErrors(errors);
    setFormError(undefined);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    const place =
      moveTo?.() ?? (savedInto === undefined ? illnessChoice() : { illnessId: savedInto });
    const savedIllnessId = await save(
      { ...place, eventId },
      {
        date,
        time: time === '' ? null : time,
        description: optionalText(description),
      },
    );
    if (file !== undefined) {
      setSavedInto(savedIllnessId);
      try {
        await documents.attach(documentId, eventId, file, date);
      } catch (error: unknown) {
        const { fieldMessages, formMessage } = uploadFailureMessages(error, DOCUMENT_FIELDS);
        setFieldErrors(fieldMessages);
        setFormError(formMessage);
        setSaving(false);
        return;
      }
    }
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
      <Sections>
        <GroupedSection messages={lines.form({ fields, fieldErrors })}>{children}</GroupedSection>
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
        <GroupedSection messages={lines.form({ fields: DOCUMENT_FIELDS, fieldErrors, formError })}>
          <FileRow
            label={t('medical.document')}
            name="file"
            accept={DOCUMENT_TYPES}
            value={file?.name ?? attached?.title ?? t('medical.chooseFile')}
            {...(file === undefined &&
              attached !== undefined &&
              editing !== undefined && {
                open: {
                  ...editing.openDocument(attached.id),
                  label: t('medical.openDocument', { title: attached.title }),
                  replaceLabel: t('medical.replaceFile'),
                },
              })}
            onChange={(chosen) => {
              setFile(chosen);
              setFormError(undefined);
            }}
          />
        </GroupedSection>
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
                  .filter(
                    (illness) =>
                      illness.id !== editing.event.illnessId &&
                      illness.ended !== true &&
                      takesEvent(illness, editing.event.kind),
                  )
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
      </Sections>
    </Sheet>
  );
}
