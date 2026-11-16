package io.github.aborgatin.familyapp.family.child;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.HashSet;
import java.util.Set;

/**
 * Reads the codes of a fixed set the web app defines (the Child color palette, the Avatar set): a
 * JSON array of objects with a {@code code}, copied to the classpath by the build.
 */
final class PaletteCodes {

  private PaletteCodes() {}

  static Set<String> load(ObjectMapper json, String resource) {
    try (InputStream in = PaletteCodes.class.getResourceAsStream(resource)) {
      if (in == null) {
        throw new IllegalStateException("Missing classpath resource " + resource);
      }
      Set<String> loaded = new HashSet<>();
      for (JsonNode entry : json.readTree(in)) {
        loaded.add(entry.get("code").asText());
      }
      return Set.copyOf(loaded);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
