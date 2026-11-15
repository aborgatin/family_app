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
  // Web Push with VAPID (spec #104). Only its request building (VAPID header, aes128gcm payload)
  // is used; WebPushGateway sends with the JDK's HttpClient, so neither HTTP client it brings is
  // needed. Its Bouncy Castle and jose4j are replaced by maintained versions (same packages).
  implementation("nl.martijndwars:web-push:5.1.2") {
    exclude(group = "org.asynchttpclient", module = "async-http-client")
    exclude(group = "org.apache.httpcomponents", module = "httpasyncclient")
    exclude(group = "com.beust", module = "jcommander")
    exclude(group = "org.bouncycastle", module = "bcprov-jdk15on")
    exclude(group = "org.bitbucket.b_c", module = "jose4j")
  }
  implementation("org.bouncycastle:bcprov-jdk18on:1.80")
  implementation("org.bitbucket.b_c:jose4j:0.9.6")

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

// The Child color palette is defined once, in the web app's shared folder (spec #5: "shared by API
// validation and the web picker"); the backend reads the same file from its classpath.
tasks.processResources {
  from("../web/src/shared/palette/childColors.json") { into("palette") }
}

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
