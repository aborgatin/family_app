package io.github.aborgatin.familyapp.family;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class AuthSessionTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstallation() {
    FreshInstallation.reset(jdbc);
  }

  @Test
  void freshInstallationRequiresBootstrapAndHasNoMember() throws Exception {
    mvc.perform(get("/api/auth/session"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.bootstrapRequired").value(true))
        .andExpect(jsonPath("$.member").isEmpty())
        .andExpect(cookie().exists("XSRF-TOKEN"))
        .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
  }
}
