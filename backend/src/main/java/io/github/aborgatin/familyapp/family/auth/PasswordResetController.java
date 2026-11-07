package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.PasswordResets;
import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

  PasswordResetController(PasswordResets passwordResets) {
    this.passwordResets = passwordResets;
  }

  /** Whether the link still works, so the screen can explain an expired or used one up front. */
  @GetMapping
  PasswordResetResponse get(@PathVariable String token) {
    return new PasswordResetResponse(passwordResets.expiresAt(token));
  }

  record PasswordResetResponse(Instant expiresAt) {}
}
