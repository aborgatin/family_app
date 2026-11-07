package io.github.aborgatin.familyapp.error;

import java.util.Map;

/**
 * The body of every error response: a stable machine code plus parameters, never human text (I1).
 * The client maps {@code code} to an i18n key (I3).
 */
public record ApiError(String code, Map<String, Object> params) {

  public ApiError {
    params = Map.copyOf(params);
  }

  public static ApiError of(String code) {
    return new ApiError(code, Map.of());
  }
}
