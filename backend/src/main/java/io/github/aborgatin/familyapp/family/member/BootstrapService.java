package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest.Registration;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates the first Member of a fresh installation (spec #5, stories 9–13). */
@Service
public class BootstrapService {

  private final FamilyLock familyLock;
  private final MemberRepository members;
  private final PasswordEncoder passwordEncoder;

  BootstrapService(
      FamilyLock familyLock, MemberRepository members, PasswordEncoder passwordEncoder) {
    this.familyLock = familyLock;
    this.members = members;
    this.passwordEncoder = passwordEncoder;
  }

  /**
   * Registers the first Member, or fails with {@code 409 auth.bootstrap_closed} once any Member
   * exists. The Family row lock makes the check and the insert atomic, so concurrent requests yield
   * exactly one Member.
   */
  @Transactional
  public Member bootstrap(Registration registration) {
    UUID familyId = familyLock.lock();
    if (members.existsBy()) {
      throw new ApiException(HttpStatus.CONFLICT, "auth.bootstrap_closed");
    }
    return members.saveAndFlush(
        new Member(
            familyId,
            registration.email(),
            passwordEncoder.encode(registration.password()),
            registration.displayName(),
            registration.grammaticalGender()));
  }
}
