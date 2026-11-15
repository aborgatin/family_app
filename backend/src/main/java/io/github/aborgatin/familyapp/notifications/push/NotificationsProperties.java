package io.github.aborgatin.familyapp.notifications.push;

import java.time.LocalTime;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The {@code notifications} settings of {@code application.yml} (spec #104, Configuration;
 * backend.md "Configuration"). The VAPID key pair and subject are required: without them the app
 * does not start, and the message names the missing variable.
 *
 * @param vapid {@code VAPID_PUBLIC_KEY}, {@code VAPID_PRIVATE_KEY}, {@code VAPID_SUBJECT}
 * @param reminderMorningTime {@code REMINDER_MORNING_TIME}: when a Due date without a time is due,
 *     in the installation's {@code TZ} (default {@code 09:00})
 */
@ConfigurationProperties("notifications")
public record NotificationsProperties(Vapid vapid, LocalTime reminderMorningTime) {

  static final String HOW_TO_GENERATE =
      " Generate a key pair with `docker run --rm ghcr.io/aborgatin/family_app generate-vapid-keys`"
          + " (deployment.md \"Environment variables\").";

  public NotificationsProperties {
    if (vapid == null) {
      vapid = new Vapid(null, null, null);
    }
    if (reminderMorningTime == null) {
      throw new IllegalArgumentException(
          "REMINDER_MORNING_TIME must be a time of day, e.g. 09:00.");
    }
  }

  /**
   * The application server's VAPID identity: the key pair (base64url, as browsers and {@code
   * generate-vapid-keys} give them) and the {@code mailto:} contact push services may use.
   */
  public record Vapid(String publicKey, String privateKey, String subject) {

    public Vapid {
      require("VAPID_PUBLIC_KEY", publicKey);
      require("VAPID_PRIVATE_KEY", privateKey);
      require("VAPID_SUBJECT", subject);
      if (!subject.startsWith("mailto:")) {
        throw new IllegalArgumentException(
            "VAPID_SUBJECT must be a mailto: address, e.g. mailto:you@example.com.");
      }
    }

    private static void require(String variable, String value) {
      if (value == null || value.isBlank()) {
        throw new IllegalArgumentException(variable + " is required." + HOW_TO_GENERATE);
      }
    }
  }
}
