package io.github.aborgatin.familyapp;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModule;
import org.springframework.modulith.core.ApplicationModules;

/** Module structure (spec #5, seam 1b; CODING_STANDARDS M1/M2). */
class ModularityTest {

  private final ApplicationModules modules = ApplicationModules.of(FamilyAppApplication.class);

  @Test
  void modulesHaveNoCyclesAndUseOnlyEachOthersPublicApi() {
    modules.verify();
  }

  @Test
  void familyIsATopLevelModule() {
    assertThat(modules.stream().map(ApplicationModule::getBasePackage))
        .extracting(pkg -> pkg.getName())
        .contains("io.github.aborgatin.familyapp.family");
  }
}
