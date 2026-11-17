import { useCallback } from 'react';
import { useSyncedRows, type LocalLoad } from '@/shared/sync';
import { positionAfterMove } from '@/shared/ui';
import type { ChildField, ValueType } from './childFieldTypes';

export type ChildFieldsLoad = LocalLoad<ChildField>;

/** Display order: by position, ties broken by id. */
function inOrder(fields: ChildField[]): ChildField[] {
  return [...fields].sort((a, b) =>
    a.position === b.position ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.position - b.position,
  );
}

/** A new Child field's id, made on the device (S3) once when its sheet opens. */
export function newChildFieldId(): string {
  return crypto.randomUUID();
}

/**
 * The Family's Child fields and every change to them: the only data access of this feature. It
 * reads the local store and writes through the Outbox (S4), so it works the same offline; the sync
 * engine sends the changes and pulls the other Member's. Each write sends only what it changes
 * (Last write wins per field): a rename the name, a move the position.
 */
export function useChildFields() {
  const { load, save, remove: removeRow } = useSyncedRows<ChildField>('child_field', inOrder);
  const fields = load.status === 'ready' ? load.value : [];

  /** Adds a field at the end, with an id from `newChildFieldId()`. */
  async function add(id: string, name: string, valueType: ValueType): Promise<ChildField> {
    const last = fields.at(-1);
    const field = { id, name, valueType, position: last === undefined ? 1 : last.position + 1 };
    await save(id, { name, valueType, position: field.position });
    return field;
  }

  const rename = useCallback(
    async (field: ChildField, name: string): Promise<ChildField> => {
      await save(field.id, { name });
      return { ...field, name };
    },
    [save],
  );

  /** Moves a field to index `to` of the list. */
  async function move(field: ChildField, to: number) {
    const position = positionAfterMove(
      fields.map((f) => f.position),
      fields.findIndex((f) => f.id === field.id),
      to,
    );
    if (position === undefined) return;
    await save(field.id, { position });
  }

  async function remove(field: ChildField) {
    await removeRow(field.id);
  }

  return { load, add, rename, move, remove };
}
