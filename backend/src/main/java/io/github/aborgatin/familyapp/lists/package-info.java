/**
 * The {@code lists} module (spec #3 "Backend modules"): Lists (and, from ticket #57, Items), the
 * rules on their operations, and the Visibility-filtered pull. Lists are written only through the
 * sync push and read only through the sync pull: this module implements {@code sync.SyncableTable}
 * per table and has no REST endpoints. Dependencies: {@code lists → sync}, {@code lists → error},
 * {@code lists → family} (the {@code FirstMemberRegistered} event, for the Default Shopping lists).
 * Types in this package are the public API (none yet); sub-packages are internal (CODING_STANDARDS
 * M1).
 */
@ApplicationModule(displayName = "Lists")
package io.github.aborgatin.familyapp.lists;

import org.springframework.modulith.ApplicationModule;
