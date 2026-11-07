package io.github.aborgatin.familyapp.family.auth;

import java.io.Serializable;
import java.util.UUID;
import org.springframework.security.core.AuthenticatedPrincipal;

/**
 * The principal stored in a Member's session. Its name is the Member id, which Spring Session
 * indexes, so all sessions of one Member can be found (and invalidated) later.
 */
record AuthenticatedMember(UUID memberId) implements AuthenticatedPrincipal, Serializable {

  @Override
  public String getName() {
    return memberId.toString();
  }
}
