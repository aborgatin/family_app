package io.github.aborgatin.familyapp;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

/**
 * Times come from the one injected {@code Clock} bean ({@link TimeConfig}), never from a bare
 * {@code now()}, so a test can fix them (backend.md "Testing"; the M2 retro, #65).
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
        .because("times come from the injected Clock bean, so tests can fix them (backend.md)")
        .check(main);
  }

  @Test
  void onlyTheClockBeanReadsTheSystemClock() {
    noClasses()
        .that()
        .doNotHaveFullyQualifiedName(TimeConfig.class.getName())
        .should()
        .callMethod(Clock.class, "systemUTC")
        .orShould()
        .callMethod(Clock.class, "systemDefaultZone")
        .orShould()
        .callMethod(Clock.class, "system", ZoneId.class)
        .because(
            "every class takes the one Clock bean by injection, so a test can replace it with a"
                + " fixed clock (backend.md)")
        .check(main);
  }
}
