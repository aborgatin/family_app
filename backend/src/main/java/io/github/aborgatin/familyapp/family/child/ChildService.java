package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.member.FamilyLock;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Family's Children (spec #5, Children in Settings). Writes are idempotent upserts by the
 * client's id (S3), so M2's sync push can reuse {@link #put} and {@link #delete} unchanged.
 */
@Service
class ChildService {

  private final ChildRepository children;
  private final ChildColorPalette palette;
  private final FamilyLock familyLock;

  ChildService(ChildRepository children, ChildColorPalette palette, FamilyLock familyLock) {
    this.children = children;
    this.palette = palette;
    this.familyLock = familyLock;
  }

  @Transactional(readOnly = true)
  List<Child> list() {
    return children.findAllInOrder();
  }

  /**
   * Creates the Child or replaces all of its fields. Repeating it with the same body leaves the
   * same state. A soft-deleted id is {@code 409 child.deleted} and stays deleted.
   */
  @Transactional
  Child put(UUID id, ChildRequest request) {
    ChildDetails details = request.validate(palette);
    // Serializes writes, so two first PUTs of the same id can't both try to insert it.
    UUID familyId = familyLock.lock();
    Child child =
        children
            .findById(id)
            .map(
                existing -> {
                  if (existing.deleted()) {
                    throw new ApiException(HttpStatus.CONFLICT, "child.deleted");
                  }
                  existing.replace(details);
                  return existing;
                })
            .orElseGet(() -> new Child(id, familyId, details));
    return children.saveAndFlush(child);
  }

  /** Soft-deletes the Child; an unknown or already deleted id is not an error. */
  @Transactional
  void delete(UUID id) {
    familyLock.lock();
    children
        .findById(id)
        .filter(child -> !child.deleted())
        .ifPresent(
            child -> {
              child.markDeleted();
              children.saveAndFlush(child);
            });
  }
}
