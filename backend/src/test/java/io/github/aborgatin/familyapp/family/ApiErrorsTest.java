package io.github.aborgatin.familyapp.family;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.PostgresTestcontainer;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Error responses are always {@code {code, params}} and never natural-language text (I1). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ApiErrorsTest {

  private static final String BODY =
      """
      {"email":"anna@example.com","password":"secret123","displayName":"Анна",
       "grammaticalGender":"FEMININE"}
      """;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstallation() {
    FreshInstallation.reset(jdbc);
  }

  @Test
  void unauthenticatedApiCallsGetAuthRequired() throws Exception {
    expectError(mvc.perform(get("/api/members")), "auth.required").andExpect(status().is(401));
    expectError(mvc.perform(get("/api/anything/else")), "auth.required")
        .andExpect(status().is(401));
  }

  @Test
  void writeWithoutCsrfTokenIsRejected() throws Exception {
    expectError(
            mvc.perform(
                post("/api/auth/bootstrap").contentType(MediaType.APPLICATION_JSON).content(BODY)),
            "auth.csrf_invalid")
        .andExpect(status().isForbidden());

    new Browser(mvc).openApp().andExpect(jsonPath("$.bootstrapRequired").value(true));
  }

  @Test
  void writeWithWrongCsrfTokenIsRejected() throws Exception {
    expectError(
            mvc.perform(
                post("/api/auth/bootstrap")
                    .cookie(new Cookie("XSRF-TOKEN", "the-real-token"))
                    .header("X-XSRF-TOKEN", "a-forged-token")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(BODY)),
            "auth.csrf_invalid")
        .andExpect(status().isForbidden());
  }

  @Test
  void validationFailureHasCodeAndFieldCodesOnly() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    expectError(browser.postJson("/api/auth/bootstrap", "{}"), "validation.failed")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.params", aMapWithSize(1)))
        .andExpect(jsonPath("$.params.errors[0]", aMapWithSize(2)));
  }

  @Test
  void malformedJsonIsACodeToo() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();

    expectError(browser.postJson("/api/auth/bootstrap", "{not json"), "request.invalid")
        .andExpect(status().isBadRequest());
  }

  @Test
  void unknownApiPathForAMemberIsNotFoundCode() throws Exception {
    Browser browser = new Browser(mvc);
    browser.openApp();
    browser.postJson("/api/auth/bootstrap", BODY).andExpect(status().isCreated());

    expectError(browser.get("/api/no-such-thing"), "not_found").andExpect(status().isNotFound());
  }

  private static ResultActions expectError(ResultActions result, String code) throws Exception {
    return result
        .andExpect(jsonPath("$.code").value(code))
        .andExpect(jsonPath("$.params").isMap())
        .andExpect(jsonPath("$", aMapWithSize(2)));
  }
}
