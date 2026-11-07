package io.github.aborgatin.familyapp.family.auth;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.family.member.BootstrapService;
import io.github.aborgatin.familyapp.family.member.LoginService;
import io.github.aborgatin.familyapp.family.member.Member;
import io.github.aborgatin.familyapp.family.member.MemberRepository;
import io.github.aborgatin.familyapp.family.member.MemberResponse;
import io.github.aborgatin.familyapp.family.member.RegistrationRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@ConditionalOnWebApplication
@RestController
@RequestMapping("/api/auth")
class AuthController {

  private final MemberRepository members;
  private final BootstrapService bootstrapService;
  private final SessionLogin sessionLogin;
  private final LoginService loginService;
  private final LoginLimits loginLimits;

  AuthController(
      MemberRepository members,
      BootstrapService bootstrapService,
      SessionLogin sessionLogin,
      LoginService loginService,
      LoginLimits loginLimits) {
    this.members = members;
    this.bootstrapService = bootstrapService;
    this.sessionLogin = sessionLogin;
    this.loginService = loginService;
    this.loginLimits = loginLimits;
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

  /**
   * Logs a Member in on this device with a new session id. Unknown email and wrong password give
   * the same {@code 401 auth.invalid_credentials}.
   */
  @PostMapping("/login")
  MemberResponse login(
      @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
    String email = LoginService.normalizeEmail(body.email() == null ? "" : body.email());
    String password = body.password() == null ? "" : body.password();
    // Behind Caddy this is the real client IP (forwarded headers are trusted from Caddy only).
    String ip = request.getRemoteAddr();

    Optional<Duration> retryAfter = loginLimits.retryAfter(email, ip);
    if (retryAfter.isPresent()) {
      long seconds = Math.max(1, (retryAfter.get().toMillis() + 999) / 1000);
      response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(seconds));
      throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          "auth.too_many_attempts",
          Map.of("retryAfterSeconds", seconds));
    }

    Optional<Member> member = loginService.authenticate(email, password);
    if (member.isEmpty()) {
      loginLimits.failed(email, ip);
      throw new ApiException(HttpStatus.UNAUTHORIZED, "auth.invalid_credentials");
    }
    loginLimits.succeeded(email);
    sessionLogin.logIn(member.get().id(), request, response);
    return MemberResponse.of(member.get());
  }

  /** Ends this device's session only; the Member's other devices stay logged in. */
  @PostMapping("/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void logout(HttpServletRequest request) {
    HttpSession session = request.getSession(false);
    if (session != null) {
      session.invalidate();
    }
    SecurityContextHolder.clearContext();
  }

  record LoginRequest(@Nullable String email, @Nullable String password) {}

  record SessionResponse(boolean bootstrapRequired, @Nullable MemberResponse member) {}
}
