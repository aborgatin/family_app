package io.github.aborgatin.familyapp.medical;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * The file store for tests (spec #128 "File store port"): objects in a map. A test reads what was
 * stored ({@link #object}), loses an object as a provider could ({@link #lose}), and makes deletes
 * fail ({@link #failDeletes}), and looks around while an upload is being stored ({@link
 * #whilePutting}). Import {@link Config} and call {@link #reset} in {@code @BeforeEach}: the
 * context is shared.
 */
final class InMemoryFileStore implements FileStore {

  private final Map<String, byte[]> objects = new ConcurrentHashMap<>();
  private volatile boolean failingDeletes;
  private volatile Runnable onPut = () -> {};

  @Override
  public void put(String key, byte[] bytes) {
    onPut.run();
    objects.put(key, bytes.clone());
  }

  @Override
  public Optional<byte[]> get(String key) {
    return Optional.ofNullable(objects.get(key)).map(byte[]::clone);
  }

  @Override
  public void delete(String key) {
    if (failingDeletes) {
      throw new IllegalStateException("The store is unavailable (a test's failDeletes)");
    }
    objects.remove(key);
  }

  /** The stored bytes of the object, or empty when there is none. */
  Optional<byte[]> object(String key) {
    return get(key);
  }

  /** The keys of every stored object. */
  Set<String> keys() {
    return Map.copyOf(objects).keySet();
  }

  /** Loses the object, as a failed upload or the provider could. */
  void lose(String key) {
    objects.remove(key);
  }

  /** From now on, every delete throws. */
  void failDeletes() {
    failingDeletes = true;
  }

  /** From now on, runs {@code check} in every put, while the upload's request is still open. */
  void whilePutting(Runnable check) {
    onPut = check;
  }

  void reset() {
    objects.clear();
    failingDeletes = false;
    onPut = () -> {};
  }

  /** Puts an {@code InMemoryFileStore} in the context, in place of the configured store. */
  @TestConfiguration(proxyBeanMethods = false)
  static class Config {

    @Bean
    @Primary
    InMemoryFileStore inMemoryFileStore() {
      return new InMemoryFileStore();
    }
  }
}
