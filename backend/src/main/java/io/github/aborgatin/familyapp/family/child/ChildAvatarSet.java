package io.github.aborgatin.familyapp.family.child;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * The Avatar set: the fixed figures a Child may be shown with (ticket #124). Defined once, in
 * {@code web/src/shared/palette/childAvatars.json}, copied to the classpath like the Child color
 * palette, so API validation and the web picker agree. A presentation choice, not Family data.
 */
@Component
class ChildAvatarSet {

  private static final String RESOURCE = "/palette/childAvatars.json";

  private final Set<String> codes;

  ChildAvatarSet(ObjectMapper json) {
    this.codes = ChildColorPalette.codes(json, RESOURCE);
  }

  boolean contains(String code) {
    return codes.contains(code);
  }
}
