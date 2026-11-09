import { useCallback, useMemo } from 'react';
import type { Load } from '@/shared/load';
import { deleteRow, upsertRow, useRows } from '@/shared/sync';
import type { ChildField, ValueType } from './childFieldsApi';

export type ChildFieldsLoad = Load<ChildField[]>;

/** Display order: by position, ties broken by id. */
function inOrder(fields: ChildField[]): ChildField[] {
  return [...fields].sort((a, b) =>
    a.position === b.position ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.position - b.position,
  );
}

/**
 * The position a field gets when moved to index `to` of the list (counted after the move): the
 * midpoint between its new neighbours, or one past the end neighbour at the top or bottom. Only
 * the moved field is written, so a reorder is a single-record change (Last write wins). Returns
 * `undefined` when it doesn't move.
 */
export function positionAfterMove(
  fields: readonly ChildField[],
  id: string,
  to: number,
): number | undefined {
  const index = fields.findIndex((f) => f.id === id);
  if (index === -1 || to === index || to < 0 || to >= fields.length) return undefined;
  const others = fields.filter((f) => f.id !== id);
  const before = others[to - 1];
  const after = others[to];
  if (before === undefined) return (after as ChildField).position - 1;
  if (after === undefined) return before.position + 1;
  return (before.position + after.position) / 2;
}

/** A new Child field's id, made on the device (S3) once when its sheet opens. */
export function newChildFieldId(): string {
  return crypto.randomUUID();
}

/**
 * The Family's Child fields and every change to them: the only data access of this feature. It
 * reads the local store and writes through the Outbox (S4), so it works the same offline; the sync
 * engine sends the changes and pulls the other Member's. Each write sends only what it changes
 * (Last write wins per field): a rename the name, a move the position. `saveFailure` is «Не
 * удалось сохранить» after the server rejected a change; the next pull has already put the
 * server's copy back.
 */
export function useChildFields() {
  const rows = useRows('child_field') as ChildField[] | undefined;

  const load = useMemo<ChildFieldsLoad>(
    () => (rows === undefined ? { status: 'loading' } : { status: 'ready', value: inOrder(rows) }),
    [rows],
  );
  const fields = load.status === 'ready' ? load.value : [];

  /** Adds a field at the end, with an id from `newChildFieldId()`. */
  async function add(id: string, name: string, valueType: ValueType): Promise<ChildField> {
    const last = fields.at(-1);
    const field = { id, name, valueType, position: last === undefined ? 1 : last.position + 1 };
    await upsertRow('child_field', id, { name, valueType, position: field.position });
    return field;
  }

  const rename = useCallback(async (field: ChildField, name: string): Promise<ChildField> => {
    await upsertRow('child_field', field.id, field.name === name ? {} : { name });
    return { ...field, name };
  }, []);

  /** Moves a field to index `to` of the list. */
  async function move(field: ChildField, to: number) {
    const position = positionAfterMove(fields, field.id, to);
    if (position === undefined) return;
    await upsertRow('child_field', field.id, { position });
  }

  async function remove(field: ChildField) {
    await deleteRow('child_field', field.id);
  }

  const retry = useCallback(() => undefined, []);

  return {
    load,
    retry,
    add,
    rename,
    move,
    remove,
  };
}
