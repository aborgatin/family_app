import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localDay, longDay } from '@/shared/dates';
import { GroupedSection, ListRow, Page, Sections } from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { DocumentSheet } from './DocumentSheet';
import { CardMissing } from './MedicalCardPage';
import { cardPath, documentPath } from './medicalPaths';
import type { Person } from './medicalTypes';
import { newDocumentId, useDocuments } from './useDocuments';

interface DocumentsPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * «Документы» of a Medical card (`…/medical/documents`, back «Медкарта»): its Documents, newest
 * first by date, each opening the file full screen; «+ Документ» opens the Document sheet, which
 * uploads a new one. Data only through `useDocuments(person)`.
 */
export function DocumentsPage({ homePath }: DocumentsPageProps) {
  const route = useCardRoute(homePath);
  if (route.status !== 'ready') return <CardMissing route={route} />;
  return <Documents key={cardPath(route.person)} person={route.person} />;
}

function Documents({ person }: { person: Person }) {
  const { t } = useTranslation();
  const { documents, add } = useDocuments(person);
  // The id of the Document being added, made once when its sheet opens (S3).
  const [addingId, setAddingId] = useState<string>();

  return (
    <Page title={t('medical.documents')} back={{ to: cardPath(person), title: t('medical.title') }}>
      <Sections>
        <GroupedSection
          label={t('medical.documents')}
          messages={[documents?.length === 0 && { text: t('medical.noDocuments') }]}
          after={
            <ListRow
              accent
              title={t('medical.addDocument')}
              onClick={() => {
                setAddingId(newDocumentId());
              }}
            />
          }
        >
          {documents?.map((document) => (
            <ListRow
              key={document.id}
              title={document.title}
              subtitle={longDay(localDay(document.date), new Date())}
              to={documentPath(person, document.id)}
            />
          ))}
        </GroupedSection>
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
