package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiError;
import io.github.aborgatin.familyapp.family.Members;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

/**
 * Documents' files (spec #128 "Documents API"): not part of sync, so they need a connection. Every
 * endpoint needs a session. Editing and deleting a Document go through sync.
 */
@RestController
@ConditionalOnWebApplication
@RequestMapping("/api/documents")
class DocumentsController {

  private final Members members;
  private final DocumentService documents;

  DocumentsController(Members members, DocumentService documents) {
    this.members = members;
    this.documents = documents;
  }

  /**
   * Adds a Document ({@code multipart/form-data}): {@code 201} with the Document (its id, the
   * fields the pull sends and its Version), also when a retry finds it already added.
   */
  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  ResponseEntity<Map<String, Object>> upload(
      @RequestParam(required = false) @Nullable String id,
      @RequestParam(required = false) @Nullable String memberId,
      @RequestParam(required = false) @Nullable String childId,
      @RequestParam(required = false) @Nullable String illnessEventId,
      @RequestParam(required = false) @Nullable String title,
      @RequestParam(required = false) @Nullable String date,
      @RequestParam(required = false) @Nullable String description,
      @RequestParam(required = false) @Nullable MultipartFile file) {
    UUID uploader = members.current().id();
    Document document =
        documents.upload(
            uploader,
            new DocumentService.Upload(
                id,
                memberId,
                childId,
                illnessEventId,
                title,
                date,
                description,
                file == null ? null : uploaded(file)));
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("id", document.id());
    DocumentService.putFields(document, body);
    body.put("version", document.version());
    return ResponseEntity.status(HttpStatus.CREATED).body(body);
  }

  /**
   * The Document's file, decrypted, with the content type it was found to have. As an attachment,
   * so a browser that opens this URL itself downloads the file rather than showing it as a page of
   * the site; never kept by a cache ({@code no-store}). Spring Security adds {@code
   * X-Content-Type-Options: nosniff}.
   */
  @GetMapping("/{id}/file")
  ResponseEntity<byte[]> file(@PathVariable UUID id) {
    DocumentService.Download file = documents.file(members.current().id(), id);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(file.contentType()))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(file.name(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .cacheControl(CacheControl.noStore())
        .body(file.bytes());
  }

  /**
   * A file over the multipart limit ({@code spring.servlet.multipart}, 20 MB), found while the body
   * is read: the body is read lazily, when the {@code file} argument is resolved, so this handler
   * sees it.
   */
  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<ApiError> tooLarge(MaxUploadSizeExceededException ex) {
    return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
        .body(ApiError.of("document.too_large"));
  }

  private static DocumentService.UploadedFile uploaded(MultipartFile file) {
    return new DocumentService.UploadedFile() {
      @Override
      public long size() {
        return file.getSize();
      }

      @Override
      public byte[] bytes() {
        try {
          return file.getBytes();
        } catch (IOException e) {
          throw new UncheckedIOException(e);
        }
      }
    };
  }
}
