/**
 * The {@code error} module: the one place that turns failures into the API's error body {@code
 * {"code": "...", "params": {...}}} (CODING_STANDARDS I1). Other modules throw {@link
 * io.github.aborgatin.familyapp.error.ApiException} (or collect {@link
 * io.github.aborgatin.familyapp.error.FieldErrors}) and never write natural-language text.
 */
@ApplicationModule(displayName = "Error responses")
package io.github.aborgatin.familyapp.error;

import org.springframework.modulith.ApplicationModule;
