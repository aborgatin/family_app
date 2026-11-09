package io.github.aborgatin.familyapp;

import jakarta.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * One device talking to the API the way the web client does: it keeps the cookies the server sets
 * and sends the {@code XSRF-TOKEN} cookie back as the {@code X-XSRF-TOKEN} header on writes.
 *
 * <p>Each device has its own client IP, so failed logins in one test never count towards another
 * test's per-IP login limit (the counters live in memory for the whole cached test context).
 */
public final class Browser {

  private static final AtomicInteger nextDevice = new AtomicInteger(1);

  private final MockMvc mvc;
  private final String ip;
  private final Map<String, Cookie> cookies = new LinkedHashMap<>();

  public Browser(MockMvc mvc) {
    this(mvc, newDeviceIp());
  }

  /** A device at a given client IP, e.g. a second device on the same home network. */
  public Browser(MockMvc mvc, String ip) {
    this.mvc = mvc;
    this.ip = ip;
  }

  /** A client IP no other {@code Browser} in this JVM has had. */
  public static String newDeviceIp() {
    int n = nextDevice.getAndIncrement();
    return "10." + ((n >> 16) & 0xff) + "." + ((n >> 8) & 0xff) + "." + (n & 0xff);
  }

  public String ip() {
    return ip;
  }

  /** Opens the app: {@code GET /api/auth/session}, which issues the CSRF cookie. */
  public ResultActions openApp() throws Exception {
    return get("/api/auth/session");
  }

  public ResultActions get(String path) throws Exception {
    return perform(MockMvcRequestBuilders.get(path));
  }

  public ResultActions postJson(String path, String json) throws Exception {
    return write(
        MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON).content(json));
  }

  public ResultActions patchJson(String path, String json) throws Exception {
    return write(
        MockMvcRequestBuilders.patch(path).contentType(MediaType.APPLICATION_JSON).content(json));
  }

  public ResultActions putJson(String path, String json) throws Exception {
    return write(
        MockMvcRequestBuilders.put(path).contentType(MediaType.APPLICATION_JSON).content(json));
  }

  public ResultActions delete(String path) throws Exception {
    return write(MockMvcRequestBuilders.delete(path));
  }

  /** A {@code POST} without a body. */
  public ResultActions post(String path) throws Exception {
    return write(MockMvcRequestBuilders.post(path));
  }

  private ResultActions write(MockHttpServletRequestBuilder request) throws Exception {
    Cookie xsrf = cookies.get("XSRF-TOKEN");
    if (xsrf != null) {
      request.header("X-XSRF-TOKEN", xsrf.getValue());
    }
    return perform(request);
  }

  public String cookie(String name) {
    Cookie cookie = cookies.get(name);
    return cookie == null ? null : cookie.getValue();
  }

  public void setCookie(String name, String value) {
    cookies.put(name, new Cookie(name, value));
  }

  private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
    request.with(
        r -> {
          r.setRemoteAddr(ip);
          return r;
        });
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
