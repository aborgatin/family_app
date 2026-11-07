package io.github.aborgatin.familyapp;

import io.github.aborgatin.familyapp.command.Commands;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Application entry point. Every top-level package below this one is a Spring Modulith module
 * (CODING_STANDARDS M1).
 */
@SpringBootApplication
public class FamilyAppApplication {

  /**
   * Starts the web app, or runs an operator command such as {@code reset-password <email>} and
   * exits with its exit code.
   */
  public static void main(String[] args) {
    if (Commands.isCommand(args)) {
      System.exit(Commands.run(FamilyAppApplication.class, args, System.out, System.err));
    }
    SpringApplication.run(FamilyAppApplication.class, args);
  }
}
