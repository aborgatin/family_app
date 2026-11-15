package io.github.aborgatin.familyapp.lists;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;
import org.springframework.lang.Nullable;

/**
 * An open todo item whose due moment has come ({@link Lists#dueBetween}): the Item, its List, its
 * Assignee ({@code null} for nobody) and its Due date, the day and the time ({@code null} when the
 * Due date has none).
 */
public record DueItem(
    UUID itemId,
    String name,
    UUID listId,
    @Nullable UUID assigneeId,
    LocalDate dueDate,
    @Nullable LocalTime dueTime) {}
