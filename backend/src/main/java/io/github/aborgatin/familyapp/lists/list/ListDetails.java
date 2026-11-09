package io.github.aborgatin.familyapp.lists.list;

/** A List's client-written fields after validation: trimmed name, kind, Visibility. */
record ListDetails(String name, ListKind kind, Visibility visibility) {}
