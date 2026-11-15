package io.github.aborgatin.familyapp.notifications.mute;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Who Muted a List, for sending a Batch (spec #104 "Sending a Batch"; ticket #111). */
@Component
public class Mutes {

  private final MuteRepository mutes;

  Mutes(MuteRepository mutes) {
    this.mutes = mutes;
  }

  /** The Members with a live Mute of the List, as of the caller's transaction. */
  public Set<UUID> mutedBy(UUID listId) {
    return mutes.findByListIdAndDeletedFalse(listId).stream()
        .map(Mute::memberId)
        .collect(Collectors.toSet());
  }
}
