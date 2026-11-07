package io.github.aborgatin.familyapp.family.auth;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Lets Spring Session's JDBC writes join a surrounding transaction. By default each one runs in a
 * new transaction of its own; with this, a session write made inside a {@code @Transactional}
 * method (ending a Member's sessions in {@link PasswordResetCompletion}) commits or rolls back with
 * it. Outside a transaction, as in the session filter, each write still gets its own transaction.
 */
@ConditionalOnWebApplication
@Configuration(proxyBeanMethods = false)
class SessionTransactionConfig {

  /** Spring Session JDBC picks this up by its name, {@code springSessionTransactionOperations}. */
  @Bean
  TransactionOperations springSessionTransactionOperations(
      PlatformTransactionManager transactions) {
    // PROPAGATION_REQUIRED (the default): join the current transaction, or start one.
    return new TransactionTemplate(transactions);
  }
}
