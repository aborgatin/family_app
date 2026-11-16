package io.github.aborgatin.familyapp.medical;

import java.nio.file.Path;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The {@link FileStore} the configuration selects: a folder when {@code DOCUMENTS_FOLDER} is set
 * (local development). Without one, until the R2 store comes (ticket #135), no store: uploads fail
 * and every file is missing, and the app says so at startup.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(DocumentsProperties.class)
class DocumentsConfig {

  private static final Logger log = LoggerFactory.getLogger(DocumentsConfig.class);

  @Bean
  FileStore fileStore(DocumentsProperties properties) {
    Optional<Path> folder = properties.folderPath();
    if (folder.isPresent()) {
      log.info("Document files are stored in the folder {}", folder.get());
      return new FolderFileStore(folder.get());
    }
    log.warn("No file store is configured (DOCUMENTS_FOLDER): Documents can't be uploaded");
    return new FileStore() {
      @Override
      public void put(String key, byte[] bytes) {
        throw new IllegalStateException("No file store is configured (DOCUMENTS_FOLDER)");
      }

      @Override
      public Optional<byte[]> get(String key) {
        return Optional.empty();
      }

      @Override
      public void delete(String key) {
        // Nothing is ever stored.
      }
    };
  }
}
