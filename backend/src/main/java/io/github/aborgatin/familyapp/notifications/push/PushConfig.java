package io.github.aborgatin.familyapp.notifications.push;

import io.github.aborgatin.familyapp.notifications.PushGateway;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The real push gateway, configured from {@link NotificationsProperties}. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(NotificationsProperties.class)
class PushConfig {

  @Bean
  PushGateway webPushGateway(NotificationsProperties properties) {
    return new WebPushGateway(properties.vapid());
  }
}
