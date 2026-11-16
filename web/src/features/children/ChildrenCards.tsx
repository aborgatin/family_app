import { useTranslation } from 'react-i18next';
import { Card, CardGrid } from '@/shared/ui';
import { useAge } from './age';
import { ChildPicture } from './ChildPicture';
import { childPath } from './ChildPage';
import { useChildren } from './useChildren';

/**
 * «Дети» on Home: a card per Child in the Children order (oldest first), with their Child avatar
 * (or initial) in their Child color, the name and under it the age (the name only without a
 * birthday), opening the Child page. Nothing at all while there are no Children. Data only through
 * `useChildren()`.
 */
export function ChildrenCards() {
  const { t } = useTranslation();
  const { load } = useChildren();
  const age = useAge();

  if (load.status !== 'ready' || load.value.length === 0) return null;
  return (
    <CardGrid header={t('children.title')}>
      {load.value.map((child) => (
        <Card
          key={child.id}
          to={childPath(child.id)}
          title={child.name}
          subtitle={child.birthday === null ? undefined : age(child.birthday)}
          leading={
            <ChildPicture name={child.name} color={child.color} avatar={child.avatar} size="card" />
          }
        />
      ))}
    </CardGrid>
  );
}
