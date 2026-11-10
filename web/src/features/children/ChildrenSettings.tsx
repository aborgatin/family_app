import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { childColor } from '@/shared/palette';
import {
  EditableRow,
  GroupedSection,
  ListRow,
  LoadingRow,
  Swatch,
  useEditableList,
  useFooterLines,
} from '@/shared/ui';
import { childSettingsPath } from './ChildSettingsPage';
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
  const lines = useFooterLines();
  const { load, save, remove } = useChildren();
  const age = useAge();
  const list = useEditableList();
  // The id of the Child being added, made once when the sheet opens, so a retried save repeats
  // the same idempotent PUT instead of creating a second Child (S3).
  const [addingId, setAddingId] = useState<string>();

  const children = load.status === 'ready' ? load.value : [];

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
        {...(children.length > 0 && { edit: list.edit })}
        messages={[
          lines.failure(list.error),
          load.status === 'ready' && children.length === 0 && { text: t('children.empty') },
        ]}
        after={
          load.status === 'loading' ? (
            <LoadingRow />
          ) : (
            <ListRow
              accent
              title={t('children.add')}
              onClick={() => {
                setAddingId(newChildId());
              }}
            />
          )
        }
      >
        {children.map((child) => (
          <EditableRow
            key={child.id}
            to={childSettingsPath(child.id)}
            leading={<Swatch color={childColor(child.color)?.hex ?? 'transparent'} />}
            title={child.name}
            value={child.birthday === null ? undefined : age(child.birthday)}
            busy={list.deleting === child.id}
            confirm={{
              title: t('children.confirmDelete', { name: child.name }),
              message: t('children.deleteTakesAll'),
            }}
            onDelete={() => {
              void list.remove(child.id, children.length === 1, () => remove(child.id));
            }}
          />
        ))}
      </GroupedSection>
    </>
  );
}
