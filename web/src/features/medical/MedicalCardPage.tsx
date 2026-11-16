import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localDay, longDay } from '@/shared/dates';
import { EmptyState, GroupedSection, ListRow, Page, Sections } from '@/shared/ui';
import { useCardRoute, type CardRoute } from './cardRoute';
import { firstDay } from './illnessRules';
import { cardPath, illnessPath } from './medicalPaths';
import type { Illness, IllnessEvent, Person } from './medicalTypes';
import { TemperatureSheet } from './TemperatureSheet';
import { useMedicalCard } from './useMedicalCard';

interface MedicalCardPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * A Medical card («Медкарта»): the Member's own (`/medical`, back to Home) or a Child's
 * (`/children/:id/medical`, back to the Child page). «Записать температуру» opens the Temperature
 * sheet; «Болезни» lists the card's Illnesses, newest first, each opening its Illness screen.
 * Data only through `useMedicalCard(person)`.
 */
export function MedicalCardPage({ homePath }: MedicalCardPageProps) {
  const route = useCardRoute(homePath);
  if (route.status !== 'ready') return <CardMissing route={route} />;
  return <Card key={cardPath(route.person)} person={route.person} back={route.back} />;
}

/** A card's screens without their card: loading, or a Child that isn't there. */
export function CardMissing({ route }: { route: CardRoute }) {
  const { t } = useTranslation();
  return (
    <Page title={t('medical.title')} back={route.back}>
      {route.status === 'loading' ? (
        <EmptyState role="status">{t('common.loading')}</EmptyState>
      ) : (
        <EmptyState role="alert">{t('children.notFound')}</EmptyState>
      )}
    </Page>
  );
}

function Card({ person, back }: { person: Person; back: { to: string; title: string } }) {
  const { t } = useTranslation();
  const { illnesses, eventsOf, logTemperature } = useMedicalCard(person);
  const [logging, setLogging] = useState(false);

  return (
    <Page title={t('medical.title')} back={back}>
      <Sections>
        <GroupedSection label={t('medical.log')}>
          <ListRow
            title={t('medical.logTemperature')}
            accent
            onClick={() => {
              setLogging(true);
            }}
          />
        </GroupedSection>
        <GroupedSection
          header={t('medical.illnesses')}
          messages={[illnesses?.length === 0 && { text: t('medical.noIllnesses') }]}
        >
          {illnesses?.map((illness) => (
            <IllnessRow
              key={illness.id}
              person={person}
              illness={illness}
              events={eventsOf(illness.id)}
            />
          ))}
        </GroupedSection>
      </Sections>
      {logging && illnesses !== undefined && (
        <TemperatureSheet
          addTo={{ illnesses, eventsOf }}
          save={logTemperature}
          onClose={() => {
            setLogging(false);
          }}
        />
      )}
    </Page>
  );
}

/** An Illness on the card: its name, then «с 2 декабря · 4 события». */
function IllnessRow({
  person,
  illness,
  events,
}: {
  person: Person;
  illness: Illness;
  events: readonly IllnessEvent[];
}) {
  const { t } = useTranslation();
  const first = firstDay(events);
  const subtitle =
    first === undefined
      ? t('medical.noEvents')
      : t('medical.illnessSummary', {
          since: longDay(localDay(first), new Date()),
          events: t('medical.events', { count: events.length }),
        });
  return <ListRow title={illness.name} subtitle={subtitle} to={illnessPath(person, illness.id)} />;
}
