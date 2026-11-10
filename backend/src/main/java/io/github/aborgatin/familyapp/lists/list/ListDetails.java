package io.github.aborgatin.familyapp.lists.list;

/**
 * A List's client-written fields after validation: trimmed name, kind, Visibility, and the place of
 * its Unnamed category among its Categories.
 */
record ListDetails(
    String name, ListKind kind, Visibility visibility, double unnamedCategoryPosition) {}
