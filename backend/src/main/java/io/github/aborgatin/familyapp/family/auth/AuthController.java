package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.family.member.BootstrapService;
import io.github.aborgatin.familyapp.family.member.Member;
import io.github.aborgatin.familyapp.family.member.MemberRepository;
import io.github.aborgatin.familyapp.family.member.MemberResponse;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

  private final MemberRepository members;
  private final BootstrapService bootstrapService;
  private final SessionLogin sessionLogin;

  AuthController(
      MemberRepository members, BootstrapService bootstrapService, SessionLogin sessionLogin) {
    this.members = members;
    this.bootstrapService = bootstrapService;
    this.sessionLogin = sessionLogin;
  }

  /**
   * Who is logged in on this device, and whether the installation still needs its first Member.
   * Also issues the {@code XSRF-TOKEN} cookie the client sends back on writes.
   */
  @GetMapping("/session")
  SessionResponse session(CsrfToken csrfToken, @Nullable Authentication authentication) {
    csrfToken.getToken(); // Loading the deferred token writes the XSRF-TOKEN cookie.
    MemberResponse member =
        authentication != null && authentication.getPrincipal() instanceof AuthenticatedMember me
            ? members.findByIdAndDeletedFalse(me.memberId()).map(MemberResponse::of).orElse(null)
            : null;
    return new SessionResponse(!members.existsBy(), member);
  }

  /** Registers the first Member of a fresh installation and logs them in on this device. */
  @PostMapping("/bootstrap")
  @ResponseStatus(HttpStatus.CREATED)
  MemberResponse bootstrap(
      @RequestBody RegistrationRequest body,
      HttpServletRequest request,
      HttpServletResponse response) {
    Member member = bootstrapService.bootstrap(body.validate());
    sessionLogin.logIn(member.id(), request, response);
    return MemberResponse.of(member);
  }

  record SessionResponse(boolean bootstrapRequired, @Nullable MemberResponse member) {}
}
