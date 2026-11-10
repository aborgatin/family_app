package io.github.aborgatin.familyapp.lists.list;

/**
 * A todo item's Repeat (GLOSSARY): how often it recurs. Code, not Family data (S7). Only on an Item
 * with a Due date; removing the Due date removes it.
 */
enum Repeat {
  DAILY,
  WEEKLY,
  MONTHLY,
  YEARLY
}
