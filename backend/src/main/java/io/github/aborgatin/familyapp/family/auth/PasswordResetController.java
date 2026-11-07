package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.PasswordResets;
import io.github.aborgatin.familyapp.family.member.MemberResponse;
import io.github.aborgatin.familyapp.family.member.MemberService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.lang.Nullable;
import org.springframework.security.core.context.SecurityContextHolder;
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
  private final PasswordResetCompletion completion;
  private final SessionLogin sessionLogin;
  private final MemberService memberService;

  PasswordResetController(
      PasswordResets passwordResets,
      PasswordResetCompletion completion,
      SessionLogin sessionLogin,
      MemberService memberService) {
    this.passwordResets = passwordResets;
    this.completion = completion;
    this.sessionLogin = sessionLogin;
    this.memberService = memberService;
  }

  /** Whether the link still works, so the screen can explain an expired or used one up front. */
  @GetMapping
  PasswordResetResponse get(@PathVariable String token) {
    return new PasswordResetResponse(passwordResets.expiresAt(token));
  }

  /**
   * Sets the new password and logs the Member out everywhere, whoever knew the old password
   * included (story 23), in one transaction; then logs them in on this device with a new session.
   */
  @PostMapping("/complete")
  MemberResponse complete(
      @PathVariable String token,
      @RequestBody CompleteRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    MemberSummary member = completion.complete(token, body.newPassword());

    HttpSession current = request.getSession(false);
    if (current != null) {
      current.invalidate();
    }
    SecurityContextHolder.clearContext();
    sessionLogin.logIn(member.id(), request, response);
    return MemberResponse.of(memberService.get(member.id()));
  }

  record CompleteRequest(@Nullable String newPassword) {}

  record PasswordResetResponse(Instant expiresAt) {}
}
