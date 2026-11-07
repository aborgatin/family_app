package io.github.aborgatin.familyapp.family.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.aborgatin.familyapp.error.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/** Writes {@code {code, params}} for security failures that never reach a controller (I1). */
@Component
class ApiErrorWriter {

  private final ObjectMapper objectMapper;

  ApiErrorWriter(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  void write(HttpServletResponse response, HttpStatus status, String code) throws IOException {
    response.setStatus(status.value());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(response.getOutputStream(), ApiError.of(code));
  }
}
