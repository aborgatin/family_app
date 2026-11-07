package io.github.aborgatin.familyapp.family.member;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Password hashing: Spring Security's delegating encoder, bcrypt by default (spec #5). Kept apart
 * from the web security set-up because operator commands, which run without the web server, set
 * passwords too.
 */
@Configuration(proxyBeanMethods = false)
class PasswordEncoderConfig {

  @Bean
  PasswordEncoder passwordEncoder() {
    return PasswordEncoderFactories.createDelegatingPasswordEncoder();
  }
}
