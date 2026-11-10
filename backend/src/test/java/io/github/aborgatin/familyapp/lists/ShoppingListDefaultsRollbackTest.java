package io.github.aborgatin.familyapp.lists;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.family.FirstMemberRegistered;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The Default Shopping lists are written in the bootstrap transaction (spec #4 "Defaults"; ticket
 * #76): when writing the Defaults fails, the first Member is not registered either, and the
 * installation stays fresh (and no List can outlive it: {@code list.owner_id} references the
 * Member). {@link FailingDefaults} stands in for a Defaults listener that throws.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, ShoppingListDefaultsRollbackTest.FailingDefaults.class})
class ShoppingListDefaultsRollbackTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstallation() {
    FreshInstallation.reset(jdbc);
  }

  @Test
  void aFailureWritingTheDefaultsRollsTheRegistrationBack() throws Exception {
    Browser anna = new Browser(mvc);
    anna.openApp();

    anna.postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isInternalServerError());

    new Browser(mvc)
        .openApp()
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.bootstrapRequired").value(true));
  }

  /** A Defaults listener whose write fails. */
  @TestConfiguration
  static class FailingDefaults {

    @EventListener
    void onFirstMemberRegistered(FirstMemberRegistered event) {
      throw new IllegalStateException("writing the Defaults failed");
    }
  }
}
