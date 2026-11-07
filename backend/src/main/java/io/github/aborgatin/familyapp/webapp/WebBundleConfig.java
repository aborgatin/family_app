package io.github.aborgatin.familyapp.webapp;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Any GET outside {@code /api} and {@code /actuator} is answered from the bundle: the file itself
 * if it exists, otherwise {@code index.html} so the client router can handle deep links.
 */
@Configuration(proxyBeanMethods = false)
class WebBundleConfig implements WebMvcConfigurer {

  private static final String BUNDLE_LOCATION = "classpath:/static/";
  private static final String INDEX = "index.html";

  /**
   * The bundle is public: the app shell must load before anyone logs in. This chain only matches
   * bundle requests, so the API's own chain stays in charge of {@code /api} and {@code /actuator}.
   */
  @Bean
  @Order(Ordered.HIGHEST_PRECEDENCE)
  SecurityFilterChain webBundleSecurityFilterChain(HttpSecurity http) throws Exception {
    return http.securityMatcher(WebBundleConfig::isBundleRequest)
        .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
        .requestCache(cache -> cache.disable())
        .build();
  }

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry
        .addResourceHandler("/**")
        .addResourceLocations(BUNDLE_LOCATION)
        .resourceChain(true)
        .addResolver(new SpaFallbackResolver());
  }

  static boolean isBundleRequest(HttpServletRequest request) {
    String method = request.getMethod();
    if (!"GET".equals(method) && !"HEAD".equals(method)) {
      return false;
    }
    String path = request.getRequestURI().substring(request.getContextPath().length());
    return !isServerPath(path.startsWith("/") ? path.substring(1) : path);
  }

  /** {@code path} is relative to the context root, without a leading slash. */
  private static boolean isServerPath(String path) {
    return isUnder(path, "api") || isUnder(path, "actuator");
  }

  private static boolean isUnder(String path, String prefix) {
    return path.equals(prefix) || path.startsWith(prefix + "/");
  }

  private static final class SpaFallbackResolver extends PathResourceResolver {

    @Override
    protected Resource getResource(String resourcePath, Resource location) throws IOException {
      Resource requested = super.getResource(resourcePath, location);
      if (requested != null || isServerPath(resourcePath)) {
        return requested;
      }
      return super.getResource(INDEX, location);
    }
  }
}
