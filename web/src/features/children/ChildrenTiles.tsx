import { useTranslation } from 'react-i18next';
import { childColor } from '@/shared/palette';
import { Tile, TileGrid } from '@/shared/ui';
import { useAge } from './age';
import { childPath } from './ChildPage';
import { useChildren } from './useChildren';

/**
 * «Дети» on Home: a tile per Child in the Children order (oldest first), filled with the Child
 * color, with the name and under it the age (the name only without a birthday), opening the Child
 * page. Nothing at all while there are no Children. Data only through `useChildren()`.
 */
export function ChildrenTiles() {
  const { t } = useTranslation();
  const { load } = useChildren();
  const age = useAge();

  if (load.status !== 'ready' || load.value.length === 0) return null;
  return (
    <TileGrid header={t('children.title')}>
      {load.value.map((child) => (
        <Tile
          key={child.id}
          to={childPath(child.id)}
          title={child.name}
          subtitle={child.birthday === null ? undefined : age(child.birthday)}
          color={childColor(child.color)?.hex}
        />
      ))}
    </TileGrid>
  );
}
