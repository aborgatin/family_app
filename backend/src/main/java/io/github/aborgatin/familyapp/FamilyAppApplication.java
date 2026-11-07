package io.github.aborgatin.familyapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Application entry point. Every top-level package below this one is a Spring Modulith module
 * (CODING_STANDARDS M1).
 */
@SpringBootApplication
public class FamilyAppApplication {

  public static void main(String[] args) {
    SpringApplication.run(FamilyAppApplication.class, args);
  }
}
