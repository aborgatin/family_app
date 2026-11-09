package io.github.aborgatin.familyapp;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

/**
 * Times come from a {@code Clock} field ({@code Clock.systemUTC()}), never from a bare {@code
 * now()}, so a test can fix them (backend.md "Testing"; the M2 retro, #65).
 */
class ClockTest {

  private final JavaClasses main =
      new ClassFileImporter()
          .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
          .importPackages("io.github.aborgatin.familyapp");

  @Test
  void mainCodeReadsTimeFromAClock() {
    noClasses()
        .should()
        .callMethod(Instant.class, "now")
        .orShould()
        .callMethod(LocalDate.class, "now")
        .orShould()
        .callMethod(LocalDateTime.class, "now")
        .orShould()
        .callMethod(LocalTime.class, "now")
        .orShould()
        .callMethod(OffsetDateTime.class, "now")
        .orShould()
        .callMethod(ZonedDateTime.class, "now")
        .because("times come from a Clock field, so tests can fix them (backend.md)")
        .check(main);
  }
}
