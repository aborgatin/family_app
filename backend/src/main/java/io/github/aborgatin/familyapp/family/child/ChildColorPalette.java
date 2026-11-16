package io.github.aborgatin.familyapp.family.child;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * The Child color palette: the fixed set of color codes a Child may have. Defined once, in {@code
 * web/src/shared/palette/childColors.json}, which the build copies to {@code palette/} on the
 * classpath, so API validation and the web picker can never disagree. A presentation choice, not
 * Family data (S7).
 */
@Component
class ChildColorPalette {

  private static final String RESOURCE = "/palette/childColors.json";

  private final Set<String> codes;

  ChildColorPalette(ObjectMapper json) {
    this.codes = PaletteCodes.load(json, RESOURCE);
  }

  boolean contains(String code) {
    return codes.contains(code);
  }
}
