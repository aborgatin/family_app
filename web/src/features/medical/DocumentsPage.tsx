import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { localDay, longDay } from '@/shared/dates';
import { EmptyState, GroupedSection, ListRow, Page, Sections } from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { DocumentSheet } from './DocumentSheet';
import { CardMissing } from './MedicalCardPage';
import { cardPath, documentPath, illnessPath } from './medicalPaths';
import type { Illness, MedicalDocument, Person } from './medicalTypes';
import { newDocumentId, useDocuments, useEventDocuments } from './useDocuments';
import { useMedicalCard } from './useMedicalCard';

interface DocumentsPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * «Документы» of a Medical card (`…/medical/documents`, back «Медкарта»): its Documents, newest
 * first by date, one an Illness event carries naming that Illness or Condition («2 декабря ·
 * ОРВИ»), each opening the file full screen; «+ Документ» opens the Document sheet, which uploads a
 * new one. Under an Illness (`…/illnesses/:illnessId/documents`, back to it): only the Documents
 * its events carry, which are added from the events' sheets. Data only through
 * `useDocuments(person)`, `useEventDocuments(person)` and `useMedicalCard(person)`.
 */
export function DocumentsPage({ homePath }: DocumentsPageProps) {
  const route = useCardRoute(homePath);
  const { illnessId } = useParams();
  if (route.status !== 'ready') return <CardMissing route={route} />;
  return illnessId === undefined ? (
    <CardDocuments key={cardPath(route.person)} person={route.person} />
  ) : (
    <IllnessDocuments
      key={`${cardPath(route.person)} ${illnessId}`}
      person={route.person}
      illnessId={illnessId}
    />
  );
}

function CardDocuments({ person }: { person: Person }) {
  const { t } = useTranslation();
  const { documents, add } = useDocuments(person);
  const { illnessOfEvent } = useMedicalCard(person);
  // The id of the Document being added, made once when its sheet opens (S3).
  const [addingId, setAddingId] = useState<string>();

  return (
    <Page title={t('medical.documents')} back={{ to: cardPath(person), title: t('medical.title') }}>
      <Sections>
        <DocumentRows
          person={person}
          documents={documents}
          illnessOf={(document) =>
            document.illnessEventId == null ? undefined : illnessOfEvent(document.illnessEventId)
          }
          after={
            <ListRow
              accent
              title={t('medical.addDocument')}
              onClick={() => {
                setAddingId(newDocumentId());
              }}
            />
          }
        />
      </Sections>
      {addingId !== undefined && (
        <DocumentSheet
          key={addingId}
          mode={{ adding: { id: addingId, add } }}
          onClose={() => {
            setAddingId(undefined);
          }}
        />
      )}
    </Page>
  );
}

function IllnessDocuments({ person, illnessId }: { person: Person; illnessId: string }) {
  const { t } = useTranslation();
  const { all, eventsOf } = useMedicalCard(person);
  const { ofEvents } = useEventDocuments(person);
  const illness = all?.find(({ id }) => id === illnessId);

  if (illness === undefined) {
    return (
      <Page
        title={t('medical.documents')}
        back={{ to: cardPath(person), title: t('medical.title') }}
      >
        {all === undefined ? (
          <EmptyState role="status">{t('common.loading')}</EmptyState>
        ) : (
          <EmptyState role="alert">{t('medical.illnessNotFound')}</EmptyState>
        )}
      </Page>
    );
  }
  return (
    <Page
      title={t('medical.documents')}
      back={{ to: illnessPath(person, illness.id), title: illness.name }}
    >
      <Sections>
        <DocumentRows
          person={person}
          documents={ofEvents(eventsOf(illness.id))}
          illnessId={illness.id}
        />
      </Sections>
    </Page>
  );
}

interface DocumentRowsProps {
  person: Person;
  /** `undefined` until read. */
  documents: readonly MedicalDocument[] | undefined;
  /** The Illness whose Documents these are; they open under it. */
  illnessId?: string;
  /** The Illness or Condition a Document's event is in, named on its row. */
  illnessOf?: (document: MedicalDocument) => Illness | undefined;
  /** After the rows: «+ Документ». */
  after?: ReactNode;
}

/** «Документы»: a row per Document, its title then its date (and Illness), opening its file. */
function DocumentRows({ person, documents, illnessId, illnessOf, after }: DocumentRowsProps) {
  const { t } = useTranslation();
  return (
    <GroupedSection
      label={t('medical.documents')}
      messages={[documents?.length === 0 && { text: t('medical.noDocuments') }]}
      after={after}
    >
      {documents?.map((document) => {
        const date = longDay(localDay(document.date), new Date());
        const illness = illnessOf?.(document);
        return (
          <ListRow
            key={document.id}
            title={document.title}
            subtitle={
              illness === undefined
                ? date
                : t('medical.documentOfIllness', { date, illness: illness.name })
            }
            to={documentPath(person, document.id, illnessId)}
          />
        );
      })}
    </GroupedSection>
  );
}
