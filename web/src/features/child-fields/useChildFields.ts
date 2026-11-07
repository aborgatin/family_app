import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/shared/api';
import {
  deleteChildField,
  fetchChildFields,
  putChildField,
  type ChildField,
  type ValueType,
} from './childFieldsApi';

export type ChildFieldsLoad =
  | { status: 'loading' }
  | { status: 'failed'; error: ApiError }
  | { status: 'ready'; fields: ChildField[] };

export type Direction = 'up' | 'down';

/** Display order: by position, ties broken by id (the same rule as the server). */
function inOrder(fields: ChildField[]): ChildField[] {
  return [...fields].sort((a, b) =>
    a.position === b.position ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.position - b.position,
  );
}

/**
 * The position a field gets when moved one step: the midpoint between its new neighbours, or one
 * past the end neighbour at the top or bottom. Only the moved field is written, so a reorder is a
 * single-record change (Last write wins). Returns `undefined` when it can't move that way.
 */
export function positionAfterMove(
  fields: readonly ChildField[],
  id: string,
  direction: Direction,
): number | undefined {
  const index = fields.findIndex((f) => f.id === id);
  if (index === -1) return undefined;
  const [before, after] =
    direction === 'up'
      ? [fields[index - 2], fields[index - 1]]
      : [fields[index + 1], fields[index + 2]];
  if (direction === 'up' && after === undefined) return undefined;
  if (direction === 'down' && before === undefined) return undefined;
  if (before === undefined) return (after as ChildField).position - 1;
  if (after === undefined) return before.position + 1;
  return (before.position + after.position) / 2;
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'unknown');
}

/**
 * The Family's Child fields and every change to them. All data access for this feature goes
 * through here (spec #5, M2 rule): in M1 it is REST, online-only; M2 swaps in the local store +
 * Outbox without touching the components. Writes reject with an `ApiError` and leave the list as
 * it was.
 */
export function useChildFields() {
  const [load, setLoad] = useState<ChildFieldsLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    fetchChildFields().then(
      (fields) => {
        if (current) setLoad({ status: 'ready', fields: inOrder(fields) });
      },
      (error: unknown) => {
        if (current) setLoad({ status: 'failed', error: asApiError(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const fields = load.status === 'ready' ? load.fields : [];

  const saved = useCallback((field: ChildField) => {
    setLoad((previous) =>
      previous.status === 'ready'
        ? {
            status: 'ready',
            fields: inOrder([...previous.fields.filter((f) => f.id !== field.id), field]),
          }
        : previous,
    );
  }, []);

  async function write(id: string, change: Parameters<typeof putChildField>[1]) {
    try {
      saved(await putChildField(id, change));
    } catch (error: unknown) {
      throw asApiError(error);
    }
  }

  /** Adds a field at the end. The device makes its id (S3). */
  async function add(name: string, valueType: ValueType) {
    const last = fields.at(-1);
    await write(crypto.randomUUID(), {
      name,
      valueType,
      position: last === undefined ? 1 : last.position + 1,
    });
  }

  async function rename(field: ChildField, name: string) {
    await write(field.id, { name, valueType: field.valueType, position: field.position });
  }

  async function move(field: ChildField, direction: Direction) {
    const position = positionAfterMove(fields, field.id, direction);
    if (position === undefined) return;
    await write(field.id, { name: field.name, valueType: field.valueType, position });
  }

  async function remove(field: ChildField) {
    try {
      await deleteChildField(field.id);
    } catch (error: unknown) {
      throw asApiError(error);
    }
    setLoad((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', fields: previous.fields.filter((f) => f.id !== field.id) }
        : previous,
    );
  }

  return { load, retry, add, rename, move, remove };
}
