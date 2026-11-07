package io.github.aborgatin.familyapp.family.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Starts a session for a Member on this device. Used by every way of getting in (bootstrap now;
 * login, Invite acceptance and password reset later), so each gets session fixation protection: a
 * session the request already had gets a new id before the Member is stored in it.
 */
@ConditionalOnWebApplication
@Component
class SessionLogin {

  private final SecurityContextRepository securityContextRepository;

  SessionLogin(SecurityContextRepository securityContextRepository) {
    this.securityContextRepository = securityContextRepository;
  }

  void logIn(UUID memberId, HttpServletRequest request, HttpServletResponse response) {
    if (request.getSession(false) != null) {
      request.changeSessionId();
    } else {
      request.getSession(true);
    }
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
        UsernamePasswordAuthenticationToken.authenticated(
            new AuthenticatedMember(memberId), null, List.of()));
    SecurityContextHolder.setContext(context);
    securityContextRepository.saveContext(context, request, response);
  }
}
