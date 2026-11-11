import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ChildProfileSection } from '@/features/child-fields';
import { localDay } from '@/shared/dates';
import { EmptyState, Link, ListRow, Page, Sections } from '@/shared/ui';
import { useAge } from './age';
import { childSettingsPath } from './ChildSettingsPage';
import type { Child } from './childTypes';
import { useChild } from './useChildren';

/** Route of the Child page, opened from a tile of «Дети» on Home. */
export const CHILD_PATH = '/children/:id';

/** Path of the Child page of the Child with this id. */
export function childPath(id: string): string {
  return CHILD_PATH.replace(':id', encodeURIComponent(id));
}

interface ChildPageProps {
  /** Path of Home, where the page goes back to. */
  homePath: string;
  /**
   * «Списки»: the Child lists of the Child with this id. Passed in by the routes, since the
   * `lists` feature already imports this one (a Child list's screen goes back to the Child page).
   */
  lists: ComponentType<{ childId: string }>;
}

/**
 * The Child page (`/children/:id`): the one place for everything about a Child, titled with the
 * Child's name, back to Home. «Изменить» opens the Child's screen in Settings (name, colour,
 * birthday); «Профиль» shows the birthday with the age, read-only, then the Child's value for
 * every Child field, edited in place (`ChildProfileSection`); «Списки» has the Child lists. A
 * Child that is unknown, or is deleted while the page is open, shows «Такого ребёнка нет». Data
 * only through `useChild(id)`.
 */
export function ChildPage({ homePath, lists: ChildLists }: ChildPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load, child } = useChild(id);
  const back = { to: homePath, title: t('app.name') };

  if (child !== undefined) {
    return (
      <Page
        title={child.name}
        back={back}
        actions={<Link to={childSettingsPath(child.id)}>{t('ui.edit')}</Link>}
      >
        <Sections>
          <ProfileSection child={child} />
          <ChildLists childId={child.id} />
        </Sections>
      </Page>
    );
  }
  return (
    <Page title={t('children.title')} back={back}>
      {load.status === 'loading' ? (
        <EmptyState role="status">{t('common.loading')}</EmptyState>
      ) : (
        <EmptyState role="alert">{t('children.notFound')}</EmptyState>
      )}
    </Page>
  );
}

/** Dates read the Russian way: «12.04.2019». */
const DATE = new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** «Профиль»: the Child profile, starting with the birthday and the age, read-only. */
function ProfileSection({ child }: { child: Child }) {
  const { t } = useTranslation();
  const age = useAge();

  let birthday = t('children.birthdayMissing');
  if (child.birthday !== null) {
    const date = DATE.format(localDay(child.birthday));
    const years = age(child.birthday);
    birthday = years === undefined ? date : t('children.birthdayWithAge', { date, age: years });
  }

  return (
    <ChildProfileSection childId={child.id}>
      <ListRow title={t('children.birthday')} value={birthday} />
    </ChildProfileSection>
  );
}
