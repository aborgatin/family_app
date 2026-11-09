import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import {
  autoSaveMessages,
  Button,
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
import type { Child, ChildDetails } from './childrenApi';
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
 * A Child's settings screen (`/settings/children/:id`; not the Child page of M3): Имя, Цвет and День рождения, each saved by itself
 * (auto-save), and «Удалить ребёнка», which asks first and then goes back to Settings. Data only
 * through `useChildren()`.
 */
export function ChildSettingsPage({ settingsPath }: ChildSettingsPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load, retry, save, remove, saveFailure } = useChildren();
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
          saveFailure={saveFailure}
          settingsPath={settingsPath}
        />
      </Page>
    );
  }

  let state;
  if (load.status === 'loading') {
    state = <EmptyState role="status">{t('common.loading')}</EmptyState>;
  } else if (load.status === 'failed') {
    const message = errorMessage(load.error);
    state = (
      <EmptyState role="alert" action={<Button onClick={retry}>{t('common.retry')}</Button>}>
        {t(message.key, message.values)}
      </EmptyState>
    );
  } else {
    state = <EmptyState role="alert">{t('children.notFound')}</EmptyState>;
  }
  return (
    <Page title={t('settings.children')} back={back}>
      {state}
    </Page>
  );
}

function detailsOf({ name, color, birthday }: Child): ChildDetails {
  return { name, color, birthday };
}

interface ChildEditorProps {
  child: Child;
  save: (id: string, details: ChildDetails) => Promise<Child>;
  remove: (id: string) => Promise<void>;
  /** «Не удалось сохранить» after the server rejected a change. */
  saveFailure: ErrorMessage | undefined;
  settingsPath: string;
}

function ChildEditor({ child, save, remove, saveFailure, settingsPath }: ChildEditorProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const navigate = useNavigate();
  const { id } = child;

  // Each row sends its change on top of the Child as shown now; `save` sends only what differs.
  const shown = useRef(detailsOf(child));
  useEffect(() => {
    shown.current = detailsOf(child);
  }, [child]);
  const saveChange = useCallback(
    (change: Partial<ChildDetails>) => save(id, { ...shown.current, ...change }),
    [id, save],
  );

  const name = useAutoSaveText({
    name: 'name',
    saved: child.name,
    save: useCallback(
      async (value: string) => (await saveChange({ name: value })).name,
      [saveChange],
    ),
    required: true,
  });
  const color = useAutoSaveChoice({
    name: 'color',
    saved: child.color,
    save: useCallback(
      async (value: string) => (await saveChange({ color: value })).color,
      [saveChange],
    ),
  });
  const birthday = useAutoSaveText({
    name: 'birthday',
    saved: child.birthday ?? '',
    save: useCallback(
      async (value: string) =>
        (await saveChange({ birthday: value === '' ? null : value })).birthday ?? '',
      [saveChange],
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
      <GroupedSection
        messages={[
          ...autoSaveMessages([name.failure, color.failure, birthday.failure]),
          lines.failure(saveFailure),
        ]}
      >
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
