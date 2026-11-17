import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { localDay, longDay } from '@/shared/dates';
import {
  EditableRow,
  EmptyState,
  GroupedSection,
  ListRow,
  Page,
  Sections,
  SortableList,
  useEditableList,
  useFooterLines,
  type PageBack,
} from '@/shared/ui';
import { useCardRoute, type CardRoute } from './cardRoute';
import { firstDay, lastDay } from './illnessRules';
import { cardPath, documentsPath, illnessPath } from './medicalPaths';
import type { Illness, IllnessEvent, Person } from './medicalTypes';
import { AddEventSection } from './AddEventSection';
import { NewConditionSheet } from './NewConditionSheet';
import { NewIllnessSheet } from './NewIllnessSheet';
import { useDocumentCount, useEventDocuments } from './useDocuments';
import { newIllnessId, useMedicalCard } from './useMedicalCard';

interface MedicalCardPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * A Medical card («Медкарта»): the Member's own (`/medical`, back to Home) or a Child's
 * (`/children/:id/medical`, back to the Child page). «Добавить приём лекарства» opens the dose
 * sheet, «Записать температуру» the Temperature sheet. Then «Диагнозы/наблюдения» (the Conditions
 * that aren't Ended, by their place: «+ Добавить» adds one last, «Изменить» reorders them),
 * «Болезни» (the Illnesses that aren't Ended, newest first, then «+ Новая болезнь», which adds
 * an empty one by hand and opens it), «Документы (n)» (the Documents
 * screen) and, while there are any, the collapsed «Завершённые» (both kinds, by latest event). Each
 * row opens its Illness or Condition screen. Data only through `useMedicalCard(person)`,
 * `useDocumentCount(person)` and `useEventDocuments(person)`.
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

function Card({ person, back }: { person: Person; back: PageBack }) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const card = useMedicalCard(person);
  const documentCount = useDocumentCount(person);
  const eventDocuments = useEventDocuments(person);
  const { illnesses, conditions, ended, eventsOf, addIllness, addCondition, moveCondition } = card;
  const navigate = useNavigate();
  const list = useEditableList();
  // The id of the Condition being added, made once when its sheet opens (S3).
  const [addingId, setAddingId] = useState<string>();
  // The id of the Illness being added by hand, made once when its sheet opens (S3).
  const [addingIllnessId, setAddingIllnessId] = useState<string>();
  const [showingEnded, setShowingEnded] = useState(false);

  return (
    <Page title={t('medical.title')} back={back}>
      <Sections>
        <AddEventSection
          card={card}
          // «Добавить к» offers the Illnesses that aren't Ended: a Condition holds Notes only.
          target={illnesses === undefined ? undefined : { addTo: { illnesses, eventsOf } }}
          documents={eventDocuments}
          titles={{ dose: t('medical.logDose'), temperature: t('medical.logTemperature') }}
        />
        <GroupedSection
          header={t('medical.conditions')}
          {...(conditions !== undefined && conditions.length > 0 && { edit: list.edit })}
          messages={[lines.failure(list.error)]}
          after={
            <ListRow
              accent
              title={t('medical.addCondition')}
              onClick={() => {
                setAddingId(newIllnessId());
              }}
            />
          }
        >
          {conditions !== undefined && conditions.length > 0 && (
            <SortableList
              items={conditions}
              itemId={(condition) => condition.id}
              itemTitle={(condition) => condition.name}
              onMove={(condition, to) => list.attempt(() => moveCondition(condition, to))}
            >
              {(condition, sortable) => (
                <EditableRow
                  title={condition.name}
                  subtitle={conditionSummary(t, eventsOf(condition.id))}
                  to={illnessPath(person, condition.id)}
                  sortable={sortable}
                />
              )}
            </SortableList>
          )}
        </GroupedSection>
        <GroupedSection
          header={t('medical.illnesses')}
          messages={[illnesses?.length === 0 && { text: t('medical.noIllnesses') }]}
        >
          {illnesses?.map((illness) => (
            <IllnessOrConditionRow
              key={illness.id}
              person={person}
              illness={illness}
              events={eventsOf(illness.id)}
            />
          ))}
          <ListRow
            accent
            title={t('medical.addIllness')}
            onClick={() => {
              setAddingIllnessId(newIllnessId());
            }}
          />
        </GroupedSection>
        <GroupedSection>
          <ListRow
            title={t('medical.documentsCount', { n: documentCount ?? 0 })}
            to={documentsPath(person)}
          />
        </GroupedSection>
        {ended !== undefined && ended.length > 0 && (
          <GroupedSection
            header={t('medical.ended')}
            action={{
              label: showingEnded ? t('medical.hideEnded') : t('medical.showEnded'),
              expanded: showingEnded,
              onClick: () => {
                setShowingEnded(!showingEnded);
              },
            }}
          >
            {showingEnded &&
              ended.map((illness) => (
                <IllnessOrConditionRow
                  key={illness.id}
                  person={person}
                  illness={illness}
                  events={eventsOf(illness.id)}
                />
              ))}
          </GroupedSection>
        )}
      </Sections>
      {addingIllnessId !== undefined && (
        <NewIllnessSheet
          key={addingIllnessId}
          id={addingIllnessId}
          add={async (id, name) => {
            await addIllness(id, name);
            void navigate(illnessPath(person, id));
          }}
          onClose={() => {
            setAddingIllnessId(undefined);
          }}
        />
      )}
      {addingId !== undefined && (
        <NewConditionSheet
          key={addingId}
          id={addingId}
          add={addCondition}
          onClose={() => {
            setAddingId(undefined);
          }}
        />
      )}
    </Page>
  );
}

/** A Condition's line under its name: «последнее: 3 марта» (the year when not this one). */
function conditionSummary(t: TFunction, events: readonly IllnessEvent[]): string {
  const last = lastDay(events);
  return last === undefined
    ? t('medical.noEvents')
    : t('medical.lastEvent', { date: longDay(localDay(last), new Date()) });
}

/**
 * An Illness or Condition on the card: its name, then «с 2 декабря · 4 события» for an Illness,
 * «последнее: 3 марта» for a Condition, or «Нет событий».
 */
function IllnessOrConditionRow({
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
  let subtitle: string;
  if (illness.kind === 'CONDITION') {
    subtitle = conditionSummary(t, events);
  } else if (first === undefined) {
    subtitle = t('medical.noEvents');
  } else {
    subtitle = t('medical.illnessSummary', {
      since: t('medical.since', { date: longDay(localDay(first), new Date()) }),
      events: t('medical.events', { count: events.length }),
    });
  }
  return <ListRow title={illness.name} subtitle={subtitle} to={illnessPath(person, illness.id)} />;
}
