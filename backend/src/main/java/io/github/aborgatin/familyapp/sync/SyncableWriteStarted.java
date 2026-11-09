package io.github.aborgatin.familyapp.sync;

/**
 * Published, inside its transaction, by every write to a syncable table when it takes the {@link
 * SyncLock} (the push, and every online-only write such as a Member's profile change). After that
 * transaction commits, every open live-update connection gets {@code changed} (spec #3 "Live
 * updates: SSE"). Publishing it more than once in one transaction sends {@code changed} once.
 */
public record SyncableWriteStarted() {}
