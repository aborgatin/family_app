import { http, HttpResponse } from 'msw';
import { fixtureId } from './fixtures';
import { readMultipart, type FormPart } from './multipart';
import { server } from './server';
import { syncServer } from './syncServer';

/*
 * Medical card rows as the sync pull returns them (spec #128), for `syncServer.seed`: Illnesses,
 * their Temperatures, Medicine doses and Notes, and the Family's Medicines. Each gets a fresh id.
 */

let seeded = 0;
function nextId() {
  seeded += 1;
  return fixtureId('ed1c0000', seeded);
}

/** An Illness on the card of `person` (`{ memberId }` or `{ childId }`). */
export function illnessRow(
  person: { memberId: string } | { childId: string },
  name: string,
  createdAt = '2026-11-01T10:00:00Z',
) {
  return {
    id: nextId(),
    memberId: null as string | null,
    childId: null as string | null,
    ...person,
    kind: 'ILLNESS',
    name,
    description: null,
    ended: false,
    position: null,
    createdAt,
  };
}

/** A Condition («Диагноз/наблюдение») on the card of `person`, at `position` among them. */
export function conditionRow(
  person: { memberId: string } | { childId: string },
  name: string,
  position: number,
) {
  return { ...illnessRow(person, name), kind: 'CONDITION', position };
}

/** An Illness or Condition marked Ended. */
export function ended<T extends { ended: boolean }>(row: T): T {
  return { ...row, ended: true };
}

function eventRow(
  illness: { id: string },
  date: string,
  time: string | null,
  fields: {
    kind: string;
    medicineId?: string;
    amount?: string;
    temperature: number | null;
    title?: string;
  },
) {
  return {
    id: nextId(),
    illnessId: illness.id,
    date,
    time,
    medicineId: null as string | null,
    amount: null as string | null,
    title: null as string | null,
    ...fields,
    description: null as string | null,
  };
}

/** A Temperature in an Illness. */
export function temperatureRow(
  illness: { id: string },
  date: string,
  time: string | null,
  temperature: number,
) {
  return eventRow(illness, date, time, { kind: 'TEMPERATURE', temperature });
}

/** A Medicine dose in an Illness. */
export function doseRow(
  illness: { id: string },
  medicine: { id: string },
  amount: string,
  date: string,
  time: string | null,
  temperature: number | null = null,
) {
  return eventRow(illness, date, time, {
    kind: 'MEDICINE_DOSE',
    medicineId: medicine.id,
    amount,
    temperature,
  });
}

/** A Note event («Сходили к доктору») in an Illness. */
export function noteEventRow(
  illness: { id: string },
  date: string,
  time: string | null,
  title: string,
) {
  return eventRow(illness, date, time, { kind: 'NOTE', temperature: null, title });
}

/** A Medicine of the Family's list. */
export function medicineRow(name: string, deleted = false) {
  return { id: nextId(), name, deleted };
}

/** The text of a wheel's (a native select's) chosen option. */
export function selectedText(select: HTMLElement) {
  return (select as HTMLSelectElement).selectedOptions[0]?.textContent;
}

/** A Document on the card of `person`, a PDF of `size` bytes, as the pull returns it. */
export function documentRow(
  person: { memberId: string } | { childId: string },
  title: string,
  date: string,
  { contentType = 'application/pdf', size = 48_000 } = {},
) {
  return {
    id: nextId(),
    memberId: null as string | null,
    childId: null as string | null,
    ...person,
    illnessEventId: null as string | null,
    title,
    date,
    description: null as string | null,
    contentType,
    size,
  };
}

/** A file as the document endpoints keep it: its content type and bytes. */
interface StoredFile {
  contentType: string;
  bytes: Uint8Array;
}

/**
 * The document endpoints (spec #128 "Documents API"), installed for one test: `POST
 * /api/documents` keeps the file and adds the Document to `syncServer` (so the next pull brings
 * it), as the server does; `GET /api/documents/:id/file` answers the kept file, or
 * `document.file_missing`. `uploads` holds each upload's parts; `fileRequests` the ids asked for.
 * `keep(document, bytes)` gives a seeded Document its file; `failUploadsWith(status, code)` makes
 * every upload fail.
 */
export function documentsServer() {
  const files = new Map<string, StoredFile>();
  const record = {
    uploads: [] as Map<string, FormPart>[],
    fileRequests: [] as string[],
    failure: undefined as { status: number; code: string } | undefined,
    keep(document: { id: string; contentType: string }, bytes: Uint8Array) {
      files.set(document.id, { contentType: document.contentType, bytes });
    },
    failUploadsWith(status: number, code: string) {
      record.failure = { status, code };
    },
  };
  server.use(
    http.post('/api/documents', async ({ request }) => {
      const form = await readMultipart(request);
      record.uploads.push(form);
      if (record.failure !== undefined) {
        return HttpResponse.json(
          { code: record.failure.code, params: {} },
          { status: record.failure.status },
        );
      }
      const text = (name: string) => {
        const part = form.get(name);
        return typeof part === 'string' && part.trim() !== '' ? part.trim() : null;
      };
      const file = form.get('file');
      if (file === undefined || typeof file === 'string') {
        return HttpResponse.json({ code: 'validation.failed', params: {} }, { status: 400 });
      }
      // An Illness event's upload, as the server checks it: the event must be there (pushed), and
      // carry no Document but the one it `replaces`, which goes.
      const eventId = text('illnessEventId');
      if (eventId !== null) {
        if (syncServer.row('illness_event', eventId) === undefined) {
          return HttpResponse.json(
            { code: 'medical.not_found', params: { illnessEventId: eventId } },
            { status: 404 },
          );
        }
        const carried = syncServer
          .rows('document')
          .find((document) => document.illnessEventId === eventId);
        if (carried !== undefined && carried.id !== text('replaces')) {
          return HttpResponse.json(
            { code: 'document.event_has_document', params: { illnessEventId: eventId } },
            { status: 409 },
          );
        }
        if (carried !== undefined) {
          syncServer.change('document', carried.id, 'deleted');
          files.delete(carried.id);
        }
      }
      const row = {
        id: text('id') ?? '',
        memberId: text('memberId'),
        childId: text('childId'),
        illnessEventId: text('illnessEventId'),
        title: text('title'),
        date: text('date'),
        description: text('description'),
        contentType: file.type,
        size: file.bytes.length,
      };
      files.set(row.id, { contentType: file.type, bytes: file.bytes });
      syncServer.seed('document', [row]);
      return HttpResponse.json({ ...row, version: syncServer.latestVersion }, { status: 201 });
    }),
    http.get('/api/documents/:id/file', ({ params }) => {
      const id = String(params.id);
      record.fileRequests.push(id);
      const file = files.get(id);
      if (file === undefined) {
        return HttpResponse.json(
          { code: 'document.file_missing', params: { documentId: id } },
          { status: 404 },
        );
      }
      return new HttpResponse(file.bytes, { headers: { 'Content-Type': file.contentType } });
    }),
  );
  return record;
}
