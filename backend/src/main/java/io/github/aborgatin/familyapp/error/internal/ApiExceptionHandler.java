package io.github.aborgatin.familyapp.error.internal;

import io.github.aborgatin.familyapp.error.ApiError;
import io.github.aborgatin.familyapp.error.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * The single exception-to-code mapping for MVC handlers (spec #5, I1). Security failures that never
 * reach a controller are written by the {@code family} module's security handlers in the same
 * shape.
 */
@RestControllerAdvice
class ApiExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  ResponseEntity<ApiError> apiException(ApiException ex) {
    return ResponseEntity.status(ex.status()).body(ex.error());
  }

  /** Unparseable JSON, or a body of the wrong shape. */
  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException ex) {
    return ResponseEntity.badRequest().body(ApiError.of("request.invalid"));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> other(Exception ex) {
    if (ex instanceof ErrorResponse response) {
      HttpStatusCode status = response.getStatusCode();
      return ResponseEntity.status(status).body(ApiError.of(codeFor(status)));
    }
    log.error("Unhandled exception", ex);
    return ResponseEntity.internalServerError().body(ApiError.of("internal.error"));
  }

  private static String codeFor(HttpStatusCode status) {
    if (status.value() == HttpStatus.NOT_FOUND.value()) {
      return "not_found";
    }
    if (status.value() == HttpStatus.METHOD_NOT_ALLOWED.value()) {
      return "method.not_allowed";
    }
    return status.is4xxClientError() ? "request.invalid" : "internal.error";
  }
}
