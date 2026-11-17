import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { errorMessage } from '@/shared/api';
import { Button, FileViewer, type PageBack } from '@/shared/ui';
import { useCardRoute } from './cardRoute';
import { DocumentSheet } from './DocumentSheet';
import { CardMissing } from './MedicalCardPage';
import { cardPath, documentBackOf, documentsPath } from './medicalPaths';
import { fileKind, type MedicalDocument, type Person } from './medicalTypes';
import { useDocumentFile, useDocuments, type DocumentDetails } from './useDocuments';

interface DocumentPageProps {
  /** Path of Home: the way back from the Member's own card. */
  homePath: string;
}

/**
 * A Document open full screen (`…/medical/documents/:documentId`, back «Документы»; or
 * `…/illnesses/:illnessId/documents/:documentId`, back to that Illness's «Документы», or to the
 * Illness when opened from an event's paperclip, `documentOpenedFrom`): its file in
 * the browser's own viewer, from this device once opened here, so it opens again offline.
 * «Изменить» opens the Document sheet (title, date, description; «Удалить документ»). A file that
 * is gone from the server shows «Файл недоступен».
 */
export function DocumentPage({ homePath }: DocumentPageProps) {
  const route = useCardRoute(homePath);
  const { documentId = '', illnessId } = useParams();
  if (route.status !== 'ready') return <CardMissing route={route} />;
  return (
    <DocumentScreen
      key={cardPath(route.person)}
      person={route.person}
      documentId={documentId}
      illnessId={illnessId}
    />
  );
}

function DocumentScreen({
  person,
  documentId,
  illnessId,
}: {
  person: Person;
  documentId: string;
  /**
   * Opened under this Illness: back to its Documents, or to the screen the history state names
   * (the Illness, from an event's paperclip).
   */
  illnessId: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, save, remove } = useDocuments(person);
  const [editing, setEditing] = useState(false);
  const back = documentBackOf(location.state) ?? {
    to: documentsPath(person, illnessId),
    title: t('medical.documents'),
  };
  const document = documents?.find((found) => found.id === documentId);

  if (document === undefined) {
    return (
      <FileViewer
        title={t('medical.document')}
        back={back}
        message={
          documents === undefined
            ? { text: t('common.loading'), role: 'status' }
            : { text: t('medical.documentNotFound'), role: 'alert' }
        }
      />
    );
  }
  return (
    <>
      <OpenFile
        key={document.id}
        document={document}
        back={back}
        onEdit={() => {
          setEditing(true);
        }}
      />
      {editing && (
        <DocumentSheet
          mode={{
            editing: {
              document,
              save: (details: DocumentDetails) => save(document, details),
              remove: () => {
                void navigate(back.to, { replace: true });
                void remove(document);
              },
            },
          }}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

/** The Document's file, once there (kept here, or downloaded); else why it isn't. */
function OpenFile({
  document,
  back,
  onEdit,
}: {
  document: MedicalDocument;
  back: PageBack;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const file = useDocumentFile(document);
  const actions = <Button onClick={onEdit}>{t('ui.edit')}</Button>;
  if (file.status === 'ready') {
    return (
      <FileViewer
        title={document.title}
        back={back}
        actions={actions}
        file={{ url: file.url, kind: fileKind(document) }}
      />
    );
  }
  let message: { text: string; role: 'status' | 'alert' };
  if (file.status === 'loading') {
    message = { text: t('common.loading'), role: 'status' };
  } else {
    const failure = errorMessage(file.error);
    message = { text: t(failure.key, failure.values), role: 'alert' };
  }
  return <FileViewer title={document.title} back={back} actions={actions} message={message} />;
}
