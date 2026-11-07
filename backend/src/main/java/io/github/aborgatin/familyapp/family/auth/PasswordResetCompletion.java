package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.PasswordResets;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.lang.Nullable;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Completes a password reset and ends every session of the Member, all or nothing (story 23): the
 * new password, the used-up link and the deleted sessions commit together, so a failure leaves the
 * old password working and the link usable. Spring Session's writes join this transaction (see
 * {@link SessionTransactionConfig}).
 */
@ConditionalOnWebApplication
@Component
class PasswordResetCompletion {

  private final PasswordResets passwordResets;
  private final FindByIndexNameSessionRepository<? extends Session> sessions;

  PasswordResetCompletion(
      PasswordResets passwordResets, FindByIndexNameSessionRepository<? extends Session> sessions) {
    this.passwordResets = passwordResets;
    this.sessions = sessions;
  }

  @Transactional
  MemberSummary complete(String token, @Nullable String newPassword) {
    MemberSummary member = passwordResets.complete(token, newPassword);
    // AuthenticatedMember's name is the Member id, which Spring Session indexes as the principal.
    for (String sessionId : sessions.findByPrincipalName(member.id().toString()).keySet()) {
      sessions.deleteById(sessionId);
    }
    return member;
  }
}
