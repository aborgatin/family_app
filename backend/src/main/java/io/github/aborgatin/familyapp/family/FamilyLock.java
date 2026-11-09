package io.github.aborgatin.familyapp.family;

import io.github.aborgatin.familyapp.sync.SyncLock;
import io.github.aborgatin.familyapp.sync.SyncableWriteStarted;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Locks the single Family row (ADR-0004) for the rest of the current transaction. Every write to a
 * syncable table takes it first (spec #3 "Ordering Versions"): the sync push (as the {@link
 * SyncLock}), registration, Invite acceptance, profile and password changes, password resets. So
 * Versions commit in Version order, and check-then-insert races run one after another. Taking it
 * also announces the write ({@link SyncableWriteStarted}), so live updates go out after the commit.
 */
@Component
public class FamilyLock implements SyncLock {

  @PersistenceContext private EntityManager entityManager;
  private final ApplicationEventPublisher events;

  FamilyLock(ApplicationEventPublisher events) {
    this.events = events;
  }

  /** Takes the lock and returns the Family's id. */
  @Transactional(propagation = Propagation.MANDATORY)
  public UUID lockFamily() {
    UUID familyId =
        (UUID)
            entityManager.createNativeQuery("SELECT id FROM family FOR UPDATE").getSingleResult();
    events.publishEvent(new SyncableWriteStarted());
    return familyId;
  }

  @Override
  @Transactional(propagation = Propagation.MANDATORY)
  public void lock() {
    lockFamily();
  }
}
