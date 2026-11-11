import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSession } from '@/features/auth';
import {
  autoSaveMessages,
  ConfirmRow,
  GroupedSection,
  InputRow,
  ListRow,
  Page,
  SegmentedControl,
  Sections,
  useAutoSaveChoice,
  useAutoSaveText,
} from '@/shared/ui';
import { ListMissing, useRouteList } from './ListMissing';
import { listCategoriesPath, listPath } from './listPaths';
import {
  hasVisibility,
  type List,
  type ListDetails,
  type Visibility,
  VISIBILITY_CHOICES,
} from './listTypes';
import { useListHome } from './useListHome';
import { useLists } from './useLists';

interface ListSettingsPageProps {
  /** Path of Home, where the screen goes after deleting the List, or when the List is gone. */
  homePath: string;
}

/**
 * «Настройки списка» (`/lists/:id/settings`), back to the List: «Название» for either Member,
 * Visibility («Личный» / «Общий») only for the Owner and never for a Wish list or a Child list
 * (the server enforces all three), and «Удалить список», only for the Owner (the server enforces
 * it), which asks first and then goes back to Home, or to the Child page for a Child list
 * (`useListHome`). A List that disappears while open says so. Data only through `useLists()`.
 */
export function ListSettingsPage({ homePath }: ListSettingsPageProps) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { load, save, remove } = useLists();
  const list = useRouteList(load);

  if (list === undefined) {
    return <ListMissing load={load} homePath={homePath} />;
  }
  // Until the pull after creating it, a List has no Owner yet: only its creator has it.
  const owned = list.ownerId === undefined || list.ownerId === session.member?.id;
  return (
    <Page title={t('lists.settings')} back={{ to: listPath(list.id), title: list.name }}>
      <Sections>
        <ListDetailsSection key={list.id} list={list} owned={owned} save={save} />
        {list.kind === 'SHOPPING' && (
          <GroupedSection>
            <ListRow title={t('lists.categories')} to={listCategoriesPath(list.id)} />
          </GroupedSection>
        )}
        {owned && <DeleteListSection list={list} remove={remove} homePath={homePath} />}
      </Sections>
    </Page>
  );
}

interface ListDetailsSectionProps {
  list: List;
  /** Whether the Member is the List's Owner, who alone may change its Visibility or delete it. */
  owned: boolean;
  save: (id: string, fields: Partial<ListDetails>) => Promise<void>;
}

/**
 * «Название», auto-saved, and the Owner's Visibility segments (none for a Wish list or a Child
 * list: both are always Shared).
 */
function ListDetailsSection({ list, owned, save }: ListDetailsSectionProps) {
  const { t } = useTranslation();
  const { id } = list;

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
    <GroupedSection messages={autoSaveMessages([name.failure, visibility.failure])}>
      <InputRow label={t('lists.name')} autoComplete="off" {...name.input} />
      {owned && hasVisibility(list.kind) && list.childId == null && (
        <SegmentedControl
          label={t('lists.visibility.label')}
          options={visibilities}
          {...visibility.control}
        />
      )}
    </GroupedSection>
  );
}

interface DeleteListSectionProps {
  list: List;
  remove: (id: string) => Promise<void>;
  homePath: string;
}

/**
 * «Удалить список»: asks «Удалить „…“ со всем содержимым?», deletes, and goes back to Home (to
 * the Child page for a Child list).
 */
function DeleteListSection({ list, remove, homePath }: DeleteListSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const home = useListHome(list, homePath);
  return (
    <GroupedSection>
      <ConfirmRow
        title={t('lists.delete')}
        confirm={{
          title: t('lists.confirmDelete', { name: list.name }),
          action: t('ui.delete'),
        }}
        onConfirm={() => {
          // Leave first: the List is gone from the local store as soon as it is deleted.
          void navigate(home.to, { replace: true });
          void remove(list.id);
        }}
      />
    </GroupedSection>
  );
}
