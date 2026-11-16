import { useCallback, useMemo } from 'react';
import { ApiError } from '@/shared/api';
import { useSyncedRows } from '@/shared/sync';
import type { Medicine } from './medicalTypes';

/** The rejection of a name the list already has (the server's code, checked here first). */
export const MEDICINE_DUPLICATE = 'medicine.duplicate';

const COLLATOR = new Intl.Collator('ru', { sensitivity: 'base' });

/** Every Medicine, deleted ones too, by name (ties by id). */
function inOrder(medicines: Medicine[]): Medicine[] {
  return [...medicines].sort(
    (a, b) => COLLATOR.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** A name as uniqueness compares it: trimmed, ignoring letter case. */
export function medicineKey(name: string): string {
  return name.trim().toLocaleLowerCase('ru');
}

/** The Medicine of the list (not deleted) with this name, ignoring letter case. */
export function medicineNamed(medicines: readonly Medicine[], name: string): Medicine | undefined {
  const key = medicineKey(name);
  return medicines.find(
    (medicine) => medicine.deleted !== true && medicineKey(medicine.name) === key,
  );
}

/** A new Medicine's id, made on the device (S3) once when its sheet opens. */
export function newMedicineId(): string {
  return crypto.randomUUID();
}

/**
 * The Family's Medicines and every change to them: the only data access to them. It reads the
 * local store and writes through the Outbox (S4), so it works the same offline.
 *
 * - `load`: the list (deleted ones left out), by name;
 * - `nameOf(id)`: any Medicine's name, a deleted one's too (past doses show it);
 * - `add`, `rename`: reject with `medicine.duplicate` for a name the list already has, ignoring
 *   case, without writing anything;
 * - `remove`: deletes it; it stays in the store, marked deleted.
 */
export function useMedicines() {
  const { load: every, save, remove: removeRow } = useSyncedRows<Medicine>('medicine', inOrder);
  const all = useMemo(() => (every.status === 'ready' ? every.value : []), [every]);
  const load = useMemo(
    () =>
      every.status === 'ready'
        ? { status: 'ready' as const, value: all.filter((medicine) => medicine.deleted !== true) }
        : every,
    [every, all],
  );

  const nameOf = useCallback(
    (id: string) => all.find((medicine) => medicine.id === id)?.name,
    [all],
  );

  const checkFree = useCallback(
    (id: string, name: string) => {
      const taken = medicineNamed(all, name);
      if (taken !== undefined && taken.id !== id) throw new ApiError(409, MEDICINE_DUPLICATE);
    },
    [all],
  );

  const add = useCallback(
    async (id: string, name: string): Promise<Medicine> => {
      checkFree(id, name);
      await save(id, { name });
      return { id, name };
    },
    [checkFree, save],
  );

  const rename = useCallback(
    async (medicine: Medicine, name: string): Promise<Medicine> => {
      checkFree(medicine.id, name);
      await save(medicine.id, { name });
      return { ...medicine, name };
    },
    [checkFree, save],
  );

  const remove = useCallback(
    async (medicine: Medicine) => {
      await removeRow(medicine.id);
    },
    [removeRow],
  );

  return { load, all, nameOf, add, rename, remove };
}
