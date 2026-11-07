import net.ltgt.gradle.errorprone.errorprone

plugins {
  java
  id("org.springframework.boot") version "3.5.16"
  id("io.spring.dependency-management") version "1.1.7"
  id("com.diffplug.spotless") version "8.9.0"
  id("net.ltgt.errorprone") version "5.2.0"
}

group = "io.github.aborgatin"

version = "0.0.1-SNAPSHOT"

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

repositories { mavenCentral() }

// Spring Boot 3.5 manages a Flyway that predates PostgreSQL 18 support; production runs 18.
extra["flyway.version"] = "11.20.3"

dependencyManagement {
  imports { mavenBom("org.springframework.modulith:spring-modulith-bom:1.4.14") }
}

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.boot:spring-boot-starter-security")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.springframework.boot:spring-boot-starter-actuator")
  implementation("org.springframework.session:spring-session-jdbc")
  implementation("org.springframework.modulith:spring-modulith-starter-core")
  implementation("org.flywaydb:flyway-core")
  runtimeOnly("org.flywaydb:flyway-database-postgresql")
  runtimeOnly("org.postgresql:postgresql")

  errorprone("com.google.errorprone:error_prone_core:2.52.0")

  testImplementation("org.springframework.boot:spring-boot-starter-test")
  testImplementation("org.springframework.security:spring-security-test")
  testImplementation("org.springframework.boot:spring-boot-testcontainers")
  testImplementation("org.springframework.modulith:spring-modulith-starter-test")
  testImplementation("org.testcontainers:junit-jupiter")
  testImplementation("org.testcontainers:postgresql")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
  // -parameters keeps Spring's parameter-name binding working. -Werror turns every javac lint and
  // Error Prone warning into a build failure (CODING_STANDARDS "Enforced by tooling"); silencing
  // one needs a @SuppressWarnings with a reason.
  options.compilerArgs.addAll(listOf("-parameters", "-Xlint:all", "-Werror"))
  options.errorprone.disableWarningsInGeneratedCode = true
}

tasks.withType<Test>().configureEach { useJUnitPlatform() }

spotless {
  java {
    googleJavaFormat()
    removeUnusedImports()
    trimTrailingWhitespace()
    endWithNewline()
  }
  kotlinGradle {
    ktfmt().googleStyle()
  }
}
