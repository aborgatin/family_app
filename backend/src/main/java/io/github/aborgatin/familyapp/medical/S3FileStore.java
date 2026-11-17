package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.medical.DocumentsProperties.Bucket;
import java.net.URI;
import java.util.Objects;
import java.util.Optional;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/**
 * The file store of production (ticket #135, ADR-0010): each object in a bucket of an S3-compatible
 * service, Cloudflare R2. Path-style addressing and region {@code auto}, as R2 needs; nothing is
 * sent until the first call, so the app starts without reaching the service. A missing object is
 * empty; any other failure (no bucket, wrong keys, the service down) throws.
 */
final class S3FileStore implements FileStore, AutoCloseable {

  private final S3Client s3;
  private final String endpoint;
  private final String bucket;

  /** A store in the bucket, whose every value is set ({@link DocumentsProperties#bucket()}). */
  S3FileStore(Bucket bucket) {
    this.endpoint = Objects.requireNonNull(bucket.endpoint());
    this.bucket = Objects.requireNonNull(bucket.name());
    this.s3 =
        S3Client.builder()
            .endpointOverride(URI.create(endpoint))
            .region(Region.of("auto"))
            .forcePathStyle(true)
            .credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(
                        Objects.requireNonNull(bucket.accessKeyId()),
                        Objects.requireNonNull(bucket.secretAccessKey()))))
            .httpClientBuilder(UrlConnectionHttpClient.builder())
            .build();
  }

  @Override
  public void put(String key, byte[] bytes) {
    s3.putObject(request -> request.bucket(bucket).key(key), RequestBody.fromBytes(bytes));
  }

  @Override
  public Optional<byte[]> get(String key) {
    try {
      return Optional.of(
          s3.getObjectAsBytes(request -> request.bucket(bucket).key(key)).asByteArray());
    } catch (NoSuchKeyException e) {
      return Optional.empty();
    }
  }

  @Override
  public void delete(String key) {
    s3.deleteObject(request -> request.bucket(bucket).key(key));
  }

  /** The bucket and its endpoint, for the log; never the keys. */
  @Override
  public String toString() {
    return bucket + " at " + endpoint;
  }

  @Override
  public void close() {
    s3.close();
  }
}
