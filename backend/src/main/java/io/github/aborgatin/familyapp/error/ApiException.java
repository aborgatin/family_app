package io.github.aborgatin.familyapp.error;

import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * A failure the API reports to the client as {@code status} with the body {@code {code, params}}.
 * The message is the code, for logs only; it never reaches the client as text.
 */
public class ApiException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final HttpStatus status;
  private final transient ApiError error;

  public ApiException(HttpStatus status, String code) {
    this(status, code, Map.of());
  }

  public ApiException(HttpStatus status, String code, Map<String, Object> params) {
    super(code);
    this.status = status;
    this.error = new ApiError(code, params);
  }

  public HttpStatus status() {
    return status;
  }

  public ApiError error() {
    return error;
  }
}
