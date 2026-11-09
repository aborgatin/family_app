package io.github.aborgatin.familyapp.lists.list;

import org.springframework.lang.Nullable;

/**
 * An Item's client-written fields after validation: trimmed text, the note ({@code null}: none).
 */
record ItemDetails(String text, @Nullable String note) {}
