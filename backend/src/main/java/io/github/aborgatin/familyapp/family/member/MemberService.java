package io.github.aborgatin.familyapp.family.member;

import java.util.List;
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
}
