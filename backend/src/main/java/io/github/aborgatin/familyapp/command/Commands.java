package io.github.aborgatin.familyapp.command;

import java.io.PrintStream;
import java.util.Arrays;
import java.util.List;
import org.springframework.boot.Banner;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Runs an operator command instead of the web app when the image is started with one, e.g. {@code
 * java -jar app.jar reset-password anna@example.com}. The application starts without the web server
 * (no port is opened, so it can run next to the live app), runs the command and stops. Arguments
 * starting with {@code --} are Spring properties, as for the web app.
 */
public final class Commands {

  static final int EXIT_OK = 0;
  static final int EXIT_FAILED = 1;
  static final int EXIT_USAGE = 2;

  private Commands() {}

  /** Whether these program arguments name a command rather than starting the web app. */
  public static boolean isCommand(String[] args) {
    return args.length > 0 && args[0].equals(PasswordResetCommand.NAME);
  }

  /** Runs the command the arguments name and returns the process exit code. */
  public static int run(Class<?> application, String[] args, PrintStream out, PrintStream err) {
    List<String> commandArgs =
        Arrays.stream(args).skip(1).filter(arg -> !arg.startsWith("--")).toList();
    try (ConfigurableApplicationContext context =
        new SpringApplicationBuilder(application)
            .web(WebApplicationType.NONE)
            .bannerMode(Banner.Mode.OFF)
            .logStartupInfo(false)
            // Keep the output to what the operator needs; LOGGING_LEVEL_ROOT still overrides it.
            .properties("logging.level.root=WARN")
            .run(args)) {
      return context.getBean(PasswordResetCommand.class).run(commandArgs, out, err);
    }
  }
}
