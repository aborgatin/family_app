package io.github.aborgatin.familyapp.family.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.member.Invite;
import io.github.aborgatin.familyapp.family.member.InviteService;
import io.github.aborgatin.familyapp.family.member.InviteService.NewInvite;
import io.github.aborgatin.familyapp.family.member.Member;
import io.github.aborgatin.familyapp.family.member.MemberResponse;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Invites (spec #5, API contract "Invites"). Creating, listing and revoking need a session; the
 * {@code by-token} endpoints are public, because the invited adult has no account yet. Online-only
 * by design (S4 exception).
 */
@ConditionalOnWebApplication
@RestController
@RequestMapping("/api/invites")
class InvitesController {

  private final InviteService inviteService;
  private final SessionLogin sessionLogin;

  InvitesController(InviteService inviteService, SessionLogin sessionLogin) {
    this.inviteService = inviteService;
    this.sessionLogin = sessionLogin;
  }

  /** The only response that carries the link: the token can't be read again later. */
  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  InviteResponse create(@AuthenticationPrincipal AuthenticatedMember me) {
    NewInvite created = inviteService.create(me.memberId());
    return InviteResponse.of(created.invite(), created.url());
  }

  @GetMapping
  List<InviteResponse> active() {
    return inviteService.active().stream().map(invite -> InviteResponse.of(invite, null)).toList();
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void revoke(@PathVariable String id) {
    inviteService.revoke(parseId(id));
  }

  /** Whether the link still works, so the screen can explain a broken one up front. */
  @GetMapping("/by-token/{token}")
  InviteLinkResponse byToken(@PathVariable String token) {
    return new InviteLinkResponse(inviteService.expiresAt(token));
  }

  /** Registers the invited adult and logs them in on this device with a new session id. */
  @PostMapping("/by-token/{token}/accept")
  @ResponseStatus(HttpStatus.CREATED)
  MemberResponse accept(
      @PathVariable String token,
      @RequestBody RegistrationRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    Member member = inviteService.accept(token, body);
    sessionLogin.logIn(member.id(), request, response);
    return MemberResponse.of(member);
  }

  private static UUID parseId(String id) {
    try {
      return UUID.fromString(id);
    } catch (IllegalArgumentException e) {
      throw new ApiException(HttpStatus.NOT_FOUND, "invite.not_found");
    }
  }

  /** The API's {@code Invite} shape; {@code url} only right after creation. */
  record InviteResponse(
      UUID id,
      UUID createdBy,
      Instant createdAt,
      Instant expiresAt,
      @JsonInclude(JsonInclude.Include.NON_NULL) @Nullable String url) {

    static InviteResponse of(Invite invite, @Nullable String url) {
      return new InviteResponse(
          invite.id(), invite.createdBy(), invite.createdAt(), invite.expiresAt(), url);
    }
  }

  record InviteLinkResponse(Instant expiresAt) {}
}
