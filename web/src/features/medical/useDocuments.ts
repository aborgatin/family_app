import { useCallback, useEffect, useMemo, useState } from 'react';
import { asApiError, type ApiError } from '@/shared/api';
import { cachedFile, forgetFile, forgetFilesExcept, keepFile } from '@/shared/files';
import { byId, deleteRow, requestSync, upsertRow, useRows } from '@/shared/sync';
import { documentFileUrl, downloadDocumentFile, uploadDocument } from './documentsApi';
import { isOn, type MedicalDocument, type Person } from './medicalTypes';

/** The largest file a Document may have: 20 MB (the server's limit, checked here first). */
export const DOCUMENT_MAX_SIZE = 20 * 1024 * 1024;

/** The files the picker offers: PDFs and photos (the server checks the content). */
export const DOCUMENT_TYPES = 'application/pdf,image/*';

/** What a Member writes about a Document. */
export interface DocumentDetails {
  title: string;
  /** `YYYY-MM-DD`. */
  date: string;
  description: string;
}

/** A new Document's id, made on the device (S3) once when its sheet opens, so a retry repeats it. */
export function newDocumentId(): string {
  return crypto.randomUUID();
}

const COLLATOR = new Intl.Collator('ru', { sensitivity: 'base' });

/** Newest first by date; one day's by title, then id. */
function newestFirst(a: MedicalDocument, b: MedicalDocument): number {
  return b.date.localeCompare(a.date) || COLLATOR.compare(a.title, b.title) || byId(a, b);
}

/** The id of the Document whose file was downloaded from `url`, if it is one. */
function documentIdOf(url: string): string | undefined {
  const match = /\/api\/documents\/([^/]+)\/file$/.exec(
    new URL(url, window.location.origin).pathname,
  );
  const id = match?.[1];
  return id === undefined ? undefined : decodeURIComponent(id);
}

/**
 * The Documents of a card and every change to them: the only data access to them.
 *
 * - `documents`: the card's Documents, newest first by date; `undefined` until read;
 * - `add(id, file, details)`: uploads a new one (online only: rejects with the `ApiError`, e.g.
 *   `network.unavailable` offline), then asks for a pull, which brings it;
 * - `save(document, details)`: changes its title, date and description through the Outbox;
 * - `remove(document)`: deletes it through the Outbox, and its file kept on this device.
 *
 * While it is used, the files kept for Documents that are gone (deleted on another device, or with
 * their Child) are forgotten.
 */
export function useDocuments(person: Person) {
  const rows = useRows('document') as MedicalDocument[] | undefined;
  const documents = useMemo(
    () => rows?.filter((document) => isOn(person, document)).sort(newestFirst),
    [rows, person],
  );

  useEffect(() => {
    if (rows === undefined) return;
    const present = new Set(rows.map((document) => document.id));
    void forgetFilesExcept((url) => {
      const id = documentIdOf(url);
      return id === undefined || present.has(id);
    });
  }, [rows]);

  const add = useCallback(
    async (id: string, file: File, details: DocumentDetails) => {
      const form = new FormData();
      form.append('id', id);
      if (person.childId !== undefined) {
        form.append('childId', person.childId);
      } else {
        form.append('memberId', person.memberId);
      }
      form.append('title', details.title.trim());
      form.append('date', details.date);
      const description = details.description.trim();
      if (description !== '') form.append('description', description);
      form.append('file', file);
      await uploadDocument(form);
      requestSync();
    },
    [person],
  );

  const save = useCallback(
    (document: MedicalDocument, details: DocumentDetails) =>
      upsertRow('document', document.id, {
        title: details.title.trim(),
        date: details.date,
        description: details.description.trim() === '' ? null : details.description.trim(),
      }),
    [],
  );

  const remove = useCallback(async (document: MedicalDocument) => {
    await deleteRow('document', document.id);
    await forgetFile(documentFileUrl(document.id));
  }, []);

  return { documents, add, save, remove };
}

/** A Document's file being opened: an object URL for the viewer once it is there. */
export type DocumentFile =
  | { status: 'loading' }
  | { status: 'ready'; url: string; contentType: string }
  | { status: 'failed'; error: ApiError };

/**
 * Opens a Document's file: the copy kept on this device, or else downloaded (online only) and
 * kept, so it opens again offline. Mount it once per Document (key it by the id).
 */
export function useDocumentFile(document: MedicalDocument): DocumentFile {
  const [file, setFile] = useState<DocumentFile>({ status: 'loading' });
  const { id, contentType } = document;

  useEffect(() => {
    const opened = { current: true };
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const url = documentFileUrl(id);
        let response = await cachedFile(url);
        if (response === undefined) {
          const downloaded = await downloadDocumentFile(id);
          await keepFile(url, downloaded.clone());
          response = downloaded;
        }
        const blob = await response.blob();
        if (!opened.current) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ status: 'ready', url: objectUrl, contentType });
      } catch (failure: unknown) {
        if (opened.current) setFile({ status: 'failed', error: asApiError(failure) });
      }
    })();
    return () => {
      opened.current = false;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [id, contentType]);

  return file;
}
