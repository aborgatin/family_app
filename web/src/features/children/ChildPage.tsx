import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import {
  ActionSheet,
  autoSaveMessages,
  Button,
  EmptyState,
  GroupedSection,
  ListRow,
  Page,
  Sections,
  useAutoSaveChoice,
  useAutoSaveText,
} from '@/shared/ui';
import { ChildRows } from './ChildRows';
import type { Child, ChildDetails } from './childrenApi';
import { useChildren } from './useChildren';

/** Route of a Child's screen, opened from «Дети» in Settings. */
export const CHILD_PATH = '/settings/children/:id';

/** Path of the screen of the Child with this id. */
export function childPath(id: string): string {
  return CHILD_PATH.replace(':id', encodeURIComponent(id));
}

interface ChildPageProps {
  /** Path of Settings, where the screen goes back to. */
  settingsPath: string;
}

/**
 * A Child's screen (`/settings/children/:id`): Имя, Цвет and День рождения, each saved by itself
 * (auto-save), and «Удалить ребёнка», which asks first and then goes back to Settings. Data only
 * through `useChildren()`.
 */
export function ChildPage({ settingsPath }: ChildPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load, retry, save, remove } = useChildren();
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
  settingsPath: string;
}

function ChildEditor({ child, save, remove, settingsPath }: ChildEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = child;

  // PUT replaces the whole Child: each row sends its change on top of what was saved last.
  const latest = useRef(detailsOf(child));
  const saveChange = useCallback(
    async (change: Partial<ChildDetails>) => {
      const saved = await save(id, { ...latest.current, ...change });
      latest.current = detailsOf(saved);
      return saved;
    },
    [id, save],
  );

  const name = useAutoSaveText({
    name: 'name',
    saved: child.name,
    save: useCallback(
      async (value: string) => (await saveChange({ name: value })).name,
      [saveChange],
    ),
    validate: useCallback(
      (value: string) => (value.trim() === '' ? t('errors.field.required') : undefined),
      [t],
    ),
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

  const [asking, setAsking] = useState(false);
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
      <GroupedSection
        messages={[
          deleteError !== undefined && {
            text: t(deleteError.key, deleteError.values),
            tone: 'error',
          },
        ]}
      >
        <ListRow
          destructive
          title={t('children.delete')}
          busy={deleting}
          disabled={deleting}
          onClick={() => {
            setAsking(true);
          }}
        />
        <ActionSheet
          open={asking}
          onOpenChange={setAsking}
          title={t('children.confirmDelete', { name: child.name })}
          actions={[
            {
              label: t('ui.delete'),
              destructive: true,
              onSelect: () => {
                void deleteChild();
              },
            },
          ]}
        />
      </GroupedSection>
    </Sections>
  );
}
