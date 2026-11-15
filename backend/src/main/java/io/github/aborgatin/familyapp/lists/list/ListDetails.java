package io.github.aborgatin.familyapp.lists.list;

import io.github.aborgatin.familyapp.lists.ListKind;
import io.github.aborgatin.familyapp.lists.Visibility;

/**
 * A List's client-written fields after validation: trimmed name, kind, Visibility, and the place of
 * its Unnamed category among its Categories.
 */
record ListDetails(
    String name, ListKind kind, Visibility visibility, double unnamedCategoryPosition) {}
