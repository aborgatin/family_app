package io.github.aborgatin.familyapp.family.child;

import io.github.aborgatin.familyapp.sync.SyncedRecord;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * What the module's other packages may ask about Children: whether one exists and whether it is
 * deleted (what belongs to a Child, such as a Child field value, is not written for a deleted one).
 */
@Component
public class Children {

  private final ChildRepository children;

  Children(ChildRepository children) {
    this.children = children;
  }

  /** The Child with this id, deleted or not; empty when there never was one. */
  public Optional<SyncedRecord> find(UUID id) {
    return children.findById(id).map(child -> child);
  }
}
