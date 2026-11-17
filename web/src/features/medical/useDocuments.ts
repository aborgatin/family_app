import { useCallback, useEffect, useMemo, useState } from 'react';
import { asApiError, type ApiError } from '@/shared/api';
import { cachedFile, forgetFile, forgetFilesExcept, keepFile } from '@/shared/files';
import { byId, deleteRow, requestSync, upsertRow, useRows } from '@/shared/sync';
import {
  documentFileUrl,
  documentIdOf,
  downloadDocumentFile,
  uploadDocument,
} from './documentsApi';
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

/** How many Documents the card has (its «Документы (n)» row); `undefined` until read. */
export function useDocumentCount(person: Person): number | undefined {
  const rows = useRows('document') as MedicalDocument[] | undefined;
  return useMemo(() => rows?.filter((document) => isOn(person, document)).length, [rows, person]);
}

/**
 * The Documents of a card and every change to them: the data access to them (beside
 * `useDocumentCount`).
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
  { status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed'; error: ApiError };

/**
 * Opens a Document's file: the copy kept on this device, or else downloaded (online only) and
 * kept, so it opens again offline. Mount it once per Document (key it by the id).
 */
export function useDocumentFile(document: MedicalDocument): DocumentFile {
  const [file, setFile] = useState<DocumentFile>({ status: 'loading' });
  const { id } = document;

  useEffect(() => {
    // An object, not a boolean: TypeScript would narrow a `let` to its first value in the closure.
    const mounted = { current: true };
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
        if (!mounted.current) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ status: 'ready', url: objectUrl });
      } catch (failure: unknown) {
        if (mounted.current) setFile({ status: 'failed', error: asApiError(failure) });
      }
    })();
    return () => {
      mounted.current = false;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return file;
}
