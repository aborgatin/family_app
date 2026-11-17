import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  asApiError,
  failureMessages,
  NETWORK_UNAVAILABLE,
  type ApiError,
  type ErrorMessage,
  type FieldMessages,
} from '@/shared/api';
import { cachedFile, forgetFile, forgetFilesExcept, keepFile } from '@/shared/files';
import { byId, deleteRow, flushOutbox, requestSync, upsertRow, useRows } from '@/shared/sync';
import {
  documentFileUrl,
  documentIdOf,
  downloadDocumentFile,
  uploadDocument,
} from './documentsApi';
import { isOn, optionalText, type MedicalDocument, type Person } from './medicalTypes';

/** The largest file a Document may have: 20 MB (the server's limit, checked here first). */
export const DOCUMENT_MAX_SIZE = 20 * 1024 * 1024;

/** Why a chosen file can't be uploaded before trying (over 20 MB), else `undefined`. */
export function documentFileError(file: File): 'errors.documentTooLarge' | undefined {
  return file.size > DOCUMENT_MAX_SIZE ? 'errors.documentTooLarge' : undefined;
}

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

const byName = new Intl.Collator('ru');

/** Newest first by date; one day's by title, then id. */
function newestFirst(a: MedicalDocument, b: MedicalDocument): number {
  return b.date.localeCompare(a.date) || byName.compare(a.title, b.title) || byId(a, b);
}

/**
 * The Document rows of the store (`all`, every card's) and of the person's card (`on`, unsorted);
 * both `undefined` until read. The one read of the `document` table.
 */
function useDocumentRows(person: Person) {
  const all = useRows('document') as MedicalDocument[] | undefined;
  const on = useMemo(() => all?.filter((document) => isOn(person, document)), [all, person]);
  return { all, on };
}

/** Deletes the Document through the Outbox, and its file kept on this device. */
async function removeDocument(document: MedicalDocument): Promise<void> {
  await deleteRow('document', document.id);
  await forgetFile(documentFileUrl(document.id));
}

/**
 * The messages a failed upload shows: offline, that it needs the internet (the form's); else the
 * server's, under `fields` when one of them is named, or the form's.
 */
export function uploadFailureMessages<F extends string>(
  error: unknown,
  fields: readonly F[],
): { fieldMessages: FieldMessages<F>; formMessage: ErrorMessage | undefined } {
  if (asApiError(error).code === NETWORK_UNAVAILABLE) {
    return { fieldMessages: {}, formMessage: { key: 'medical.uploadNeedsInternet', values: {} } };
  }
  return failureMessages(error, fields);
}

/** How many Documents the card has (its «Документы (n)» row); `undefined` until read. */
export function useDocumentCount(person: Person): number | undefined {
  return useDocumentRows(person).on?.length;
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
  const { all: rows, on } = useDocumentRows(person);
  const documents = useMemo(() => on && [...on].sort(newestFirst), [on]);

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
      await uploadDocument(uploadForm(person, id, file, details));
      requestSync();
    },
    [person],
  );

  const save = useCallback(
    (document: MedicalDocument, details: DocumentDetails) =>
      upsertRow('document', document.id, {
        title: details.title.trim(),
        date: details.date,
        description: optionalText(details.description),
      }),
    [],
  );

  return { documents, add, save, remove: removeDocument };
}

/** A file's name without its extension, a Document's default title: «Анализ крови.pdf» → «Анализ крови». */
export function titleOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(0, dot) : file.name;
}

/** The form of an upload of a new Document to the person's card. */
function uploadForm(person: Person, id: string, file: File, details: DocumentDetails): FormData {
  const form = new FormData();
  form.append('id', id);
  if (person.childId !== undefined) {
    form.append('childId', person.childId);
  } else {
    form.append('memberId', person.memberId);
  }
  form.append('title', details.title.trim());
  form.append('date', details.date);
  const description = optionalText(details.description);
  if (description !== null) form.append('description', description);
  form.append('file', file);
  return form;
}

/** What an event sheet needs of its event's Document (`useEventDocuments`). */
export interface EventDocuments {
  /** The Document the Illness event carries, if any. */
  of: (eventId: string) => MedicalDocument | undefined;
  /** The Documents these events carry (an Illness's), newest first by date. */
  ofEvents: (events: readonly { id: string }[]) => MedicalDocument[];
  /**
   * Attaches a file to the Illness event as a new Document `id`, titled after the file and dated
   * like the event, replacing the one the event carries. Online only: it first sends the Outbox,
   * so the event is on the server; rejects with the `ApiError` (`network.unavailable` offline).
   */
  attach: (id: string, eventId: string, file: File, date: string) => Promise<void>;
  /**
   * Deletes the Documents these events carry, with their files kept on this device: what the
   * server does when the events (or their Illness) are deleted, done here at once, offline too.
   */
  removeOfEvents: (events: readonly { id: string }[]) => Promise<void>;
}

/**
 * The Documents of the person's Illness events (ticket #134): the one an event carries (one at
 * most), and attaching a file to one.
 */
export function useEventDocuments(person: Person): EventDocuments {
  const { on } = useDocumentRows(person);
  const byEvent = useMemo(() => {
    const documents = new Map<string, MedicalDocument>();
    for (const document of on ?? []) {
      if (document.illnessEventId != null) documents.set(document.illnessEventId, document);
    }
    return documents;
  }, [on]);
  const of = useCallback((eventId: string) => byEvent.get(eventId), [byEvent]);
  const ofEvents = useCallback(
    (events: readonly { id: string }[]) =>
      events
        .flatMap(({ id }) => {
          const document = byEvent.get(id);
          return document === undefined ? [] : [document];
        })
        .sort(newestFirst),
    [byEvent],
  );
  const attach = useCallback(
    async (id: string, eventId: string, file: File, date: string) => {
      const carried = byEvent.get(eventId);
      const replaced = carried?.id === id ? undefined : carried;
      await flushOutbox();
      const form = uploadForm(person, id, file, { title: titleOf(file), date, description: '' });
      form.append('illnessEventId', eventId);
      if (replaced !== undefined) form.append('replaces', replaced.id);
      await uploadDocument(form);
      if (replaced !== undefined) await forgetFile(documentFileUrl(replaced.id));
      requestSync();
    },
    [byEvent, person],
  );
  const removeOfEvents = useCallback(
    async (events: readonly { id: string }[]) => {
      for (const document of ofEvents(events)) await removeDocument(document);
    },
    [ofEvents],
  );
  return useMemo(
    () => ({ of, ofEvents, attach, removeOfEvents }),
    [of, ofEvents, attach, removeOfEvents],
  );
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
