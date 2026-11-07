package io.github.aborgatin.familyapp.family.member;

import java.util.Locale;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Checks a Member's email and password (spec #5, Authentication & session). */
@Service
public class LoginService {

  private final MemberRepository members;
  private final PasswordEncoder passwordEncoder;

  /**
   * Checked when the email is unknown, so an unknown email costs as much time as a wrong password
   * and the response time doesn't reveal which emails are registered (story 19).
   */
  private final String unknownMemberHash;

  LoginService(MemberRepository members, PasswordEncoder passwordEncoder) {
    this.members = members;
    this.passwordEncoder = passwordEncoder;
    this.unknownMemberHash = passwordEncoder.encode("no Member has this password");
  }

  /** An email the way registration stores it: trimmed and lower-cased. */
  public static String normalizeEmail(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }

  /**
   * The Member with this email and password, or empty when either is wrong. Callers must not tell
   * the two cases apart.
   */
  @Transactional(readOnly = true)
  public Optional<Member> authenticate(String email, String password) {
    Optional<Member> member = members.findByEmailAndDeletedFalse(normalizeEmail(email));
    String hash = member.map(Member::passwordHash).orElse(unknownMemberHash);
    return passwordEncoder.matches(password, hash) ? member : Optional.empty();
  }
}
