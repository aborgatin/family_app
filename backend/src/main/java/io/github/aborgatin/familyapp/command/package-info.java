/**
 * The {@code command} module: operator commands run on the server through Docker Compose, e.g.
 * {@code docker compose run --rm app reset-password <email>}. A command starts the application
 * without the web server, does its job through other modules' public API and exits.
 */
@ApplicationModule(displayName = "Operator commands")
package io.github.aborgatin.familyapp.command;

import org.springframework.modulith.ApplicationModule;
