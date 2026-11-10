import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ChildProfileSection } from '@/features/child-fields';
import { EmptyState, Link, ListRow, Page, Sections } from '@/shared/ui';
import { useAge } from './age';
import { childSettingsPath } from './ChildSettingsPage';
import type { Child } from './childTypes';
import { useChildren } from './useChildren';

/** Route of the Child page, opened from a tile of «Дети» on Home. */
export const CHILD_PATH = '/children/:id';

/** Path of the Child page of the Child with this id. */
export function childPath(id: string): string {
  return CHILD_PATH.replace(':id', encodeURIComponent(id));
}

interface ChildPageProps {
  /** Path of Home, where the page goes back to. */
  homePath: string;
}

/**
 * The Child page (`/children/:id`): the one place for everything about a Child, titled with the
 * Child's name, back to Home. «Изменить» opens the Child's screen in Settings (name, colour,
 * birthday); «Профиль» shows the birthday with the age, read-only, then the Child's value for
 * every Child field, edited in place (`ChildProfileSection`). A Child that is unknown, or is
 * deleted while the page is open, shows «Такого ребёнка нет». Data only through `useChildren()`.
 */
export function ChildPage({ homePath }: ChildPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load } = useChildren();
  const back = { to: homePath, title: t('app.name') };

  const child = load.status === 'ready' ? load.value.find((c) => c.id === id) : undefined;
  if (child !== undefined) {
    return (
      <Page
        title={child.name}
        back={back}
        actions={<Link to={childSettingsPath(child.id)}>{t('ui.edit')}</Link>}
      >
        <Sections>
          <ProfileSection child={child} />
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
    const [year = 0, month = 1, day = 1] = child.birthday.split('-').map(Number);
    // The date as written, whatever the device's time zone.
    const date = DATE.format(new Date(year, month - 1, day));
    const years = age(child.birthday);
    birthday = years === undefined ? date : t('children.birthdayWithAge', { date, age: years });
  }

  return (
    <ChildProfileSection childId={child.id}>
      <ListRow title={t('children.birthday')} value={birthday} />
    </ChildProfileSection>
  );
}
