import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useSession } from '@/features/auth';
import type { ErrorMessage } from '@/shared/api';
import {
  autoSaveMessages,
  ConfirmRow,
  EmptyState,
  GroupedSection,
  InputRow,
  Page,
  SegmentedControl,
  Sections,
  useAutoSaveChoice,
  useAutoSaveText,
  useFooterLines,
} from '@/shared/ui';
import { KIND_TEXTS, type List, type ListDetails, type Visibility } from './listTypes';
import { useLists } from './useLists';

/** Route of the List screen, opened from «Списки» on Home. */
export const LIST_PATH = '/lists/:id';

/** Path of the screen of the List with this id. */
export function listPath(id: string): string {
  return LIST_PATH.replace(':id', encodeURIComponent(id));
}

interface ListPageProps {
  /** Path of Home, where the screen goes back to. */
  homePath: string;
}

/**
 * The List screen (`/lists/:id`): the List's name as the large title, the Items (ticket #57; until
 * then the kind's empty state), and List settings at the bottom. A List that disappears while open
 * (deleted, or made Private by its Owner) says so. Data only through `useLists()`.
 */
export function ListPage({ homePath }: ListPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load, save, remove, saveFailure } = useLists();
  const back = { to: homePath, title: t('app.name') };

  const list = load.status === 'ready' ? load.value.find((l) => l.id === id) : undefined;
  if (list !== undefined) {
    return (
      <Page title={list.name} back={back}>
        <Sections>
          <EmptyState>{t(KIND_TEXTS[list.kind].noItems)}</EmptyState>
          <ListSettings
            key={list.id}
            list={list}
            save={save}
            remove={remove}
            saveFailure={saveFailure}
            homePath={homePath}
          />
        </Sections>
      </Page>
    );
  }

  return (
    <Page title={t('lists.title')} back={back}>
      {load.status === 'loading' ? (
        <EmptyState role="status">{t('common.loading')}</EmptyState>
      ) : (
        <EmptyState role="alert">{t('lists.notFound')}</EmptyState>
      )}
    </Page>
  );
}

function detailsOf({ name, kind, visibility }: List): ListDetails {
  return { name, kind, visibility };
}

interface ListSettingsProps {
  list: List;
  save: (id: string, details: ListDetails) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** «Не удалось сохранить» after the server rejected a change. */
  saveFailure: ErrorMessage | undefined;
  homePath: string;
}

/**
 * «Настройки списка»: «Название» for either Member, Visibility («Личный» / «Общий») only for the
 * Owner and never for a Wish list (the server enforces both), and «Удалить список», which asks
 * first and then goes back to Home.
 */
function ListSettings({ list, save, remove, saveFailure, homePath }: ListSettingsProps) {
  const { t } = useTranslation();
  const lines = useFooterLines();
  const navigate = useNavigate();
  const { session } = useSession();
  const { id } = list;
  // Until the pull after creating it, a List has no Owner yet: only its creator has it.
  const owned = list.ownerId === undefined || list.ownerId === session.member?.id;

  // Each row sends its change on top of the List as shown now; `save` sends only what differs.
  const shown = useRef(detailsOf(list));
  useEffect(() => {
    shown.current = detailsOf(list);
  }, [list]);
  const saveChange = useCallback(
    (change: Partial<ListDetails>) => save(id, { ...shown.current, ...change }),
    [id, save],
  );

  const name = useAutoSaveText({
    name: 'name',
    saved: list.name,
    save: useCallback(
      async (value: string) => {
        await saveChange({ name: value.trim() });
        return value.trim();
      },
      [saveChange],
    ),
    required: true,
  });
  const visibility = useAutoSaveChoice<Visibility>({
    name: 'visibility',
    saved: list.visibility,
    save: useCallback(
      async (value: Visibility) => {
        await saveChange({ visibility: value });
        return value;
      },
      [saveChange],
    ),
  });

  const visibilities = [
    { value: 'PRIVATE' as const, label: t('lists.visibility.private') },
    { value: 'SHARED' as const, label: t('lists.visibility.shared') },
  ];

  return (
    <>
      <GroupedSection
        header={t('lists.settings')}
        messages={[
          ...autoSaveMessages([name.failure, visibility.failure]),
          lines.failure(saveFailure),
        ]}
      >
        <InputRow label={t('lists.name')} autoComplete="off" {...name.input} />
        {owned && list.kind !== 'WISH' && (
          <SegmentedControl
            label={t('lists.visibility.label')}
            options={visibilities}
            {...visibility.control}
          />
        )}
      </GroupedSection>
      <GroupedSection>
        <ConfirmRow
          title={t('lists.delete')}
          confirm={{
            title: t('lists.confirmDelete', { name: list.name }),
            action: t('ui.delete'),
          }}
          onConfirm={() => {
            // Leave first: the List is gone from the local store as soon as it is deleted.
            void navigate(homePath, { replace: true });
            void remove(id);
          }}
        />
      </GroupedSection>
    </>
  );
}
