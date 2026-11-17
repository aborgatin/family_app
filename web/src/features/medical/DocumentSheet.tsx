import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  asApiError,
  failureMessages,
  fieldMessageKey,
  NETWORK_UNAVAILABLE,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { dayOf } from '@/shared/dates';
import {
  ConfirmRow,
  DateRow,
  FileRow,
  GroupedSection,
  InputRow,
  ListRow,
  Sheet,
  TextAreaRow,
  useFooterLines,
} from '@/shared/ui';
import { fileKind, type MedicalDocument } from './medicalTypes';
import { DOCUMENT_MAX_SIZE, DOCUMENT_TYPES, titleOf, type DocumentDetails } from './useDocuments';

type Field = 'file' | 'title' | 'date';
const FIELDS: readonly Field[] = ['file', 'title', 'date'];

/** What the sheet does: add a new Document (its id made once when it opened), or change one. */
export type DocumentSheetMode =
  | {
      adding: {
        id: string;
        add: (id: string, file: File, details: DocumentDetails) => Promise<unknown>;
      };
      editing?: never;
    }
  | {
      editing: {
        document: MedicalDocument;
        save: (details: DocumentDetails) => Promise<unknown>;
        /** Deletes it; the screen goes back to the Documents. */
        remove: () => void;
      };
      adding?: never;
    };

interface DocumentSheetProps {
  mode: DocumentSheetMode;
  /** Closes the sheet: after «Отмена», Esc, or once saved. */
  onClose: () => void;
}

/**
 * «Документ»: a new Document («Файл» to choose a PDF or photo; «Название» defaults to the file's
 * name without its extension; «Дата» to today; «Описание»), uploaded with «Готово», which needs
 * the internet; or a Document's details to change (its file shown, not changed), saved through
 * sync, with «Удалить документ».
 */
export function DocumentSheet({ mode, onClose }: DocumentSheetProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const current = mode.editing?.document;
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState(current?.title ?? '');
  // The title the last chosen file gave, so choosing another one replaces it but not a typed one.
  const [titleFromFile, setTitleFromFile] = useState<string>();
  const [date, setDate] = useState(() => current?.date ?? dayOf(new Date()));
  const [description, setDescription] = useState(current?.description ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldMessages<Field>>({});
  const [formError, setFormError] = useState<ErrorMessage>();
  const [saving, setSaving] = useState(false);

  function choose(chosen: File | undefined) {
    setFile(chosen);
    const others = { ...fieldErrors };
    delete others.file;
    setFieldErrors(others);
    if (chosen === undefined) return;
    const fromFile = titleOf(chosen);
    if (title.trim() === '' || title === titleFromFile) {
      setTitle(fromFile);
      setTitleFromFile(fromFile);
    }
  }

  function check(): FieldMessages<Field> {
    const errors: FieldMessages<Field> = {};
    if (mode.adding !== undefined) {
      if (file === undefined) errors.file = 'medical.fileRequired';
      else if (file.size > DOCUMENT_MAX_SIZE) errors.file = 'errors.documentTooLarge';
    }
    if (title.trim() === '') errors.title = fieldMessageKey('required');
    if (date === '') errors.date = fieldMessageKey('required');
    return errors;
  }

  async function done() {
    setFormError(undefined);
    const errors = check();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    const details = { title, date, description };
    try {
      if (mode.adding !== undefined && file !== undefined) {
        await mode.adding.add(mode.adding.id, file, details);
      } else if (mode.editing !== undefined) {
        await mode.editing.save(details);
      }
      onClose();
    } catch (error: unknown) {
      if (asApiError(error).code === NETWORK_UNAVAILABLE) {
        setFormError({ key: 'medical.uploadNeedsInternet', values: {} });
      } else {
        const { fieldMessages, formMessage } = failureMessages(error, FIELDS);
        setFieldErrors(fieldMessages);
        setFormError(formMessage);
      }
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('medical.document')}
      onDone={() => void done()}
      busy={saving}
    >
      <GroupedSection messages={lines.form({ fields: FIELDS, fieldErrors, formError })}>
        {current === undefined ? (
          <FileRow
            label={t('medical.file')}
            name="file"
            accept={DOCUMENT_TYPES}
            value={file?.name ?? t('medical.chooseFile')}
            onChange={choose}
          />
        ) : (
          <ListRow title={t('medical.file')} value={fileSummary(t, current)} />
        )}
        <InputRow
          label={t('medical.name')}
          name="title"
          autoComplete="off"
          value={title}
          onChange={setTitle}
        />
        <DateRow label={t('medical.date')} name="date" value={date} onChange={setDate} />
        <TextAreaRow
          label={t('medical.description')}
          name="description"
          value={description}
          onChange={setDescription}
        />
      </GroupedSection>
      {mode.editing !== undefined && current !== undefined && (
        <GroupedSection>
          <ConfirmRow
            title={t('medical.deleteDocument')}
            confirm={{
              title: t('medical.confirmDeleteDocument', { title: current.title }),
              action: t('ui.delete'),
            }}
            onConfirm={mode.editing.remove}
          />
        </GroupedSection>
      )}
    </Sheet>
  );
}

const SIZE = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });

/** What the file is and how big: «PDF, 47 КБ», «Фото, 2,4 МБ». */
function fileSummary(t: TFunction, document: MedicalDocument): string {
  const kind = fileKind(document) === 'pdf' ? t('medical.pdf') : t('medical.photo');
  const kilobytes = document.size / 1024;
  const size =
    kilobytes < 1024
      ? t('medical.kilobytes', { size: SIZE.format(Math.max(1, Math.round(kilobytes))) })
      : t('medical.megabytes', { size: SIZE.format(kilobytes / 1024) });
  return t('medical.fileSummary', { kind, size });
}
