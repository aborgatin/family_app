package io.github.aborgatin.familyapp.sync;

/**
 * The lock every write to a syncable table takes first, for the rest of its transaction. Holding it
 * while Versions are taken and committed makes Versions commit in Version order, so a pull of
 * "everything since N" never skips a row from a slower concurrent write (sync.md). The {@code
 * family} module implements it with {@code FamilyLock}; a push takes it before its first operation.
 */
public interface SyncLock {

  /** Takes the lock; needs a surrounding transaction. */
  void lock();
}
