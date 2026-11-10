import { useTranslation } from 'react-i18next';
import { childPath, useChildren } from '@/features/children';
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
  const { load } = useChildren();
  const childId = list?.childId ?? undefined;
  if (childId === undefined) {
    return { to: homePath, title: t('app.name') };
  }
  const child = load.status === 'ready' ? load.value.find((c) => c.id === childId) : undefined;
  return { to: childPath(childId), title: child?.name ?? t('children.title') };
}
