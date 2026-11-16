package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** The {@code medicine} table of the sync push and pull (spec #128, ticket #130). */
@Service
class MedicineService implements SyncableTable {

  private final MedicineRepository medicines;

  MedicineService(MedicineRepository medicines) {
    this.medicines = medicines;
  }

  @Override
  public String name() {
    return "medicine";
  }

  /**
   * An upsert creates the Medicine or renames it ({@code name} required, trimmed); a delete
   * soft-deletes it, and doses keep naming it. Delete wins. A name that another Medicine which
   * isn't deleted has, ignoring case, is {@code medicine.duplicate}.
   */
  @Override
  public Outcome apply(Operation operation) {
    return Outcome.deleteWins(
        operation, medicines.findById(operation.id()), this::upsert, this::delete);
  }

  private Outcome upsert(Operation operation, Optional<Medicine> existing) {
    if (existing.isPresent() && !operation.has("name")) {
      return Outcome.APPLIED;
    }
    FieldErrors errors = new FieldErrors();
    String name = operation.trimmedText("name");
    if (name == null) {
      errors.add("name", FieldErrors.REQUIRED);
    }
    errors.throwIfAny();
    if (medicines.nameTaken(name, operation.id())) {
      throw new ApiException(HttpStatus.CONFLICT, "medicine.duplicate");
    }
    Medicine medicine = existing.orElseGet(() -> new Medicine(operation.id(), name));
    medicine.rename(name);
    medicines.saveAndFlush(medicine);
    return Outcome.APPLIED;
  }

  private Outcome delete(Medicine medicine) {
    medicine.markDeleted();
    medicines.saveAndFlush(medicine);
    return Outcome.APPLIED;
  }

  /** Whether a dose may name this Medicine: one that exists, deleted or not. */
  boolean exists(UUID id) {
    return medicines.findById(id).isPresent();
  }

  /**
   * Every changed Medicine, a deleted one too, as a row with its {@code name} and {@code deleted}:
   * never a tombstone, so past doses keep showing its name on every device, a new one included.
   */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return medicines.findByVersionGreaterThan(version).stream()
        .map(
            medicine -> {
              Map<String, Object> fields = new LinkedHashMap<>();
              fields.put("name", medicine.name());
              fields.put("deleted", medicine.deleted());
              return SyncRow.of(medicine.id(), medicine.version(), fields);
            })
        .toList();
  }
}
