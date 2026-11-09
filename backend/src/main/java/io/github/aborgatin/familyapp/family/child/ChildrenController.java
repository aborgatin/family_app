package io.github.aborgatin.familyapp.family.child;

import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Family's Children, read-only (spec #5, API contract "Children"). Writes go through the sync
 * push and the web client reads through the sync pull (spec #3); this list stays for anything that
 * wants the Children in the server's order.
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
}
