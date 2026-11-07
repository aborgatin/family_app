package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.member.MemberResponse;
import io.github.aborgatin.familyapp.family.member.MemberService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Members in Settings (spec #5, API contract "Members"). Online-only by design (S4 exception): the
 * client calls these directly and needs the answer immediately.
 */
@RestController
@RequestMapping("/api/members")
class MembersController {

  private final MemberService memberService;

  MembersController(MemberService memberService) {
    this.memberService = memberService;
  }

  @GetMapping
  List<MemberResponse> list() {
    return memberService.list().stream().map(MemberResponse::of).toList();
  }
}
