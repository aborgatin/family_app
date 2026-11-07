package io.github.aborgatin.familyapp.family;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** Children in Settings (spec #5 stories 40–45, API contract "Children"). */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildrenTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;

  @BeforeEach
  void annaIsAMember() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = new Browser(mvc);
    anna.openApp();
    anna.postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isCreated());
  }

  @Test
  void memberAddsAChildWithAClientGeneratedId() throws Exception {
    UUID id = UUID.randomUUID();

    anna.putJson(
            "/api/children/" + id,
            """
            {"name":"  Маша  ","color":"coral","birthday":"2019-04-12"}
            """)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(id.toString()))
        .andExpect(jsonPath("$.name").value("Маша"))
        .andExpect(jsonPath("$.color").value("coral"))
        .andExpect(jsonPath("$.birthday").value("2019-04-12"))
        .andExpect(jsonPath("$.version").isNumber())
        .andExpect(jsonPath("$.updatedAt").isString());

    anna.get("/api/children")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].id").value(id.toString()))
        .andExpect(jsonPath("$[0].name").value("Маша"))
        .andExpect(jsonPath("$[0].birthday").value("2019-04-12"));
  }
}
