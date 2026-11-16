import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useSession } from '@/features/auth';
import { childPath, useChild } from '@/features/children';
import type { Person } from './medicalTypes';

/** What a card's screens need from the route: whose card, and the way back from the card. */
export type CardRoute =
  | { status: 'ready'; person: Person; back: { to: string; title: string } }
  | { status: 'loading' | 'missing'; back: { to: string; title: string } };

/**
 * The card the route names: the Child's (`:id`, back to the Child page) or, without `:id`, the
 * Member's own (back to Home). A Child that is unknown or deleted is `missing`.
 */
export function useCardRoute(homePath: string): CardRoute {
  const { t } = useTranslation();
  const { id } = useParams();
  const { session } = useSession();
  const { load, child } = useChild(id);
  const memberId = session.member?.id;
  const childId = child?.id;
  const person = useMemo<Person | undefined>(() => {
    if (id === undefined) return memberId === undefined ? undefined : { memberId };
    return childId === undefined ? undefined : { childId };
  }, [id, memberId, childId]);

  const home = { to: homePath, title: t('app.name') };
  if (id === undefined) {
    return person === undefined
      ? { status: 'missing', back: home }
      : { status: 'ready', person, back: home };
  }
  if (person === undefined || child === undefined) {
    return { status: load.status === 'loading' ? 'loading' : 'missing', back: home };
  }
  return { status: 'ready', person, back: { to: childPath(child.id), title: child.name } };
}
