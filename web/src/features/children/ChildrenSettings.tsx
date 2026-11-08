import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asApiError, errorMessage, type ErrorMessage } from '@/shared/api';
import { childColor } from '@/shared/palette';
import { EditableRow, GroupedSection, ListRow, Swatch, type SectionMessage } from '@/shared/ui';
import { childPath } from './ChildPage';
import type { Child } from './childrenApi';
import { useAge } from './age';
import { NewChildSheet } from './NewChildSheet';
import { newChildId, useChildren } from './useChildren';

/**
 * «Дети» in Settings: a row per Child (colour, name, age, chevron) opening the Child's screen;
 * «Добавить ребёнка» opens the «Новый ребёнок» sheet. Edit mode, a swipe or right-click delete,
 * always after the action sheet; Children have no order to change. All data access goes through
 * `useChildren()`, so M2 can move it onto the local store + Outbox without touching this component.
 */
export function ChildrenSettings() {
  const { t } = useTranslation();
  const { load, retry, save, remove } = useChildren();
  const age = useAge();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [error, setError] = useState<ErrorMessage>();
  // The id of the Child being added, made once when the sheet opens, so a retried save repeats
  // the same idempotent PUT instead of creating a second Child (S3).
  const [addingId, setAddingId] = useState<string>();

  async function deleteChild(child: Child, last: boolean) {
    setDeleting(child.id);
    setError(undefined);
    try {
      await remove(child.id);
      if (last) setEditing(false);
    } catch (failure: unknown) {
      setError(errorMessage(asApiError(failure)));
    } finally {
      setDeleting(undefined);
    }
  }

  const children = load.status === 'ready' ? load.value : [];
  const messages: SectionMessage[] = [];
  if (load.status === 'failed') {
    const message = errorMessage(load.error);
    messages.push({
      text: t(message.key, message.values),
      tone: 'error',
      action: { label: t('common.retry'), onClick: retry },
    });
  }
  if (error !== undefined) messages.push({ text: t(error.key, error.values), tone: 'error' });
  if (load.status === 'ready' && children.length === 0)
    messages.push({ text: t('children.empty') });

  return (
    <>
      {addingId !== undefined && (
        <NewChildSheet
          key={addingId}
          id={addingId}
          save={save}
          onClose={() => {
            setAddingId(undefined);
          }}
        />
      )}
      <GroupedSection
        header={t('settings.children')}
        {...(children.length > 0 && { edit: { editing, onEditingChange: setEditing } })}
        messages={messages}
        after={
          load.status === 'loading' ? (
            <ListRow title={<span role="status">{t('common.loading')}</span>} />
          ) : (
            load.status === 'ready' && (
              <ListRow
                accent
                title={t('children.add')}
                onClick={() => {
                  setAddingId(newChildId());
                }}
              />
            )
          )
        }
      >
        {children.map((child) => (
          <EditableRow
            key={child.id}
            to={childPath(child.id)}
            leading={<Swatch color={childColor(child.color)?.hex ?? 'transparent'} />}
            title={child.name}
            value={child.birthday === null ? undefined : age(child.birthday)}
            busy={deleting === child.id}
            confirm={{ title: t('children.confirmDelete', { name: child.name }) }}
            onDelete={() => {
              void deleteChild(child, children.length === 1);
            }}
          />
        ))}
      </GroupedSection>
    </>
  );
}
