package io.github.aborgatin.familyapp.family.child;

import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Children in Settings (spec #5, API contract "Children"). The web client calls these directly
 * until M2 moves it onto the local store + Outbox (S4, planned exception).
 */
@RestController
@ConditionalOnWebApplication
@RequestMapping("/api/children")
class ChildrenController {

  private final ChildService childService;

  ChildrenController(ChildService childService) {
    this.childService = childService;
  }

  /** Non-deleted Children, oldest first, those without a birthday last, then by name. */
  @GetMapping
  List<ChildResponse> list() {
    return childService.list().stream().map(ChildResponse::of).toList();
  }

  /** Creates or fully replaces; {@code 409 child.deleted} for a soft-deleted id. */
  @PutMapping("/{id}")
  ChildResponse put(@PathVariable UUID id, @RequestBody ChildRequest body) {
    return ChildResponse.of(childService.put(id, body));
  }

  /** Soft delete; {@code 204} even when already deleted or unknown. */
  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(@PathVariable UUID id) {
    childService.delete(id);
  }
}
