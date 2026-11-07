package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.member.MemberResponse;
import io.github.aborgatin.familyapp.family.member.MemberService;
import io.github.aborgatin.familyapp.family.member.ProfileChange;
import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Members in Settings (spec #5, API contract "Members"). Online-only by design (S4 exception): the
 * client calls these directly because it needs the answer immediately.
 */
@RestController
@ConditionalOnWebApplication
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

  /** Changes only the fields sent: {@code {displayName?, grammaticalGender?}}. */
  @PatchMapping("/me")
  MemberResponse updateProfile(
      @AuthenticationPrincipal AuthenticatedMember me, @RequestBody Map<String, Object> body) {
    return MemberResponse.of(
        memberService.updateProfile(me.memberId(), ProfileChange.fromBody(body)));
  }

  /** {@code 400 auth.invalid_credentials} when the current password is wrong. */
  @PostMapping("/me/password")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void changePassword(
      @AuthenticationPrincipal AuthenticatedMember me, @RequestBody PasswordChange body) {
    memberService.changePassword(me.memberId(), body.currentPassword(), body.newPassword());
  }

  record PasswordChange(@Nullable String currentPassword, @Nullable String newPassword) {}
}
