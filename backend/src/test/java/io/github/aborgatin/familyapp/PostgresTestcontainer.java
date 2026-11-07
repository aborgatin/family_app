package io.github.aborgatin.familyapp;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * PostgreSQL 18 in a container, the same major version as production (spec #5, Testing). Import it
 * into any {@code @SpringBootTest}; Spring reuses one container per test context.
 */
@TestConfiguration(proxyBeanMethods = false)
public class PostgresTestcontainer {

  @Bean
  @ServiceConnection
  PostgreSQLContainer<?> postgres() {
    return new PostgreSQLContainer<>(DockerImageName.parse("postgres:18"));
  }
}
