package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The app trusts {@code X-Forwarded-*} only from the Caddy proxy (spec #5: login limits need the
 * real client IP). The proxy's address comes from {@code TRUSTED_PROXIES}; without it no forwarded
 * header is trusted. The tests' requests arrive from 127.0.0.1.
 */
class ForwardedHeadersTest {

  private static final String CLIENT_IP = "203.0.113.7";

  @Nested
  @SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
  @Import({PostgresTestcontainer.class, RequestEcho.class})
  class WithoutATrustedProxy {

    @Autowired TestRestTemplate http;

    @Test
    void forwardedHeadersAreIgnored() {
      assertThat(echoWithForwardedHeaders(http)).isEqualTo("127.0.0.1 http");
    }
  }

  @Nested
  @SpringBootTest(
      webEnvironment = WebEnvironment.RANDOM_PORT,
      properties = "TRUSTED_PROXIES=127\\.0\\.0\\.1")
  @Import({PostgresTestcontainer.class, RequestEcho.class})
  class FromTheTrustedProxy {

    @Autowired TestRestTemplate http;

    @Test
    void clientIpAndSchemeComeFromForwardedHeaders() {
      assertThat(echoWithForwardedHeaders(http)).isEqualTo(CLIENT_IP + " https");
    }
  }

  @Nested
  @SpringBootTest(
      webEnvironment = WebEnvironment.RANDOM_PORT,
      properties = "TRUSTED_PROXIES=172\\.30\\.0\\.10")
  @Import({PostgresTestcontainer.class, RequestEcho.class})
  class FromAnyOtherAddress {

    @Autowired TestRestTemplate http;

    @Test
    void forwardedHeadersAreIgnored() {
      assertThat(echoWithForwardedHeaders(http)).isEqualTo("127.0.0.1 http");
    }
  }

  private static String echoWithForwardedHeaders(TestRestTemplate http) {
    HttpHeaders headers = new HttpHeaders();
    headers.add("X-Forwarded-For", CLIENT_IP);
    headers.add("X-Forwarded-Proto", "https");
    return http.exchange(
            "/test/request-echo", HttpMethod.GET, new HttpEntity<>(headers), String.class)
        .getBody();
  }

  /** Test-only endpoint that shows how the app sees where a request came from. */
  @RestController
  static class RequestEcho {
    @GetMapping("/test/request-echo")
    String echo(HttpServletRequest request) {
      return request.getRemoteAddr() + " " + request.getScheme();
    }
  }
}
