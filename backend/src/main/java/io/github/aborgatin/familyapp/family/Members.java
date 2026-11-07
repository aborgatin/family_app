package io.github.aborgatin.familyapp.family;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.member.Member;
import io.github.aborgatin.familyapp.family.member.MemberRepository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Members for other modules (spec #5, Modules): the current Member of an authenticated request, and
 * Member lookup by id. Removed Members are never returned.
 */
@Service
public class Members {

  private final MemberRepository members;

  Members(MemberRepository members) {
    this.members = members;
  }

  /**
   * The Member this request is logged in as, or {@code 401 auth.required} when it is not logged in
   * or its Member has been removed meanwhile.
   */
  @Transactional(readOnly = true)
  public MemberSummary current() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null
        || !authentication.isAuthenticated()
        || authentication instanceof AnonymousAuthenticationToken) {
      throw authRequired();
    }
    // The session's principal is named by the Member id (family.auth.AuthenticatedMember).
    return byId(UUID.fromString(authentication.getName())).orElseThrow(Members::authRequired);
  }

  /** The Member with this id, or empty when there is none or it has been removed. */
  @Transactional(readOnly = true)
  public Optional<MemberSummary> byId(UUID id) {
    return members.findByIdAndDeletedFalse(id).map(Members::summary);
  }

  static MemberSummary summary(Member member) {
    return new MemberSummary(member.id(), member.displayName());
  }

  private static ApiException authRequired() {
    return new ApiException(HttpStatus.UNAUTHORIZED, "auth.required");
  }
}
