import { useTranslation } from 'react-i18next';
import { childPath, useChild } from '@/features/children';
import type { List } from './listTypes';

/**
 * Where a List lives, which is where its screen goes back to and where the app goes once the List
 * is deleted: the Child page for a Child list (titled with the Child's name), Home for every
 * other List (and while the List isn't there).
 */
export function useListHome(
  list: List | undefined,
  homePath: string,
): { to: string; title: string } {
  const { t } = useTranslation();
  const childId = list?.childId ?? undefined;
  const { child } = useChild(childId);
  if (childId === undefined) {
    return { to: homePath, title: t('app.name') };
  }
  return { to: childPath(childId), title: child?.name ?? t('children.title') };
}
