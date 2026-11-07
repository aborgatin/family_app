package io.github.aborgatin.familyapp.family.member;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * A Member: an adult who logs in. Syncable (S1): {@code version} and {@code updatedAt} are set by
 * the database trigger on every INSERT and UPDATE (S2), so Java never writes them; Hibernate reads
 * them back after each write.
 */
@Entity
@Table(name = "member")
public class Member {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID familyId;

  @Column(nullable = false)
  private String email;

  @Column(nullable = false)
  private String passwordHash;

  @Column(nullable = false)
  private String displayName;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private GrammaticalGender grammaticalGender;

  @Column(nullable = false)
  private boolean notificationsEnabled = true;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private long version;

  @Generated(event = {EventType.INSERT, EventType.UPDATE})
  @Column(insertable = false, updatable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected Member() {}

  /** A new Member. The server generates Member ids (spec #5, IDs). */
  public Member(
      UUID familyId,
      String email,
      String passwordHash,
      String displayName,
      GrammaticalGender grammaticalGender) {
    this.id = UUID.randomUUID();
    this.familyId = familyId;
    this.email = email;
    this.passwordHash = passwordHash;
    this.displayName = displayName;
    this.grammaticalGender = grammaticalGender;
  }

  void rename(String displayName) {
    this.displayName = displayName;
  }

  void changeGrammaticalGender(GrammaticalGender grammaticalGender) {
    this.grammaticalGender = grammaticalGender;
  }

  void changePasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public UUID id() {
    return id;
  }

  public String email() {
    return email;
  }

  public String passwordHash() {
    return passwordHash;
  }

  public String displayName() {
    return displayName;
  }

  public GrammaticalGender grammaticalGender() {
    return grammaticalGender;
  }

  public long version() {
    return version;
  }

  public Instant updatedAt() {
    return updatedAt;
  }
}
