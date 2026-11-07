package io.github.aborgatin.familyapp.family.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.CookieSerializer.CookieValue;
import org.springframework.session.web.http.SessionRepositoryFilter;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Makes the session cookie's {@code Max-Age} slide. Spring Session renews the session on the server
 * with every request, but writes the cookie only when the session id changes, so the browser would
 * drop it {@code SESSION_TIMEOUT} after login however active the Member is. This filter re-sends
 * the cookie (same id, fresh {@code Max-Age}) on every request that carries a valid session.
 */
@Component
class SlidingSessionCookieFilter extends OncePerRequestFilter implements Ordered {

  private final CookieSerializer cookieSerializer;

  SlidingSessionCookieFilter(CookieSerializer cookieSerializer) {
    this.cookieSerializer = cookieSerializer;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (request.isRequestedSessionIdValid()) {
      HttpSession session = request.getSession(false);
      if (session != null) {
        cookieSerializer.writeCookieValue(new CookieValue(request, response, session.getId()));
      }
    }
    chain.doFilter(request, response);
  }

  @Override
  public int getOrder() {
    return SessionRepositoryFilter.DEFAULT_ORDER + 1;
  }
}
