package io.github.aborgatin.familyapp.notifications.mute;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.lists.Lists;
import io.github.aborgatin.familyapp.lists.Visibility;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** The {@code mute} table of the sync push and pull (spec #104 "Mute", ticket #111). */
@Service
class MuteService implements SyncableTable {

  private final MuteRepository mutes;
  private final Lists lists;

  MuteService(MuteRepository mutes, Lists lists) {
    this.mutes = mutes;
    this.lists = lists;
  }

  @Override
  public String name() {
    return "mute";
  }

  /**
   * An upsert of an unknown id Mutes the List it carries ({@code listId} required) for the pushing
   * Member: a List they see ({@code list.not_found} otherwise, A1) and Shared, Child lists included
   * ({@code mute.private_list}). A Mute never changes: an upsert of a known one changes nothing. A
   * delete unmutes. Delete wins: anything on a deleted Mute, and deleting an unknown one, is
   * ignored. Another Member's Mute is treated as unknown: {@code mute.not_found}.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<Mute> existing = mutes.findById(operation.id());
    if (existing.isPresent() && !existing.get().memberId().equals(operation.memberId())) {
      throw new ApiException(
          HttpStatus.NOT_FOUND, "mute.not_found", Map.of("muteId", operation.id().toString()));
    }
    return Outcome.deleteWins(operation, existing, this::upsert, this::delete);
  }

  private Outcome upsert(Operation operation, Optional<Mute> existing) {
    if (existing.isPresent()) {
      return Outcome.APPLIED;
    }
    FieldErrors errors = new FieldErrors();
    UUID listId = errors.requiredUuid("listId", operation.text("listId"));
    errors.throwIfAny();
    if (!lists.visibleTo(listId, operation.memberId())) {
      throw new ApiException(
          HttpStatus.NOT_FOUND, "list.not_found", Map.of("listId", listId.toString()));
    }
    if (lists.find(listId).orElseThrow().visibility() == Visibility.PRIVATE) {
      throw new ApiException(
          HttpStatus.BAD_REQUEST, "mute.private_list", Map.of("listId", listId.toString()));
    }
    mutes.saveAndFlush(new Mute(operation.id(), listId, operation.memberId()));
    return Outcome.APPLIED;
  }

  private Outcome delete(Mute mute) {
    mute.markDeleted();
    mutes.saveAndFlush(mute);
    return Outcome.APPLIED;
  }

  /** Only the Member's own Mutes: another Member's are left out, not even sent as tombstones. */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        mutes.findByVersionGreaterThan(version).stream()
            .filter(mute -> mute.memberId().equals(memberId))
            .toList(),
        (mute, fields) -> fields.put("listId", mute.listId()));
  }
}
