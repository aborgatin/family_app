package io.github.aborgatin.familyapp.family;

import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * One device talking to the API the way the web client does: it keeps the cookies the server sets
 * and sends the {@code XSRF-TOKEN} cookie back as the {@code X-XSRF-TOKEN} header on writes.
 */
final class Browser {

  private final MockMvc mvc;
  private final Map<String, Cookie> cookies = new LinkedHashMap<>();

  Browser(MockMvc mvc) {
    this.mvc = mvc;
  }

  /** Opens the app: {@code GET /api/auth/session}, which issues the CSRF cookie. */
  ResultActions openApp() throws Exception {
    return get("/api/auth/session");
  }

  ResultActions get(String path) throws Exception {
    return perform(MockMvcRequestBuilders.get(path));
  }

  ResultActions postJson(String path, String json) throws Exception {
    return write(
        MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(json));
  }

  /** A {@code POST} without a body. */
  ResultActions post(String path) throws Exception {
    return write(MockMvcRequestBuilders.post(path));
  }

  private ResultActions write(MockHttpServletRequestBuilder request) throws Exception {
    Cookie xsrf = cookies.get("XSRF-TOKEN");
    if (xsrf != null) {
      request.header("X-XSRF-TOKEN", xsrf.getValue());
    }
    return perform(request);
  }

  String cookie(String name) {
    Cookie cookie = cookies.get(name);
    return cookie == null ? null : cookie.getValue();
  }

  void setCookie(String name, String value) {
    cookies.put(name, new Cookie(name, value));
  }

  private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
    if (!cookies.isEmpty()) {
      request.cookie(cookies.values().toArray(Cookie[]::new));
    }
    ResultActions result = mvc.perform(request);
    for (Cookie cookie : result.andReturn().getResponse().getCookies()) {
      if (cookie.getMaxAge() == 0) {
        cookies.remove(cookie.getName());
      } else {
        cookies.put(cookie.getName(), cookie);
      }
    }
    return result;
  }
}
