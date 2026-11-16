package io.github.aborgatin.familyapp.notifications;

import org.springframework.lang.Nullable;

/**
 * An Announcement («Что нового», GLOSSARY; spec #120): one entry of the catalog. {@code id} is its
 * permanent identity (a new id is a new Announcement, sent again); {@code title} and {@code body}
 * are sent exactly as written; {@code url} is the screen a tap opens, {@code /} when {@code null}.
 */
public record Announcement(String id, String title, String body, @Nullable String url) {}
