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
   * soft-deletes it, and doses keep naming it. Delete wins. A rename to a name that another
   * Medicine which isn't deleted has, ignoring case, is {@code medicine.duplicate}; a new one with
   * such a name is ignored, kept deleted and merged into that one: the doses logged with it are
   * not lost, and name the surviving Medicine ({@link #forDose}).
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
    Optional<Medicine> taken = medicines.findNamed(name, operation.id());
    if (taken.isPresent() && existing.isPresent()) {
      throw new ApiException(HttpStatus.CONFLICT, "medicine.duplicate");
    }
    Medicine medicine = existing.orElseGet(() -> new Medicine(operation.id(), name));
    medicine.rename(name);
    if (taken.isPresent()) {
      // The other Member added the same name first, both offline. Kept as deleted, with its name,
      // and merged into the first one: the doses logged with it (the same push, or later) are
      // applied naming the first one, so prefill and «Лекарства» count them there. Being new, no
      // dose names it yet.
      medicine.mergeInto(taken.get().id());
      medicines.saveAndFlush(medicine);
      return Outcome.IGNORED;
    }
    medicines.saveAndFlush(medicine);
    return Outcome.APPLIED;
  }

  private Outcome delete(Medicine medicine) {
    medicine.markDeleted();
    medicines.saveAndFlush(medicine);
    return Outcome.APPLIED;
  }

  /**
   * The Medicine a dose naming {@code id} names: the one it was merged into, else itself (deleted
   * or not). One that never existed is {@code medical.not_found}.
   */
  UUID forDose(UUID id) {
    return medicines.findById(id).map(Medicine::forDose).orElseThrow(() -> Medicine.notFound(id));
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
