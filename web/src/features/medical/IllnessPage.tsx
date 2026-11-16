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
  TextAreaRow,
  useAutoSaveText,
} from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { eventsInOrder, firstDay, formatTemperature } from './illnessRules';
import { EditEventSheet } from './EditEventSheet';
import { CardMissing } from './MedicalCardPage';
import { cardPath } from './medicalPaths';
import { LogSection } from './LogSection';
import type { Illness, IllnessEvent, Person } from './medicalTypes';
import { useMedicalCard } from './useMedicalCard';
import { useMedicines } from './useMedicines';

interface IllnessPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * An Illness screen (`…/medical/illnesses/:illnessId`), back to its card: titled with the Illness's
 * name, «с 2 декабря 2026», «Приём лекарства» and «Температура» (their sheets, into this Illness), then its
 * events, newest first, under a header per day. An Illness that is unknown, or is deleted while the
 * screen is open, says so. Data only through `useMedicalCard(person)`.
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
  const navigate = useNavigate();
  const { illnesses, eventsOf, rename, describe, removeIllness } = card;
  const { nameOf } = useMedicines();
  const illness = illnesses?.find(({ id }) => id === illnessId);
  const back = { to: cardPath(person), title: t('medical.title') };
  // The event whose sheet is open.
  const [openedId, setOpenedId] = useState<string>();

  if (illness === undefined) {
    return (
      <Page title={t('medical.illness')} back={back}>
        {illnesses === undefined ? (
          <EmptyState role="status">{t('common.loading')}</EmptyState>
        ) : (
          <EmptyState role="alert">{t('medical.illnessNotFound')}</EmptyState>
        )}
      </Page>
    );
  }

  const events = eventsInOrder(eventsOf(illness.id));
  const first = firstDay(events);
  const days = [...new Set(events.map(({ date }) => date))];
  const opened = events.find(({ id }) => id === openedId);
  return (
    <Page title={illness.name} back={back}>
      <Sections>
        <IllnessFields key={illness.id} illness={illness} rename={rename} describe={describe} />
        {first !== undefined && (
          <GroupedSection>
            <ListRow title={t('medical.since', { date: longDay(localDay(first), 'always') })} />
          </GroupedSection>
        )}
        <LogSection
          card={card}
          target={{ illnessId: illness.id }}
          titles={{
            dose: t('medical.dose'),
            temperature: t('medical.temperature'),
            note: t('medical.note'),
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
                  onOpen={() => {
                    setOpenedId(event.id);
                  }}
                />
              ))}
          </GroupedSection>
        ))}
        <GroupedSection>
          <ConfirmRow
            title={t('ui.delete')}
            confirm={{
              title: t('medical.confirmDeleteIllness', { name: illness.name }),
              ...(events.length > 0 && {
                message: t('medical.deleteIllnessEvents', { count: events.length }),
              }),
              action: t('ui.delete'),
            }}
            onConfirm={() => {
              // Leave first: the Illness is gone from the local store as soon as it is deleted.
              void navigate(back.to, { replace: true });
              void removeIllness(illness);
            }}
          />
        </GroupedSection>
      </Sections>
      {opened !== undefined && (
        <EditEventSheet
          key={opened.id}
          event={opened}
          card={card}
          onClose={() => {
            setOpenedId(undefined);
          }}
        />
      )}
    </Page>
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
    save: useCallback((value: string) => rename(illness, value.trim()), [illness, rename]),
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
  onOpen,
}: {
  event: IllnessEvent;
  nameOfMedicine: (medicineId: string) => string | undefined;
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
    />
  );
}
