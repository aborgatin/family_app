import type { PageBack } from '@/shared/ui';
import type { Illness, Person } from './medicalTypes';

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

/** The Documents of an Illness's events on the Member's own card. */
export const MY_ILLNESS_DOCUMENTS_PATH = '/medical/illnesses/:illnessId/documents';
/** The Documents of an Illness's events on a Child's card. */
export const CHILD_ILLNESS_DOCUMENTS_PATH = '/children/:id/medical/illnesses/:illnessId/documents';
/** A Document of an Illness's event on the Member's own card, open full screen. */
export const MY_ILLNESS_DOCUMENT_PATH = '/medical/illnesses/:illnessId/documents/:documentId';
/** A Document of an Illness's event on a Child's card, open full screen. */
export const CHILD_ILLNESS_DOCUMENT_PATH =
  '/children/:id/medical/illnesses/:illnessId/documents/:documentId';

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

/** The Illness screen as a screen's way back: its path and name. */
export function illnessBack(person: Person, illness: Pick<Illness, 'id' | 'name'>): PageBack {
  return { to: illnessPath(person, illness.id), title: illness.name };
}

/**
 * Path of the Documents screen of the person's card, or with `illnessId` of that Illness's
 * events' Documents.
 */
export function documentsPath(person: Person, illnessId?: string): string {
  return `${illnessId === undefined ? cardPath(person) : illnessPath(person, illnessId)}/documents`;
}

/** Path of a Document open full screen, from the card's Documents or `illnessId`'s. */
export function documentPath(person: Person, documentId: string, illnessId?: string): string {
  return `${documentsPath(person, illnessId)}/${encodeURIComponent(documentId)}`;
}

/**
 * The history state of a Document opened from another screen than the Documents it is listed in
 * (an event's paperclip on the Illness screen): that screen, which it goes back to.
 */
export function documentOpenedFrom(back: PageBack): { documentBack: PageBack } {
  return { documentBack: back };
}

/** The screen a Document was opened from, if its history state names one (`documentOpenedFrom`). */
export function documentBackOf(state: unknown): PageBack | undefined {
  if (typeof state !== 'object' || state === null || !('documentBack' in state)) return undefined;
  const back: unknown = state.documentBack;
  return typeof back === 'object' &&
    back !== null &&
    'to' in back &&
    typeof back.to === 'string' &&
    'title' in back &&
    typeof back.title === 'string'
    ? { to: back.to, title: back.title }
    : undefined;
}
