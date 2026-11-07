import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/shared/api';
import { ColorSwatch, useChildColorName } from './ColorSwatch';
import type { Child } from './childrenApi';
import { useChildren } from './useChildren';

/** The Children section of Settings, «Дети»: the list of Children. */
export function ChildrenSettings() {
  const { t } = useTranslation();
  const { load, retry } = useChildren();

  if (load.status === 'loading') {
    return <p role="status">{t('common.loading')}</p>;
  }
  if (load.status === 'failed') {
    const message = errorMessage(load.error);
    return (
      <>
        <p role="alert">{t(message.key, message.values)}</p>
        <button type="button" onClick={retry}>
          {t('common.retry')}
        </button>
      </>
    );
  }
  if (load.children.length === 0) {
    return <p>{t('children.empty')}</p>;
  }
  return (
    <ul aria-label={t('settings.children')}>
      {load.children.map((child) => (
        <ChildRow key={child.id} child={child} />
      ))}
    </ul>
  );
}

function ChildRow({ child }: { child: Child }) {
  const colorName = useChildColorName();
  return (
    <li>
      <ColorSwatch code={child.color} /> <span>{child.name}</span>{' '}
      <span>{colorName(child.color)}</span>
      {child.birthday !== null && (
        <>
          {' '}
          <span>{formatBirthday(child.birthday)}</span>
        </>
      )}
    </li>
  );
}

const BIRTHDAY_FORMAT = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `2019-04-12` → «12 апреля 2019 г.» */
function formatBirthday(birthday: string): string {
  return BIRTHDAY_FORMAT.format(new Date(`${birthday}T00:00:00Z`));
}
