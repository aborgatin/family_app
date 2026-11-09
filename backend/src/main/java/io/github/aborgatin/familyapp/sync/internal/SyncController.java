package io.github.aborgatin.familyapp.sync.internal;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.github.aborgatin.familyapp.sync.internal.SyncService.Incoming;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The only write API and the only read API for syncable tables (spec #3): {@code POST
 * /api/sync/push} and {@code GET /api/sync/pull?since=N}. Both need a session. The session's
 * principal is named by the Member id (set up by the {@code family} module at login).
 */
@RestController
@ConditionalOnWebApplication
@RequestMapping("/api/sync")
class SyncController {

  private final SyncService sync;

  SyncController(SyncService sync) {
    this.sync = sync;
  }

  record PushBody(@Nullable List<Incoming> operations) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  record ResultBody(
      SyncService.Result.Status status,
      @Nullable String code,
      @Nullable Map<String, Object> params) {}

  record PushResponse(List<ResultBody> results, long version) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  record ChangeBody(
      String table, UUID id, long version, boolean deleted, @Nullable Map<String, Object> fields) {}

  record PullResponse(List<ChangeBody> changes, long version) {}

  /**
   * Applies the operations in order; one result per operation ({@code applied}, {@code ignored}, or
   * {@code rejected} with {@code code} and {@code params}) and the Version after the push.
   */
  @PostMapping("/push")
  PushResponse push(@RequestBody PushBody body, Principal principal) {
    List<Incoming> operations = body.operations() == null ? List.of() : body.operations();
    SyncService.Pushed pushed = sync.push(memberId(principal), operations);
    return new PushResponse(
        pushed.results().stream()
            .map(
                result ->
                    result.error() == null
                        ? new ResultBody(result.status(), null, null)
                        : new ResultBody(
                            result.status(), result.error().code(), result.error().params()))
            .toList(),
        pushed.version());
  }

  /** The changes since Version {@code since} and the high-water Version to store next. */
  @GetMapping("/pull")
  PullResponse pull(@RequestParam long since, Principal principal) {
    SyncService.Pulled pulled = sync.pull(memberId(principal), since);
    return new PullResponse(
        pulled.changes().stream()
            .map(
                change ->
                    new ChangeBody(
                        change.table(),
                        change.row().id(),
                        change.row().version(),
                        change.row().deleted(),
                        change.row().fields()))
            .toList(),
        pulled.version());
  }

  private static UUID memberId(Principal principal) {
    return UUID.fromString(principal.getName());
  }
}
