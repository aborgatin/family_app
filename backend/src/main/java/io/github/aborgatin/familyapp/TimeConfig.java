package io.github.aborgatin.familyapp;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The one {@link Clock} every class takes by injection, so a test can replace it with a fixed clock
 * (backend.md "Testing"). {@code ClockTest} fails on {@code Clock.system…()} anywhere else.
 */
@Configuration(proxyBeanMethods = false)
class TimeConfig {

  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }
}
