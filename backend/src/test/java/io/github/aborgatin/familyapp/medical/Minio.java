package io.github.aborgatin.familyapp.medical;

import static org.assertj.core.api.Assertions.assertThat;

import org.testcontainers.containers.Container.ExecResult;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * MinIO in a container, the S3-compatible server the R2 file store is tested against (ticket #135).
 * The {@code minio/minio} images are no longer published, so this runs the MinIO server built by
 * Pigsty ({@code pgsty/minio}): the same server, with {@code mc} in the image.
 */
final class Minio {

  private Minio() {}

  /** A new, not yet started container. */
  static MinIOContainer container() {
    return new MinIOContainer(
        DockerImageName.parse("pgsty/minio:RELEASE.2026-08-04T00-00-00Z")
            .asCompatibleSubstituteFor("minio/minio"));
  }

  /** Creates the bucket in the started container, as the operator creates it in R2. */
  static void createBucket(MinIOContainer minio, String bucket) throws Exception {
    mc(
        minio,
        "alias",
        "set",
        "local",
        "http://localhost:9000",
        minio.getUserName(),
        minio.getPassword());
    mc(minio, "mb", "local/" + bucket);
  }

  private static void mc(MinIOContainer minio, String... arguments) throws Exception {
    String[] command = new String[arguments.length + 1];
    command[0] = "mc";
    System.arraycopy(arguments, 0, command, 1, arguments.length);
    ExecResult result = minio.execInContainer(command);
    assertThat(result.getExitCode()).as(result.getStderr()).isZero();
  }
}
