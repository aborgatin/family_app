package io.github.aborgatin.familyapp.notifications;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.aborgatin.familyapp.FakePushGateway;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;
import org.springframework.test.annotation.DirtiesContext;

/**
 * In production a Spring schedule runs the scheduler step at the start of every minute (spec #104
 * "One scheduler step"). The other tests switch the schedule off ({@code
 * notifications.scheduler.enabled}, test {@code application.yml}) and call the step themselves;
 * this one switches it on, so its context is closed afterwards and runs no step during other tests.
 */
@SpringBootTest(properties = "notifications.scheduler.enabled=true")
@Import({PostgresTestcontainer.class, FakePushGateway.Config.class})
@DirtiesContext
class SchedulerScheduleTest {

  @Autowired Set<ScheduledTaskHolder> holders;

  @Test
  void theStepRunsAtTheStartOfEveryMinute() {
    assertThat(
            holders.stream()
                .flatMap(holder -> holder.getScheduledTasks().stream())
                .map(ScheduledTask::getTask)
                .filter(CronTask.class::isInstance)
                .map(task -> ((CronTask) task).getExpression() + " " + task))
        .anySatisfy(
            task -> assertThat(task).startsWith("0 * * * * * ").endsWith("SchedulerConfig.runStep"));
  }
}
