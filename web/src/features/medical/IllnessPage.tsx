import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { localDay, longDay } from '@/shared/dates';
import { EmptyState, GroupedSection, ListRow, Page, Sections } from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { eventsInOrder, firstDay, formatTemperature } from './illnessRules';
import { CardMissing } from './MedicalCardPage';
import { cardPath } from './medicalPaths';
import { DoseSheet } from './DoseSheet';
import type { IllnessEvent, Person } from './medicalTypes';
import { TemperatureSheet } from './TemperatureSheet';
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
  const { illnesses, eventsOf, lastAmountOf, logTemperature, logDose } = useMedicalCard(person);
  const { load: medicines, nameOf } = useMedicines();
  const [logging, setLogging] = useState<'dose' | 'temperature'>();
  const close = () => {
    setLogging(undefined);
  };
  const illness = illnesses?.find(({ id }) => id === illnessId);
  const back = { to: cardPath(person), title: t('medical.title') };

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
  return (
    <Page title={illness.name} back={back}>
      <Sections>
        {first !== undefined && (
          <GroupedSection>
            <ListRow title={t('medical.since', { date: longDay(localDay(first), 'always') })} />
          </GroupedSection>
        )}
        <GroupedSection label={t('medical.log')}>
          <ListRow
            title={t('medical.dose')}
            accent
            onClick={() => {
              setLogging('dose');
            }}
          />
          <ListRow
            title={t('medical.temperature')}
            accent
            onClick={() => {
              setLogging('temperature');
            }}
          />
        </GroupedSection>
        {days.map((day) => (
          <GroupedSection key={day} header={longDay(localDay(day), new Date())}>
            {events
              .filter(({ date }) => date === day)
              .map((event) => (
                <EventRow key={event.id} event={event} medicineName={nameOf} />
              ))}
          </GroupedSection>
        ))}
      </Sections>
      {logging === 'temperature' && (
        <TemperatureSheet illnessId={illness.id} save={logTemperature} onClose={close} />
      )}
      {logging === 'dose' && medicines.status === 'ready' && (
        <DoseSheet
          illnessId={illness.id}
          medicines={medicines.value}
          lastAmountOf={lastAmountOf}
          save={logDose}
          onClose={close}
        />
      )}
    </Page>
  );
}

/**
 * «22:00 · 38,5 °C», a dose «22:00 · Ибупрофен 20 мг/мл — 5 мл · 38,5 °C» (a deleted Medicine's
 * name too); without a time or a temperature, without those parts.
 */
function EventRow({
  event,
  medicineName,
}: {
  event: IllnessEvent;
  medicineName: (medicineId: string) => string | undefined;
}) {
  const { t } = useTranslation();
  const parts = [
    event.time,
    event.kind === 'MEDICINE_DOSE' &&
      t('medical.doseValue', {
        medicine: (event.medicineId == null ? undefined : medicineName(event.medicineId)) ?? '',
        amount: event.amount ?? '',
      }),
    event.temperature != null && formatTemperature(t, event.temperature),
  ].filter((part) => typeof part === 'string' && part !== '');
  return (
    <ListRow
      title={parts.join(t('medical.eventSeparator'))}
      wrapTitle
      subtitle={event.description ?? undefined}
    />
  );
}
