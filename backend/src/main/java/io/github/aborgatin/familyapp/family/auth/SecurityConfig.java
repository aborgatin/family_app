package io.github.aborgatin.familyapp.family.auth;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * Security for the whole app (spec #5, Authentication & session). Every {@code /api/**} endpoint
 * needs a session except the public ones listed here; failures are {@code {code, params}} bodies,
 * never redirects or HTML.
 *
 * <p>CSRF uses the SPA pattern: the {@code XSRF-TOKEN} cookie is readable by JS and comes back as
 * the {@code X-XSRF-TOKEN} header on every non-GET request. The token is sent back raw (no
 * per-request masking), which is what the web client does.
 */
@ConditionalOnWebApplication
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http, ApiErrorWriter errors, SecurityContextRepository securityContextRepository)
      throws Exception {
    CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfTokens.setCookieCustomizer(cookie -> cookie.path("/").secure(true).sameSite("Lax"));

    http.authorizeHttpRequests(
            requests ->
                requests
                    .requestMatchers("/actuator/health")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/auth/session")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/auth/bootstrap", "/api/auth/login")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/invites/by-token/*")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/invites/by-token/*/accept")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/password-resets/by-token/*")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/password-resets/by-token/*/complete")
                    .permitAll()
                    .requestMatchers("/api/**", "/actuator/**")
                    .authenticated()
                    // The web bundle and its SPA routes are public.
                    .anyRequest()
                    .permitAll())
        .csrf(
            csrf ->
                csrf.csrfTokenRepository(csrfTokens)
                    .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
        .securityContext(context -> context.securityContextRepository(securityContextRepository))
        .exceptionHandling(
            exceptions ->
                exceptions
                    .authenticationEntryPoint(
                        (request, response, ex) ->
                            errors.write(response, HttpStatus.UNAUTHORIZED, "auth.required"))
                    // No rule checks roles, so the only access denial is a CSRF failure; an
                    // anonymous request to a protected endpoint goes to the entry point above.
                    .accessDeniedHandler(
                        (request, response, ex) ->
                            errors.write(response, HttpStatus.FORBIDDEN, "auth.csrf_invalid")))
        .requestCache(cache -> cache.disable())
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable);
    return http.build();
  }

  @Bean
  SecurityContextRepository securityContextRepository() {
    return new HttpSessionSecurityContextRepository();
  }
}
