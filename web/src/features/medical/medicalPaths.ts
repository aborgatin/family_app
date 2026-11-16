import type { Person } from './medicalTypes';

/** The Member's own Medical card, from the «Медкарта» row on Home. */
export const MY_CARD_PATH = '/medical';
/** A Child's Medical card, from the «Медкарта» row on the Child page. */
export const CHILD_CARD_PATH = '/children/:id/medical';
/** An Illness on the Member's own card. */
export const MY_ILLNESS_PATH = '/medical/illnesses/:illnessId';
/** An Illness on a Child's card. */
export const CHILD_ILLNESS_PATH = '/children/:id/medical/illnesses/:illnessId';

/** The Documents of the Member's own card. */
export const MY_DOCUMENTS_PATH = '/medical/documents';
/** The Documents of a Child's card. */
export const CHILD_DOCUMENTS_PATH = '/children/:id/medical/documents';
/** A Document of the Member's own card, open full screen. */
export const MY_DOCUMENT_PATH = '/medical/documents/:documentId';
/** A Document of a Child's card, open full screen. */
export const CHILD_DOCUMENT_PATH = '/children/:id/medical/documents/:documentId';

/** Path of the person's Medical card. */
export function cardPath(person: Person): string {
  return person.childId === undefined
    ? MY_CARD_PATH
    : CHILD_CARD_PATH.replace(':id', encodeURIComponent(person.childId));
}

/** Path of an Illness on the person's card. */
export function illnessPath(person: Person, illnessId: string): string {
  return `${cardPath(person)}/illnesses/${encodeURIComponent(illnessId)}`;
}

/** Path of the Documents screen of the person's card. */
export function documentsPath(person: Person): string {
  return `${cardPath(person)}/documents`;
}

/** Path of a Document of the person's card, open full screen. */
export function documentPath(person: Person, documentId: string): string {
  return `${documentsPath(person)}/${encodeURIComponent(documentId)}`;
}
