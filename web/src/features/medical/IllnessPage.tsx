import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { localDay, longDay } from '@/shared/dates';
import { EmptyState, GroupedSection, ListRow, Page, Sections } from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { eventsInOrder, firstDay, formatTemperature } from './illnessRules';
import { CardMissing } from './MedicalCardPage';
import { cardPath } from './medicalPaths';
import type { IllnessEvent, Person } from './medicalTypes';
import { TemperatureSheet } from './TemperatureSheet';
import { useMedicalCard } from './useMedicalCard';

interface IllnessPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * An Illness screen (`…/medical/illnesses/:illnessId`), back to its card: titled with the Illness's
 * name, «с 2 декабря 2026», «Температура» (the Temperature sheet, into this Illness), then its
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
  const { illnesses, eventsOf, logTemperature } = useMedicalCard(person);
  const [logging, setLogging] = useState(false);
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
        <GroupedSection label={t('medical.log')}>
          {first !== undefined && (
            <ListRow title={t('medical.since', { date: longDay(localDay(first), 'always') })} />
          )}
          <ListRow
            title={t('medical.temperature')}
            accent
            onClick={() => {
              setLogging(true);
            }}
          />
        </GroupedSection>
        {days.map((day) => (
          <GroupedSection key={day} header={longDay(localDay(day), new Date())}>
            {events
              .filter(({ date }) => date === day)
              .map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
          </GroupedSection>
        ))}
      </Sections>
      {logging && (
        <TemperatureSheet
          illnessId={illness.id}
          save={logTemperature}
          onClose={() => {
            setLogging(false);
          }}
        />
      )}
    </Page>
  );
}

/** «22:00 · 38,5 °C»; without a time just «38,5 °C». */
function EventRow({ event }: { event: IllnessEvent }) {
  const parts = [
    event.time ?? undefined,
    event.temperature === null || event.temperature === undefined
      ? undefined
      : formatTemperature(event.temperature),
  ].filter((part) => part !== undefined);
  return <ListRow title={parts.join(' · ')} subtitle={event.description ?? undefined} />;
}
