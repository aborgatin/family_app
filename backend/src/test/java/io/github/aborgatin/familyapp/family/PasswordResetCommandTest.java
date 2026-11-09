package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FamilyAppApplication;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.command.Commands;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * The operator's password reset command (spec #5 stories 22 and 24; ticket #21). It runs the real
 * entry point the Docker image runs ({@code java -jar app.jar reset-password <email>}) against the
 * test database, without a web server, and checks the printed link through the HTTP API.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class PasswordResetCommandTest {

  private static final Pattern LINK =
      Pattern.compile("https://family\\.example\\.com/reset-password/([A-Za-z0-9_-]{43})\\n");

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired PostgreSQLContainer<?> postgres;

  private final ByteArrayOutputStream out = new ByteArrayOutputStream();
  private final ByteArrayOutputStream err = new ByteArrayOutputStream();

  @BeforeEach
  void annaIsRegistered() throws Exception {
    FreshInstallation.reset(jdbc);
    Browser setup = new Browser(mvc);
    setup.openApp();
    setup
        .postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isCreated());
  }

  @Test
  void printsAOneTimeLinkForAMembersEmail() throws Exception {
    Instant before = Instant.now();

    int exitCode = runCommand("reset-password", " Anna@Example.com ");

    assertThat(exitCode).as(err()).isZero();
    Matcher link = LINK.matcher(out());
    assertThat(link.find()).as(out()).isTrue();

    Browser phone = new Browser(mvc);
    String expiresAt =
        phone
            .get("/api/password-resets/by-token/" + link.group(1))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString()
            .replaceAll(".*\"expiresAt\":\"([^\"]+)\".*", "$1");
    // Default lifetime: one hour.
    assertThat(Instant.parse(expiresAt))
        .isBetween(before.plus(Duration.ofMinutes(59)), Instant.now().plus(Duration.ofHours(1)));
  }

  @Test
  void failsClearlyForAnUnknownEmail() throws Exception {
    int exitCode = runCommand("reset-password", "nobody@example.com");

    assertThat(exitCode).isEqualTo(1);
    assertThat(err()).contains("No Member has the email nobody@example.com");
    assertThat(out()).doesNotContain("reset-password/");
  }

  @Test
  void explainsItsUsageWhenTheEmailIsMissing() {
    int exitCode = runCommand("reset-password");

    assertThat(exitCode).isEqualTo(2);
    assertThat(err()).contains("Usage: reset-password <email>");
  }

  private int runCommand(String... command) {
    String[] args = new String[command.length + 4];
    System.arraycopy(command, 0, args, 0, command.length);
    args[command.length] = "--DATASOURCE_URL=" + postgres.getJdbcUrl();
    args[command.length + 1] = "--DATASOURCE_USERNAME=" + postgres.getUsername();
    args[command.length + 2] = "--DATASOURCE_PASSWORD=" + postgres.getPassword();
    args[command.length + 3] = "--DOMAIN=family.example.com";
    return Commands.run(
        FamilyAppApplication.class,
        args,
        new PrintStream(out, true, StandardCharsets.UTF_8),
        new PrintStream(err, true, StandardCharsets.UTF_8));
  }

  private String out() {
    return out.toString(StandardCharsets.UTF_8);
  }

  private String err() {
    return err.toString(StandardCharsets.UTF_8);
  }
}
