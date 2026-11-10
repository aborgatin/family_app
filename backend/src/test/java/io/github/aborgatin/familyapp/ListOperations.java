package io.github.aborgatin.familyapp;

import java.util.UUID;

/**
 * Test helpers for the Lists' sync tables: the Outbox operations most of their tests push (built
 * with {@link SyncRequests#upsert}).
 */
public final class ListOperations {

  private ListOperations() {}

  /** Creates a List: {@code kind} {@code SHOPPING}/{@code TODO}/{@code WISH}, a Visibility. */
  public static String list(UUID id, String name, String kind, String visibility) {
    return SyncRequests.upsert(
        "list",
        id,
        "{\"name\":\"%s\",\"kind\":\"%s\",\"visibility\":\"%s\"}"
            .formatted(name, kind, visibility));
  }

  /** Adds an open Item with this text to the List. */
  public static String add(UUID id, UUID listId, String text) {
    return SyncRequests.upsert(
        "item", id, "{\"listId\":\"%s\",\"text\":\"%s\"}".formatted(listId, text));
  }

  /** Marks the Item Done, or open again. */
  public static String done(UUID id, boolean done) {
    return SyncRequests.upsert("item", id, "{\"done\":%s}".formatted(done));
  }
}
