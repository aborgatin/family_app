package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The Members of the Family and a Member's own account (spec #5, Members in Settings). */
@Service
public class MemberService {

  private final MemberRepository members;
  private final PasswordEncoder passwordEncoder;

  MemberService(MemberRepository members, PasswordEncoder passwordEncoder) {
    this.members = members;
    this.passwordEncoder = passwordEncoder;
  }

  /** Every Member, by display name. */
  @Transactional(readOnly = true)
  public List<Member> list() {
    return members.findByDeletedFalseOrderByDisplayNameAscEmailAsc();
  }

  /**
   * Applies the fields the change carries to the Member's own profile; the rest stay as they are.
   */
  @Transactional
  public Member updateProfile(UUID memberId, ProfileChange change) {
    Member member = find(memberId);
    if (change.displayName() != null) {
      member.rename(change.displayName());
    }
    if (change.grammaticalGender() != null) {
      member.changeGrammaticalGender(change.grammaticalGender());
    }
    return members.saveAndFlush(member);
  }

  /**
   * Replaces the Member's password after checking the current one. Validation comes first ({@code
   * 400 validation.failed}); a wrong current password is {@code 400 auth.invalid_credentials}.
   * Sessions stay as they are.
   */
  @Transactional
  public void changePassword(
      UUID memberId, @Nullable String currentPassword, @Nullable String newPassword) {
    FieldErrors errors = new FieldErrors();
    if (currentPassword == null || currentPassword.isEmpty()) {
      errors.add("currentPassword", FieldErrors.REQUIRED);
    }
    String validNewPassword = RegistrationRequest.checkPassword("newPassword", newPassword, errors);
    errors.throwIfAny();

    Member member = find(memberId);
    if (!passwordEncoder.matches(currentPassword, member.passwordHash())) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "auth.invalid_credentials");
    }
    member.changePasswordHash(passwordEncoder.encode(validNewPassword));
    members.saveAndFlush(member);
  }

  private Member find(UUID memberId) {
    // The session outlived its Member (removed meanwhile): treat it as logged out.
    return members
        .findByIdAndDeletedFalse(memberId)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "auth.required"));
  }
}
