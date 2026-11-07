package io.github.aborgatin.familyapp.command;

import io.github.aborgatin.familyapp.family.PasswordResets;
import io.github.aborgatin.familyapp.family.PasswordResets.NewPasswordReset;
import java.io.PrintStream;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * {@code reset-password <email>}: creates a password reset for the Member with this email and
 * prints its one-time link for the operator to pass on (spec #5 story 24).
 */
@Component
class PasswordResetCommand {

  static final String NAME = "reset-password";
  static final String USAGE = "Usage: " + NAME + " <email>";

  private final PasswordResets passwordResets;

  PasswordResetCommand(PasswordResets passwordResets) {
    this.passwordResets = passwordResets;
  }

  /** Returns the process exit code. */
  int run(List<String> args, PrintStream out, PrintStream err) {
    if (args.size() != 1) {
      err.println(USAGE);
      return Commands.EXIT_USAGE;
    }
    String email = args.get(0);
    Optional<NewPasswordReset> reset = passwordResets.createForEmail(email);
    if (reset.isEmpty()) {
      err.println("No Member has the email " + email.trim() + ". Nothing was created.");
      return Commands.EXIT_FAILED;
    }
    out.println(
        "Password reset link for "
            + email.trim()
            + " (works once, until "
            + reset.get().expiresAt()
            + "):");
    out.println(reset.get().url());
    return Commands.EXIT_OK;
  }
}
