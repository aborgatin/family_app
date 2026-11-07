package io.github.aborgatin.familyapp.family.childfield;

/**
 * What kind of value a Child field holds (GLOSSARY "Value type", ADR-0007). Code, not Family data
 * (S7): a new type is a code change only. Values are stored as text in a canonical format.
 */
public enum ValueType {
  TEXT,
  /** Stored as {@code YYYY-MM-DD}. */
  DATE
}
