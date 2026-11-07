package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.error.ApiException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The Members of the Family and a Member's own account (spec #5, Members in Settings). */
@Service
public class MemberService {

  private final MemberRepository members;

  MemberService(MemberRepository members) {
    this.members = members;
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

  private Member find(UUID memberId) {
    // The session outlived its Member (removed meanwhile): treat it as logged out.
    return members
        .findByIdAndDeletedFalse(memberId)
        .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "auth.required"));
  }
}
