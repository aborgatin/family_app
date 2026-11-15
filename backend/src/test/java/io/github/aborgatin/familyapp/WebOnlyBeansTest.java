package io.github.aborgatin.familyapp;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RestController;

/**
 * Operator commands start the application without a web server, so every controller is
 * {@code @ConditionalOnWebApplication} (backend.md "command"). A controller without it still starts
 * in a command, so {@code PasswordResetCommandTest} alone would not notice it missing.
 */
class WebOnlyBeansTest {

  private final JavaClasses main =
      new ClassFileImporter()
          .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
          .importPackages("io.github.aborgatin.familyapp");

  @Test
  void everyControllerIsWebOnly() {
    classes()
        .that()
        .areAnnotatedWith(RestController.class)
        .or()
        .areAnnotatedWith(Controller.class)
        .should()
        .beAnnotatedWith(ConditionalOnWebApplication.class)
        .because("operator commands start without a web server (backend.md \"command\")")
        .check(main);
  }
}
