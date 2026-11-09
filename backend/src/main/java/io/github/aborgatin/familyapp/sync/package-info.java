/**
 * The {@code sync} module (spec #3 "Backend modules"; ADR-0003): the push and pull endpoints, the
 * push transaction and its lock call, and the interface each module implements per syncable table
 * ({@link io.github.aborgatin.familyapp.sync.SyncableTable}). Modules that own syncable tables
 * depend on this one ({@code family → sync}, later {@code lists → sync}); it depends on none of
 * them. Types in this package are the public API; {@code sync.internal} is internal.
 */
@ApplicationModule(displayName = "Sync")
package io.github.aborgatin.familyapp.sync;

import org.springframework.modulith.ApplicationModule;
