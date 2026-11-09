package io.github.aborgatin.familyapp.family;

import io.github.aborgatin.familyapp.sync.SyncLock;
import io.github.aborgatin.familyapp.sync.SyncableWriteStarted;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Locks the single Family row (ADR-0004) for the rest of the current transaction. Every write to a
 * syncable table takes it first (spec #3 "Ordering Versions"): the sync push (as the {@link
 * SyncLock}), registration, Invite acceptance, profile and password changes, password resets. So
 * Versions commit in Version order, and check-then-insert races run one after another. Taking it
 * also announces the write ({@link SyncableWriteStarted}), so live updates go out after the commit;
 * a transaction that then writes nothing (a push whose operations were all ignored or rejected)
 * still sends {@code changed}, which is harmless (docs/architecture/sync.md "Live updates").
 */
@Component
public class FamilyLock implements SyncLock {

  @PersistenceContext private EntityManager entityManager;
  private final ApplicationEventPublisher events;

  FamilyLock(ApplicationEventPublisher events) {
    this.events = events;
  }

  /** Takes the lock; needs a surrounding transaction. The Family's id is {@link Family#id()}. */
  @Override
  @Transactional(propagation = Propagation.MANDATORY)
  public void lock() {
    entityManager.createNativeQuery("SELECT id FROM family FOR UPDATE").getSingleResult();
    events.publishEvent(new SyncableWriteStarted());
  }
}
