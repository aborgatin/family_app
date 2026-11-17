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
 * (local development), otherwise the bucket of the {@code DOCUMENTS_S3_*} settings (production,
 * Cloudflare R2), which {@link DocumentsProperties} then requires.
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
    S3FileStore store = new S3FileStore(properties.bucket());
    log.info("Document files are stored in the bucket {}", store);
    return store;
  }
}
