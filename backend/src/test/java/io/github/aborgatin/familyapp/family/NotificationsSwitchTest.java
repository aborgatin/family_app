package io.github.aborgatin.familyapp.family;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The Notifications switch (spec #104, ticket #107): a field of the Member's own profile, off by
 * default, changed by the profile {@code PATCH} and returned with the session.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class NotificationsSwitchTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;

  @BeforeEach
  void annaIsLoggedIn() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
  }

  @Test
  void theSwitchIsOffForANewMember() throws Exception {
    anna.openApp().andExpect(jsonPath("$.member.notificationsEnabled").value(false));

    // Boris is added by JDBC without the column: the database default.
    Browser boris = SyncRequests.loginBoris(mvc, jdbc);
    boris.openApp().andExpect(jsonPath("$.member.notificationsEnabled").value(false));
  }

  @Test
  void aMemberTurnsTheSwitchOnAndOffAndOnlyThatChanges() throws Exception {
    anna.patchJson("/api/members/me", "{\"notificationsEnabled\":true}")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.notificationsEnabled").value(true))
        .andExpect(jsonPath("$.displayName").value("Анна"))
        .andExpect(jsonPath("$.grammaticalGender").value("FEMININE"));
    anna.openApp().andExpect(jsonPath("$.member.notificationsEnabled").value(true));

    anna.patchJson("/api/members/me", "{\"displayName\":\"Аня\"}")
        .andExpect(jsonPath("$.notificationsEnabled").value(true));

    anna.patchJson("/api/members/me", "{\"notificationsEnabled\":false}")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.notificationsEnabled").value(false));
    anna.openApp().andExpect(jsonPath("$.member.notificationsEnabled").value(false));
  }

  @Test
  void theSwitchTakesOnlyTrueOrFalse() throws Exception {
    anna.patchJson("/api/members/me", "{\"notificationsEnabled\":\"yes\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='notificationsEnabled')].code")
                .value("value.invalid"));
    anna.patchJson("/api/members/me", "{\"notificationsEnabled\":null}")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.params.errors[?(@.field=='notificationsEnabled')].code").value("required"));

    anna.openApp().andExpect(jsonPath("$.member.notificationsEnabled").value(false));
  }
}
