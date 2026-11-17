package io.github.aborgatin.familyapp.medical;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

/**
 * What a Document's file is, told by its content, not by the name or the type the browser declared
 * (spec #128, D19): a PDF, a JPEG, a PNG, or a HEIC/HEIF photo (an iPhone's). Anything else is
 * {@code document.unsupported_type}. Each has its content type (stored on the Document and sent
 * with the file) and its file-name extension.
 */
enum DocumentType {
  PDF("application/pdf", ".pdf"),
  JPEG("image/jpeg", ".jpg"),
  PNG("image/png", ".png"),
  HEIC("image/heic", ".heic"),
  HEIF("image/heif", ".heif");

  private static final byte[] PDF_START = "%PDF-".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] JPEG_START = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
  private static final byte[] PNG_START = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};

  /** ISO base media brands of HEIC (HEVC-coded) images and image sequences. */
  private static final Set<String> HEIC_BRANDS =
      Set.of("heic", "heix", "heim", "heis", "hevc", "hevx");

  /** Brands of HEIF images in general (any codec). */
  private static final Set<String> HEIF_BRANDS = Set.of("mif1", "msf1");

  private final String contentType;
  private final String extension;

  DocumentType(String contentType, String extension) {
    this.contentType = contentType;
    this.extension = extension;
  }

  String contentType() {
    return contentType;
  }

  /** The file-name extension, such as {@code .pdf}. */
  String extension() {
    return extension;
  }

  /** The type of the file, or empty when it isn't one a Document may be. */
  static Optional<DocumentType> of(byte[] file) {
    if (startsWith(file, PDF_START)) {
      return Optional.of(PDF);
    }
    if (startsWith(file, JPEG_START)) {
      return Optional.of(JPEG);
    }
    if (startsWith(file, PNG_START)) {
      return Optional.of(PNG);
    }
    // An ISO base media file: a box size (4 bytes), "ftyp", then the major brand.
    if (file.length >= 12 && "ftyp".equals(ascii(file, 4))) {
      String brand = ascii(file, 8);
      if (HEIC_BRANDS.contains(brand)) {
        return Optional.of(HEIC);
      }
      if (HEIF_BRANDS.contains(brand)) {
        return Optional.of(HEIF);
      }
    }
    return Optional.empty();
  }

  /** The type a stored Document's content type names. */
  static DocumentType ofContentType(String contentType) {
    return Arrays.stream(values())
        .filter(type -> type.contentType.equals(contentType))
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("Not a Document type: " + contentType));
  }

  private static boolean startsWith(byte[] file, byte[] prefix) {
    return file.length >= prefix.length
        && Arrays.equals(Arrays.copyOf(file, prefix.length), prefix);
  }

  private static String ascii(byte[] file, int from) {
    return new String(file, from, 4, StandardCharsets.US_ASCII);
  }
}
