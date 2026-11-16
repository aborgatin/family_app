package io.github.aborgatin.familyapp.medical;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

/**
 * What a Document's file is, told by its content, not by the name or the type the browser declared
 * (spec #128, D19): a PDF, a JPEG, a PNG, or a HEIC/HEIF photo (an iPhone's). Anything else is
 * {@code document.unsupported_type}.
 */
final class DocumentType {

  private DocumentType() {}

  private static final byte[] PDF = "%PDF-".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

  /** ISO base media brands of HEIC (HEVC-coded) images and image sequences. */
  private static final Set<String> HEIC_BRANDS =
      Set.of("heic", "heix", "heim", "heis", "hevc", "hevx");

  /** Brands of HEIF images in general (any codec). */
  private static final Set<String> HEIF_BRANDS = Set.of("mif1", "msf1");

  /** The content type of the file, or empty when it isn't one a Document may be. */
  static Optional<String> of(byte[] file) {
    if (startsWith(file, PDF)) {
      return Optional.of("application/pdf");
    }
    if (startsWith(file, JPEG)) {
      return Optional.of("image/jpeg");
    }
    if (startsWith(file, PNG)) {
      return Optional.of("image/png");
    }
    // An ISO base media file: a box size (4 bytes), "ftyp", then the major brand.
    if (file.length >= 12 && "ftyp".equals(ascii(file, 4))) {
      String brand = ascii(file, 8);
      if (HEIC_BRANDS.contains(brand)) {
        return Optional.of("image/heic");
      }
      if (HEIF_BRANDS.contains(brand)) {
        return Optional.of("image/heif");
      }
    }
    return Optional.empty();
  }

  /** The file-name extension of a content type {@link #of} answers, such as {@code .pdf}. */
  static String extension(String contentType) {
    return switch (contentType) {
      case "application/pdf" -> ".pdf";
      case "image/jpeg" -> ".jpg";
      case "image/png" -> ".png";
      case "image/heic" -> ".heic";
      case "image/heif" -> ".heif";
      default -> "";
    };
  }

  private static boolean startsWith(byte[] file, byte[] prefix) {
    return file.length >= prefix.length
        && Arrays.equals(Arrays.copyOf(file, prefix.length), prefix);
  }

  private static String ascii(byte[] file, int from) {
    return new String(file, from, 4, StandardCharsets.US_ASCII);
  }
}
