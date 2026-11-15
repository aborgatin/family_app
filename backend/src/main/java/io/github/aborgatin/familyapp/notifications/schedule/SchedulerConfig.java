package io.github.aborgatin.familyapp.notifications.schedule;

import io.github.aborgatin.familyapp.notifications.SchedulerStep;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Runs the scheduler step at the start of every minute (spec #104 "One scheduler step"), in the
 * running app only: not in an operator command, and not in tests, which set {@code
 * notifications.scheduler.enabled} to {@code false} and call the step themselves.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnWebApplication
@ConditionalOnProperty(name = "notifications.scheduler.enabled", matchIfMissing = true)
class SchedulerConfig {

  private final SchedulerStep step;

  SchedulerConfig(SchedulerStep step) {
    this.step = step;
  }

  @Scheduled(cron = "0 * * * * *")
  void runStep() {
    step.run();
  }
}
