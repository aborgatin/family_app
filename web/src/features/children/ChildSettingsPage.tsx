import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import {
  autoSaveMessages,
  ConfirmRow,
  EmptyState,
  GroupedSection,
  Page,
  Sections,
  useAutoSaveChoice,
  useAutoSaveText,
  useFooterLines,
} from '@/shared/ui';
import { ChildRows } from './ChildRows';
import type { Child, ChildDetails } from './childTypes';
import { useChildren } from './useChildren';

/** Route of a Child's settings screen, opened from «Дети» in Settings. */
export const CHILD_SETTINGS_PATH = '/settings/children/:id';

/** Path of the settings screen of the Child with this id. */
export function childSettingsPath(id: string): string {
  return CHILD_SETTINGS_PATH.replace(':id', encodeURIComponent(id));
}

interface ChildSettingsPageProps {
  /** Path of Settings, where the screen goes back to. */
  settingsPath: string;
}

/**
 * A Child's settings screen (`/settings/children/:id`; not the Child page, `ChildPage`): Имя, Цвет and День рождения, each saved by itself
 * (auto-save), and «Удалить ребёнка», which asks first and then goes back to Settings. Data only
 * through `useChildren()`.
 */
export function ChildSettingsPage({ settingsPath }: ChildSettingsPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load, save, remove } = useChildren();
  const back = { to: settingsPath, title: t('settings.title') };

  const child = load.status === 'ready' ? load.value.find((c) => c.id === id) : undefined;
  if (child !== undefined) {
    return (
      <Page title={child.name} back={back}>
        <ChildEditor
          key={child.id}
          child={child}
          save={save}
          remove={remove}
          settingsPath={settingsPath}
        />
      </Page>
    );
  }

  let state;
  if (load.status === 'loading') {
    state = <EmptyState role="status">{t('common.loading')}</EmptyState>;
  } else {
    state = <EmptyState role="alert">{t('children.notFound')}</EmptyState>;
  }
  return (
    <Page title={t('settings.children')} back={back}>
      {state}
    </Page>
  );
}

interface ChildEditorProps {
  child: Child;
  save: (id: string, fields: Partial<ChildDetails>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  settingsPath: string;
}

function ChildEditor({ child, save, remove, settingsPath }: ChildEditorProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const navigate = useNavigate();
  const { id } = child;

  const name = useAutoSaveText({
    name: 'name',
    saved: child.name,
    save: useCallback(
      async (value: string) => {
        await save(id, { name: value });
        return value;
      },
      [id, save],
    ),
    required: true,
  });
  const color = useAutoSaveChoice({
    name: 'color',
    saved: child.color,
    save: useCallback(
      async (value: string) => {
        await save(id, { color: value });
        return value;
      },
      [id, save],
    ),
  });
  const birthday = useAutoSaveText({
    name: 'birthday',
    saved: child.birthday ?? '',
    save: useCallback(
      async (value: string) => {
        await save(id, { birthday: value === '' ? null : value });
        return value;
      },
      [id, save],
    ),
  });

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ErrorMessage>();

  async function deleteChild() {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await remove(id);
      await navigate(settingsPath, { replace: true });
    } catch (failure: unknown) {
      setDeleting(false);
      setDeleteError(errorMessage(asApiError(failure)));
    }
  }

  return (
    <Sections>
      <GroupedSection messages={autoSaveMessages([name.failure, color.failure, birthday.failure])}>
        <ChildRows name={name.input} color={color.control} birthday={birthday.input} />
      </GroupedSection>
      <GroupedSection messages={[lines.failure(deleteError)]}>
        <ConfirmRow
          title={t('children.delete')}
          busy={deleting}
          disabled={deleting}
          confirm={{
            title: t('children.confirmDelete', { name: child.name }),
            action: t('ui.delete'),
          }}
          onConfirm={() => {
            void deleteChild();
          }}
        />
      </GroupedSection>
    </Sections>
  );
}
