package io.github.aborgatin.familyapp.family.childfield;

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
 * Child fields in Settings (spec #5, API contract "Child fields"). In M1 the web client calls these
 * directly; M2 moves it onto the local store + Outbox.
 */
@RestController
@ConditionalOnWebApplication
@RequestMapping("/api/child-fields")
class ChildFieldsController {

  private final ChildFieldService childFields;

  ChildFieldsController(ChildFieldService childFields) {
    this.childFields = childFields;
  }

  @GetMapping
  List<ChildFieldResponse> list() {
    return childFields.list().stream().map(ChildFieldResponse::of).toList();
  }

  @PutMapping("/{id}")
  ChildFieldResponse put(@PathVariable UUID id, @RequestBody ChildFieldRequest body) {
    return ChildFieldResponse.of(childFields.put(id, body));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(@PathVariable UUID id) {
    childFields.delete(id);
  }
}
