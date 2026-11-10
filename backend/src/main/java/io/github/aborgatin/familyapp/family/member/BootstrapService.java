package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.Family;
import io.github.aborgatin.familyapp.family.FamilyLock;
import io.github.aborgatin.familyapp.family.FirstMemberRegistered;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest.Registration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates the first Member of a fresh installation (spec #5, stories 9–13). */
@Service
public class BootstrapService {

  private final FamilyLock familyLock;
  private final Family family;
  private final MemberRepository members;
  private final PasswordEncoder passwordEncoder;
  private final ApplicationEventPublisher events;

  BootstrapService(
      FamilyLock familyLock,
      Family family,
      MemberRepository members,
      PasswordEncoder passwordEncoder,
      ApplicationEventPublisher events) {
    this.familyLock = familyLock;
    this.family = family;
    this.members = members;
    this.passwordEncoder = passwordEncoder;
    this.events = events;
  }

  /**
   * Registers the first Member, or fails with {@code 409 auth.bootstrap_closed} once any Member
   * exists. The Family row lock makes the check and the insert atomic, so concurrent requests yield
   * exactly one Member. Announces {@link FirstMemberRegistered} in the same transaction, so the
   * Defaults that need an Owner (the Default Shopping lists) are created with the Member or not at
   * all.
   */
  @Transactional
  public Member bootstrap(Registration registration) {
    familyLock.lock();
    if (members.existsBy()) {
      throw new ApiException(HttpStatus.CONFLICT, "auth.bootstrap_closed");
    }
    Member member =
        members.saveAndFlush(
            new Member(
                family.id(),
                registration.email(),
                passwordEncoder.encode(registration.password()),
                registration.displayName(),
                registration.grammaticalGender()));
    events.publishEvent(new FirstMemberRegistered(member.id()));
    return member;
  }
}
