package io.github.aborgatin.familyapp.family.member;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Locks the single Family row (ADR-0004) for the rest of the current transaction. Writes that must
 * see a consistent set of Members (bootstrap: "only while no Member exists") take this lock first,
 * so concurrent requests run one after another.
 */
@Component
public class FamilyLock {

  @PersistenceContext private EntityManager entityManager;

  /** Returns the Family's id. */
  @Transactional(propagation = Propagation.MANDATORY)
  public UUID lock() {
    return (UUID)
        entityManager.createNativeQuery("SELECT id FROM family FOR UPDATE").getSingleResult();
  }
}
