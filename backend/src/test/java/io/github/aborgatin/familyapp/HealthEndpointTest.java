package io.github.aborgatin.familyapp;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class HealthEndpointTest {

  @Autowired MockMvc mvc;

  @Test
  void healthIsUpWithoutASession() throws Exception {
    mvc.perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"));
  }

  @Test
  @WithMockUser
  void otherActuatorEndpointsAreNotExposedEvenWithASession() throws Exception {
    mvc.perform(get("/actuator/env")).andExpect(status().isNotFound());
    mvc.perform(get("/actuator/beans")).andExpect(status().isNotFound());
    mvc.perform(get("/actuator/info")).andExpect(status().isNotFound());
  }
}
