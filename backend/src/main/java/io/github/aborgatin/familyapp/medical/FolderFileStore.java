package io.github.aborgatin.familyapp.medical;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

/**
 * The file store of local development ({@code scripts/dev.sh}, {@code DOCUMENTS_FOLDER}): each
 * object a file in a folder, at its key as a relative path. Written to a temporary file first and
 * moved into place, so a reader never sees half an object.
 */
final class FolderFileStore implements FileStore {

  private final Path folder;

  FolderFileStore(Path folder) {
    this.folder = folder.toAbsolutePath().normalize();
  }

  @Override
  public void put(String key, byte[] bytes) {
    Path target = pathOf(key);
    try {
      Files.createDirectories(target.getParent());
      Path partial = Files.createTempFile(target.getParent(), ".partial-", "");
      Files.write(partial, bytes);
      Files.move(partial, target, StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException e) {
      throw new UncheckedIOException("Could not store " + key, e);
    }
  }

  @Override
  public Optional<byte[]> get(String key) {
    try {
      return Optional.of(Files.readAllBytes(pathOf(key)));
    } catch (NoSuchFileException e) {
      return Optional.empty();
    } catch (IOException e) {
      throw new UncheckedIOException("Could not read " + key, e);
    }
  }

  @Override
  public void delete(String key) {
    try {
      Files.deleteIfExists(pathOf(key));
    } catch (IOException e) {
      throw new UncheckedIOException("Could not delete " + key, e);
    }
  }

  /** The file of the object: inside the folder, whatever the key says. */
  private Path pathOf(String key) {
    Path path = folder.resolve(key).normalize();
    if (!path.startsWith(folder) || path.equals(folder)) {
      throw new IllegalArgumentException("Not an object key: " + key);
    }
    return path;
  }
}
