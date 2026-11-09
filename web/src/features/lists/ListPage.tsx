import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useSession } from '@/features/auth';
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
} from '@/shared/ui';
import { ItemsSection } from './ItemsSection';
import {
  hasVisibility,
  type List,
  type ListDetails,
  type Visibility,
  VISIBILITY_CHOICES,
} from './listTypes';
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
 * The List screen (`/lists/:id`): the List's name as the large title, its open Items
 * (`ItemsSection`), and List settings at the bottom. A List that disappears while open
 * (deleted, or made Private by its Owner) says so. Data only through `useLists()`.
 */
export function ListPage({ homePath }: ListPageProps) {
  const { t } = useTranslation();
  const { id } = useParams();
  const { load, save, remove } = useLists();
  const back = { to: homePath, title: t('app.name') };

  const list = load.status === 'ready' ? load.value.find((l) => l.id === id) : undefined;
  if (list !== undefined) {
    return (
      <Page title={list.name} back={back}>
        <Sections>
          <ItemsSection list={list} />
          <ListSettings key={list.id} list={list} save={save} remove={remove} homePath={homePath} />
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

interface ListSettingsProps {
  list: List;
  save: (id: string, fields: Partial<ListDetails>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  homePath: string;
}

/**
 * «Настройки списка»: «Название» for either Member, Visibility («Личный» / «Общий») only for the
 * Owner and never for a Wish list (the server enforces both), and «Удалить список», which asks
 * first and then goes back to Home.
 */
function ListSettings({ list, save, remove, homePath }: ListSettingsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useSession();
  const { id } = list;
  // Until the pull after creating it, a List has no Owner yet: only its creator has it.
  const owned = list.ownerId === undefined || list.ownerId === session.member?.id;

  const name = useAutoSaveText({
    name: 'name',
    saved: list.name,
    save: useCallback(
      async (value: string) => {
        await save(id, { name: value.trim() });
        return value.trim();
      },
      [id, save],
    ),
    required: true,
  });
  const visibility = useAutoSaveChoice<Visibility>({
    name: 'visibility',
    saved: list.visibility,
    save: useCallback(
      async (value: Visibility) => {
        await save(id, { visibility: value });
        return value;
      },
      [id, save],
    ),
  });

  const visibilities = VISIBILITY_CHOICES.map(({ value, label }) => ({ value, label: t(label) }));

  return (
    <>
      <GroupedSection
        header={t('lists.settings')}
        messages={autoSaveMessages([name.failure, visibility.failure])}
      >
        <InputRow label={t('lists.name')} autoComplete="off" {...name.input} />
        {owned && hasVisibility(list.kind) && (
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
