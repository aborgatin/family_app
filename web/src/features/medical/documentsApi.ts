import { api } from '@/shared/api';
import type { MedicalDocument } from './medicalTypes';

/*
 * The Documents API (spec #128): not part of sync, so it needs a connection. Uploading creates the
 * Document on the server, which reaches the device through the next pull; editing and deleting go
 * through sync like any row.
 */

/** Where a Document's file is downloaded from (and the key it is kept under on the device). */
export function documentFileUrl(id: string): string {
  return `/api/documents/${encodeURIComponent(id)}/file`;
}

/** Uploads a new Document: `POST /api/documents` (multipart). A retry with the same id is safe. */
export function uploadDocument(form: FormData): Promise<MedicalDocument> {
  return api.postForm<MedicalDocument>('/api/documents', form);
}

/** Downloads a Document's file: the whole response, to keep on the device. */
export function downloadDocumentFile(id: string): Promise<Response> {
  return api.file(documentFileUrl(id));
}
