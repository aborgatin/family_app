import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/shared/api';
import { ChildForm } from './ChildForm';
import type { Child, ChildDetails } from './childrenApi';
import { ColorSwatch, useChildColorName } from './ColorSwatch';
import { newChildId, useChildren } from './useChildren';

/**
 * The Children section of Settings, «Дети»: the list of Children, adding one, and editing or
 * removing each. All data access goes through `useChildren()`.
 */
export function ChildrenSettings() {
  const { t } = useTranslation();
  const { load, retry, save } = useChildren();
  // The id of the Child being added, generated once when the form opens, so a retried save
  // repeats the same idempotent PUT instead of creating a second Child (S3).
  const [addingId, setAddingId] = useState<string>();

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

  async function add(id: string, details: ChildDetails) {
    await save(id, details);
    setAddingId(undefined);
  }

  return (
    <>
      {load.children.length === 0 ? (
        <p>{t('children.empty')}</p>
      ) : (
        <ul aria-label={t('settings.children')}>
          {load.children.map((child) => (
            <ChildRow key={child.id} child={child} />
          ))}
        </ul>
      )}
      {addingId === undefined ? (
        <button
          type="button"
          onClick={() => {
            setAddingId(newChildId());
          }}
        >
          {t('children.add')}
        </button>
      ) : (
        <ChildForm
          title={t('children.form.addTitle')}
          onSave={(details) => add(addingId, details)}
          onCancel={() => {
            setAddingId(undefined);
          }}
        />
      )}
    </>
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
