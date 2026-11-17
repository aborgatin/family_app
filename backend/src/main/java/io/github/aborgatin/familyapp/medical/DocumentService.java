package io.github.aborgatin.familyapp.medical;

import io.github.aborgatin.familyapp.error.ApiException;
import io.github.aborgatin.familyapp.error.FieldErrors;
import io.github.aborgatin.familyapp.family.ChildDeleted;
import io.github.aborgatin.familyapp.family.Children;
import io.github.aborgatin.familyapp.family.FamilyLock;
import io.github.aborgatin.familyapp.sync.Operation;
import io.github.aborgatin.familyapp.sync.Outcome;
import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.unit.DataSize;

/**
 * Documents (spec #128 "Documents API", ticket #133): the upload that creates one, reading its
 * file, and the {@code document} table of the sync push and pull, which edits and deletes it. Who
 * sees a Document is who sees its card ({@link Person}). A deleted Document's file is deleted from
 * the store after the deletion commits.
 */
@Service
class DocumentService implements SyncableTable {

  /**
   * The largest file a Document may have: 20 MB, the multipart limit of {@code application.yml},
   * which the servlet container checks while it reads an upload; checked here again for an upload
   * that reaches the service another way (MockMvc reads no body).
   */
  private final DataSize maxSize;

  private final DocumentRepository documents;
  private final IllnessEventRepository events;
  private final IllnessRepository illnesses;
  private final DocumentFiles files;
  private final Children children;
  private final FamilyLock lock;
  private final TransactionTemplate transaction;

  DocumentService(
      DocumentRepository documents,
      IllnessEventRepository events,
      IllnessRepository illnesses,
      DocumentFiles files,
      Children children,
      FamilyLock lock,
      TransactionTemplate transaction,
      @Value("${spring.servlet.multipart.max-file-size}") DataSize maxSize) {
    this.maxSize = maxSize;
    this.documents = documents;
    this.events = events;
    this.illnesses = illnesses;
    this.files = files;
    this.children = children;
    this.lock = lock;
    this.transaction = transaction;
  }

  /** An upload as it arrived: any text may be missing; {@code file} is the file's bytes. */
  record Upload(
      @Nullable String id,
      @Nullable String memberId,
      @Nullable String childId,
      @Nullable String illnessEventId,
      @Nullable String replaces,
      @Nullable String title,
      @Nullable String date,
      @Nullable String description,
      @Nullable UploadedFile file) {}

  /** The uploaded file: its length, and its bytes, read only once the length is checked. */
  interface UploadedFile {
    long size();

    byte[] bytes();
  }

  /**
   * A Document's file as the download returns it: its content type, a file name (the title with the
   * type's extension) and the bytes.
   */
  @SuppressWarnings("ArrayRecordComponent") // Never compared: handed straight to the response.
  record Download(String contentType, String name, byte[] bytes) {}

  /**
   * Adds a Document to a card: checks the fields, that the uploader sees the card (and the Illness
   * event, when given, is on it), the size and the type by content; stores the encrypted file, then
   * inserts the row, which reaches devices through the pull (the file is deleted again when the
   * insert is refused). A retry of an upload that already
   * created the Document answers that Document again and stores nothing.
   */
  Document upload(UUID uploader, Upload upload) {
    FieldErrors errors = new FieldErrors();
    UUID id = errors.requiredUuid("id", upload.id());
    UUID memberId = errors.uuid("memberId", upload.memberId());
    UUID childId = errors.uuid("childId", upload.childId());
    UUID illnessEventId = errors.uuid("illnessEventId", upload.illnessEventId());
    UUID replaces = errors.uuid("replaces", upload.replaces());
    Document.Details details =
        details(
            errors,
            trimmed(upload.title()),
            errors.requiredParsed("date", upload.date(), LocalDate::parse),
            trimmed(upload.description()));
    if (memberId == null && childId == null && !errors.has("memberId") && !errors.has("childId")) {
      errors.add("memberId", FieldErrors.REQUIRED);
    } else if (memberId != null && childId != null) {
      errors.add("childId", FieldErrors.VALUE_INVALID);
    }
    UploadedFile file = upload.file();
    if (file == null) {
      errors.add("file", FieldErrors.REQUIRED);
    }
    errors.throwIfAny();
    Person person = new Person(memberId, childId);
    Optional<Document> earlier = retried(id, uploader);
    if (earlier.isPresent()) {
      return earlier.get();
    }
    checkCanAdd(person, uploader, illnessEventId, replaces);
    if (file.size() > maxSize.toBytes()) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "document.too_large");
    }
    byte[] bytes = file.bytes();
    DocumentType type =
        DocumentType.of(bytes)
            .orElseThrow(
                () ->
                    new ApiException(
                        HttpStatus.UNSUPPORTED_MEDIA_TYPE, "document.unsupported_type"));
    files.put(id, bytes);
    try {
      return insert(uploader, id, person, illnessEventId, replaces, details, type, bytes.length);
    } catch (RuntimeException e) {
      // Refused after the file was stored (the event deleted meanwhile, given a Document, …): no
      // row names the object, so it goes; a Document already there with this id keeps its file.
      if (documents.findById(id).isEmpty()) {
        files.delete(id);
      }
      throw e;
    }
  }

  /** Inserts the uploaded Document's row, checked again under the Family lock. */
  private Document insert(
      UUID uploader,
      UUID id,
      Person person,
      @Nullable UUID illnessEventId,
      @Nullable UUID replaces,
      Document.Details details,
      DocumentType type,
      long size) {
    return transaction.execute(
        status -> {
          lock.lock();
          Optional<Document> meanwhile = retried(id, uploader);
          if (meanwhile.isPresent()) {
            return meanwhile.get();
          }
          checkCanAdd(person, uploader, illnessEventId, replaces);
          if (replaces != null && illnessEventId != null) {
            // Only the Document this event carries: the event is on a card the uploader sees
            // (checkCanAdd), so that Document is too; any other one is left alone.
            documents
                .findById(replaces)
                .filter(
                    replaced ->
                        !replaced.deleted() && illnessEventId.equals(replaced.illnessEventId()))
                .ifPresent(this::delete);
          }
          return documents.saveAndFlush(
              new Document(id, person, illnessEventId, details, type.contentType(), size));
        });
  }

  /**
   * The Document an earlier upload with this id created, when the uploader still sees it; {@code
   * medical.not_found} when it was deleted or is on a card they don't see.
   */
  private Optional<Document> retried(UUID id, UUID uploader) {
    Optional<Document> existing = documents.findById(id);
    if (existing.isPresent()
        && (existing.get().deleted() || !existing.get().person().visibleTo(uploader))) {
      throw notFound(id);
    }
    return existing;
  }

  /**
   * Whether the uploader may add a Document to the person's card: their own, or a Child's that is
   * there; and the Illness event, when given, is one on that card that is there and carries no
   * Document but the one the upload {@code replaces} ({@code document.event_has_document} else: the
   * uploader didn't know of it, e.g. one just added on another device).
   */
  private void checkCanAdd(
      Person person, UUID uploader, @Nullable UUID illnessEventId, @Nullable UUID replaces) {
    if (person.memberId() != null && !person.visibleTo(uploader)) {
      throw Person.notFound("memberId", person.memberId());
    }
    if (person.childId() != null && !children.present(person.childId())) {
      throw Person.notFound("childId", person.childId());
    }
    if (illnessEventId != null
        && events
            .findById(illnessEventId)
            .filter(event -> !event.deleted())
            .flatMap(event -> illnesses.findById(event.illnessId()))
            .filter(illness -> !illness.deleted() && illness.person().equals(person))
            .isEmpty()) {
      throw Person.notFound("illnessEventId", illnessEventId);
    }
    if (illnessEventId != null
        && documents
            .findByIllnessEventIdAndDeletedFalse(illnessEventId)
            .filter(carried -> !carried.id().equals(replaces))
            .isPresent()) {
      throw new ApiException(
          HttpStatus.CONFLICT,
          "document.event_has_document",
          Map.of("illnessEventId", illnessEventId.toString()));
    }
  }

  /**
   * The Document's file, decrypted, with its content type. A deleted Document, or one on a card the
   * reader doesn't see, is {@code medical.not_found}; a Document whose object is gone is {@code
   * document.file_missing}.
   */
  Download file(UUID reader, UUID id) {
    Document document =
        documents
            .findById(id)
            .filter(found -> !found.deleted() && found.person().visibleTo(reader))
            .orElseThrow(() -> notFound(id));
    byte[] bytes =
        files
            .get(id)
            .orElseThrow(
                () ->
                    new ApiException(
                        HttpStatus.NOT_FOUND,
                        "document.file_missing",
                        Map.of("documentId", id.toString())));
    String name =
        document.details().title() + DocumentType.ofContentType(document.contentType()).extension();
    return new Download(document.contentType(), name, bytes);
  }

  private static ApiException notFound(UUID id) {
    return Person.notFound("documentId", id);
  }

  @Override
  public String name() {
    return "document";
  }

  /**
   * An upsert of a known Document changes the {@code title} (required), {@code date} (required) and
   * {@code description} it carries; an upsert of an unknown one is {@code medical.not_found}, since
   * only the upload creates one. A delete deletes it, and its file after the commit. Delete wins. A
   * Document on another Member's card is {@code medical.not_found}.
   */
  @Override
  public Outcome apply(Operation operation) {
    Optional<Document> existing = documents.findById(operation.id());
    if (existing.isPresent() && !existing.get().person().visibleTo(operation.memberId())) {
      throw notFound(operation.id());
    }
    return Outcome.deleteWins(operation, existing, this::edit, this::delete);
  }

  private Outcome edit(Operation operation, Optional<Document> existing) {
    Document document = existing.orElseThrow(() -> notFound(operation.id()));
    Document.Details current = document.details();
    FieldErrors errors = new FieldErrors();
    Document.Details details =
        details(
            errors,
            operation.has("title") ? operation.trimmedText("title") : current.title(),
            operation.has("date")
                ? errors.requiredParsed("date", operation.text("date"), LocalDate::parse)
                : current.date(),
            operation.has("description")
                ? operation.trimmedText("description")
                : current.description());
    errors.throwIfAny();
    document.change(details);
    documents.saveAndFlush(document);
    return Outcome.APPLIED;
  }

  /** The Details, with a title required ({@code date} is checked by the caller). */
  private static Document.Details details(
      FieldErrors errors,
      @Nullable String title,
      @Nullable LocalDate date,
      @Nullable String description) {
    if (title == null) {
      errors.add("title", FieldErrors.REQUIRED);
    }
    return new Document.Details(title, date, description);
  }

  @Nullable
  private static String trimmed(@Nullable String text) {
    return text == null || text.isBlank() ? null : text.strip();
  }

  private Outcome delete(Document document) {
    document.markDeleted();
    documents.saveAndFlush(document);
    deleteFilesAfterCommit(List.of(document.id()));
    return Outcome.APPLIED;
  }

  /**
   * A deleted Illness event takes its Document, in the push operation that deletes the event; the
   * file goes after the commit.
   */
  void deleteOfEvent(UUID illnessEventId) {
    documents.findByIllnessEventIdAndDeletedFalse(illnessEventId).ifPresent(this::delete);
  }

  /**
   * A deleted Illness takes its events' Documents, in the push operation that deletes it (call
   * before its events are marked deleted, or after: the events are matched whatever their state).
   */
  void deleteOfIllness(UUID illnessId) {
    List<UUID> ids = documents.idsOfIllness(illnessId);
    documents.markDeletedOfIllness(illnessId);
    deleteFilesAfterCommit(ids);
  }

  /**
   * A deleted Child takes their Documents, in the push operation that deletes the Child; their
   * files go after the commit.
   */
  @EventListener
  void onChildDeleted(ChildDeleted event) {
    List<UUID> ids = documents.idsOfChild(event.childId());
    documents.markDeletedOfChild(event.childId());
    deleteFilesAfterCommit(ids);
  }

  /**
   * Deletes the files of these Documents once the transaction commits, each only when its row is
   * then deleted (a rejected operation's savepoint may have undone the deletion). A failure is
   * logged by {@link DocumentFiles#delete} and never fails the push.
   */
  private void deleteFilesAfterCommit(List<UUID> ids) {
    if (ids.isEmpty()) {
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            for (UUID id : ids) {
              if (documents.findById(id).map(Document::deleted).orElse(false)) {
                files.delete(id);
              }
            }
          }
        });
  }

  /** Only the Documents on cards the Member sees: the others are left out, not even tombstoned. */
  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        documents.findByVersionGreaterThan(version).stream()
            .filter(document -> document.person().visibleTo(memberId))
            .toList(),
        DocumentService::putFields);
  }

  /**
   * The fields of a Document as the pull sends them, and the upload answers them: never the file.
   */
  static void putFields(Document document, Map<String, Object> fields) {
    Document.Details details = document.details();
    fields.put("memberId", document.person().memberId());
    fields.put("childId", document.person().childId());
    fields.put("illnessEventId", document.illnessEventId());
    fields.put("title", details.title());
    fields.put("date", details.date().toString());
    fields.put("description", details.description());
    fields.put("contentType", document.contentType());
    fields.put("size", document.size());
  }
}
