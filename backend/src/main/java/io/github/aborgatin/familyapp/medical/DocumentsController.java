package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.family.Members;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
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
   * Adds a Document ({@code multipart/form-data}): {@code 201} with the Document, also when a retry
   * finds it already added.
   */
  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  ResponseEntity<DocumentResponse> upload(
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
    return ResponseEntity.status(HttpStatus.CREATED).body(DocumentResponse.of(document));
  }

  /** The Document's file, decrypted, with the content type it was found to have. */
  @GetMapping("/{id}/file")
  ResponseEntity<byte[]> file(@PathVariable UUID id) {
    DocumentService.File file = documents.file(members.current().id(), id);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(file.contentType()))
        .cacheControl(CacheControl.noStore())
        .body(file.bytes());
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

  /** A Document as the upload answers it: the fields the pull sends, and its Version. */
  record DocumentResponse(
      UUID id,
      @Nullable UUID memberId,
      @Nullable UUID childId,
      @Nullable UUID illnessEventId,
      String title,
      String date,
      @Nullable String description,
      String contentType,
      long size,
      long version) {

    static DocumentResponse of(Document document) {
      Document.Details details = document.details();
      return new DocumentResponse(
          document.id(),
          document.person().memberId(),
          document.person().childId(),
          document.illnessEventId(),
          details.title(),
          details.date().toString(),
          details.description(),
          document.contentType(),
          document.size(),
          document.version());
    }
  }
}
