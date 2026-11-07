package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.PasswordResets;
import io.github.aborgatin.familyapp.family.member.Member;
import io.github.aborgatin.familyapp.family.member.MemberResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.lang.Nullable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The public side of a password reset link (spec #5, API contract). Links are created only by the
 * operator's {@code reset-password} command; there is no endpoint to create one.
 */
@ConditionalOnWebApplication
@RestController
@RequestMapping("/api/password-resets/by-token/{token}")
class PasswordResetController {

  private final PasswordResets passwordResets;
  private final FindByIndexNameSessionRepository<? extends Session> sessions;
  private final SessionLogin sessionLogin;

  PasswordResetController(
      PasswordResets passwordResets,
      FindByIndexNameSessionRepository<? extends Session> sessions,
      SessionLogin sessionLogin) {
    this.passwordResets = passwordResets;
    this.sessions = sessions;
    this.sessionLogin = sessionLogin;
  }

  /** Whether the link still works, so the screen can explain an expired or used one up front. */
  @GetMapping
  PasswordResetResponse get(@PathVariable String token) {
    return new PasswordResetResponse(passwordResets.expiresAt(token));
  }

  /**
   * Sets the new password, logs the Member out everywhere, whoever knew the old password included
   * (story 23), then logs them in on this device with a new session.
   */
  @PostMapping("/complete")
  MemberResponse complete(
      @PathVariable String token,
      @RequestBody CompleteRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    Member member = passwordResets.complete(token, body.newPassword());

    HttpSession current = request.getSession(false);
    if (current != null) {
      current.invalidate();
    }
    SecurityContextHolder.clearContext();
    // AuthenticatedMember's name is the Member id, which Spring Session indexes as the principal.
    for (String sessionId : sessions.findByPrincipalName(member.id().toString()).keySet()) {
      sessions.deleteById(sessionId);
    }

    sessionLogin.logIn(member.id(), request, response);
    return MemberResponse.of(member);
  }

  record CompleteRequest(@Nullable String newPassword) {}

  record PasswordResetResponse(Instant expiresAt) {}
}
