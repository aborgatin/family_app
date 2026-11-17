import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { localDay, longDay } from '@/shared/dates';
import {
  autoSaveMessages,
  ConfirmRow,
  EmptyState,
  GroupedSection,
  InputRow,
  ListRow,
  Page,
  Sections,
  SegmentedControl,
  TextAreaRow,
  useAutoSaveChoice,
  useAutoSaveText,
} from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { eventsInOrder, firstDay, formatTemperature } from './illnessRules';
import { EditEventSheet } from './EditEventSheet';
import { CardMissing } from './MedicalCardPage';
import { cardPath, documentPath, documentsPath } from './medicalPaths';
import { LogSection } from './LogSection';
import type { Illness, IllnessEvent, MedicalDocument, Person } from './medicalTypes';
import { useEventDocuments } from './useDocuments';
import { useMedicalCard } from './useMedicalCard';
import { useMedicines } from './useMedicines';

interface IllnessPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * An Illness or Condition screen (`…/medical/illnesses/:illnessId`), back to its card: titled with
 * its name, «с 2 декабря 2026» (an Illness only), «Документы (n)» (its events' Documents),
 * «Приём лекарства», «Температура» and «Заметка»
 * (their sheets, into this one), then its events, newest first, under a header per day (📎 opens
 * the Document an event carries), and the
 * actions «Тип: Болезнь / Диагноз/наблюдение», «Завершить» or «Возобновить», and «Удалить». An Ended
 * one stays fully editable. One that is unknown, or is deleted while the screen is open, says so.
 * Data only through `useMedicalCard(person)` and `useEventDocuments(person)`.
 */
export function IllnessPage({ homePath }: IllnessPageProps) {
  const route = useCardRoute(homePath);
  if (route.status !== 'ready') return <CardMissing route={route} />;
  return <IllnessScreen key={cardPath(route.person)} person={route.person} />;
}

function IllnessScreen({ person }: { person: Person }) {
  const { t } = useTranslation();
  const { illnessId } = useParams();
  const card = useMedicalCard(person);
  const eventDocuments = useEventDocuments(person);
  const navigate = useNavigate();
  const { all, eventsOf, rename, describe, removeIllness, changeKind, end, resume } = card;
  const { nameOf } = useMedicines();
  const illness = all?.find(({ id }) => id === illnessId);
  const back = { to: cardPath(person), title: t('medical.title') };
  // The event whose sheet is open.
  const [openedId, setOpenedId] = useState<string>();

  if (illness === undefined) {
    return (
      <Page title={t('medical.illness')} back={back}>
        {all === undefined ? (
          <EmptyState role="status">{t('common.loading')}</EmptyState>
        ) : (
          <EmptyState role="alert">{t('medical.illnessNotFound')}</EmptyState>
        )}
      </Page>
    );
  }

  const events = eventsInOrder(eventsOf(illness.id));
  const first = firstDay(events);
  const documents = eventDocuments.ofEvents(events);
  const days = [...new Set(events.map(({ date }) => date))];
  const opened = events.find(({ id }) => id === openedId);
  return (
    <Page title={illness.name} back={back}>
      <Sections>
        <IllnessFields key={illness.id} illness={illness} rename={rename} describe={describe} />
        <GroupedSection>
          {first !== undefined && illness.kind === 'ILLNESS' && (
            <ListRow title={t('medical.since', { date: longDay(localDay(first), 'always') })} />
          )}
          <ListRow
            title={t('medical.documentsCount', { n: documents.length })}
            to={documentsPath(person, illness.id)}
          />
        </GroupedSection>
        <LogSection
          card={card}
          documents={eventDocuments}
          target={{ illnessId: illness.id }}
          titles={{
            dose: t('medical.dose'),
            temperature: t('medical.temperature'),
            noteEvent: t('medical.noteEvent'),
          }}
        />
        {days.map((day) => (
          <GroupedSection key={day} header={longDay(localDay(day), new Date())}>
            {events
              .filter(({ date }) => date === day)
              .map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  nameOfMedicine={nameOf}
                  document={eventDocuments.of(event.id)}
                  documentPath={(id) => documentPath(person, id, illness.id)}
                  onOpen={() => {
                    setOpenedId(event.id);
                  }}
                />
              ))}
          </GroupedSection>
        ))}
        <IllnessActions
          illness={illness}
          changeKind={changeKind}
          end={end}
          resume={resume}
          confirmDelete={{
            title: t('medical.confirmDeleteIllness', { name: illness.name }),
            ...(events.length > 0 && {
              message:
                documents.length > 0
                  ? t('medical.deleteIllnessEventsAndDocuments', {
                      count: events.length,
                      documents: t('medical.documentCount', { count: documents.length }),
                    })
                  : t('medical.deleteIllnessEvents', { count: events.length }),
            }),
            action: t('ui.delete'),
          }}
          onDelete={() => {
            // Leave first: the Illness is gone from the local store as soon as it is deleted.
            void navigate(back.to, { replace: true });
            void eventDocuments.removeOfEvents(events);
            void removeIllness(illness);
          }}
        />
      </Sections>
      {opened !== undefined && (
        <EditEventSheet
          key={opened.id}
          event={opened}
          card={card}
          documents={eventDocuments}
          onClose={() => {
            setOpenedId(undefined);
          }}
        />
      )}
    </Page>
  );
}

type IllnessActionsProps = Pick<
  ReturnType<typeof useMedicalCard>,
  'changeKind' | 'end' | 'resume'
> & {
  illness: Illness;
  confirmDelete: { title: string; message?: string; action: string };
  onDelete: () => void;
};

/**
 * «Тип»: «Болезнь» / «Диагноз/наблюдение» (auto-saved on tap, the segments the whole row so the
 * long one fits a phone), then «Завершить» or «Возобновить», and «Удалить» (after asking).
 */
function IllnessActions({
  illness,
  changeKind,
  end,
  resume,
  confirmDelete,
  onDelete,
}: IllnessActionsProps) {
  const { t } = useTranslation();
  const kind = useAutoSaveChoice({
    name: 'kind',
    saved: illness.kind,
    save: useCallback(
      (value: Illness['kind']) => changeKind(illness, value),
      [illness, changeKind],
    ),
  });
  return (
    <>
      <GroupedSection header={t('medical.kind')} messages={autoSaveMessages([kind.failure])}>
        <SegmentedControl
          label={t('medical.kind')}
          labelHidden
          options={[
            { value: 'ILLNESS', label: t('medical.illness') },
            { value: 'CONDITION', label: t('medical.condition') },
          ]}
          {...kind.control}
        />
      </GroupedSection>
      <GroupedSection>
        <ListRow
          title={illness.ended === true ? t('medical.resume') : t('medical.end')}
          accent
          onClick={() => void (illness.ended === true ? resume(illness) : end(illness))}
        />
        <ConfirmRow title={t('ui.delete')} confirm={confirmDelete} onConfirm={onDelete} />
      </GroupedSection>
    </>
  );
}

interface IllnessFieldsProps {
  illness: Illness;
  rename: (illness: Illness, name: string) => Promise<string>;
  describe: (illness: Illness, description: string) => Promise<string>;
}

/** «Название» (required) and the large «Описание», auto-saved like an Item's. */
function IllnessFields({ illness, rename, describe }: IllnessFieldsProps) {
  const { t } = useTranslation();
  const name = useAutoSaveText({
    name: 'name',
    saved: illness.name,
    save: useCallback((value: string) => rename(illness, value), [illness, rename]),
    required: true,
  });
  const description = useAutoSaveText({
    name: 'description',
    saved: illness.description ?? '',
    save: useCallback((value: string) => describe(illness, value), [illness, describe]),
  });
  return (
    <GroupedSection messages={autoSaveMessages([name.failure, description.failure])}>
      <InputRow label={t('medical.name')} autoComplete="off" {...name.input} />
      <TextAreaRow label={t('medical.description')} {...description.input} />
    </GroupedSection>
  );
}

/**
 * «22:00 · 38,5 °C», a dose «22:00 · Ибупрофен 20 мг/мл — 5 мл · 38,5 °C» (a deleted Medicine's
 * name too); without a time or a temperature, without those parts.
 */
function EventRow({
  event,
  nameOfMedicine,
  document,
  documentPath,
  onOpen,
}: {
  event: IllnessEvent;
  nameOfMedicine: (medicineId: string) => string | undefined;
  /** The Document the event carries: 📎 at the right opens its file. */
  document: MedicalDocument | undefined;
  /** Where a Document opens. */
  documentPath: (documentId: string) => string;
  /** Opens the event's sheet. */
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const parts = [
    event.time,
    event.kind === 'MEDICINE_DOSE' &&
      t('medical.doseValue', {
        medicine: (event.medicineId == null ? undefined : nameOfMedicine(event.medicineId)) ?? '',
        amount: event.amount ?? '',
      }),
    event.temperature != null && formatTemperature(t, event.temperature),
    event.kind === 'NOTE' && (event.title ?? ''),
  ].filter((part) => typeof part === 'string' && part !== '');
  return (
    <ListRow
      title={parts.join(t('medical.eventSeparator'))}
      wrapTitle
      subtitle={event.description ?? undefined}
      onClick={onOpen}
      {...(document !== undefined && {
        accessory: {
          to: documentPath(document.id),
          label: t('medical.openDocument', { title: document.title }),
          symbol: '📎',
        },
      })}
    />
  );
}
