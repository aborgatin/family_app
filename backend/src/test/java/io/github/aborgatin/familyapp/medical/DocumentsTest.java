package io.github.aborgatin.familyapp.medical;

import static io.github.aborgatin.familyapp.MedicalOperations.illnessOf;
import static io.github.aborgatin.familyapp.MedicalOperations.temperature;
import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Documents on a Medical card (spec #128 "Documents API", ticket #133): uploading a file to {@code
 * POST /api/documents}, reading it back from {@code GET /api/documents/{id}/file}, and the {@code
 * document} table through the sync push and pull. Files go to the in-memory file store, which the
 * tests read to check what was stored. Anna's phone and Boris's phone; every test starts with the
 * Child Маша.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, InMemoryFileStore.Config.class})
class DocumentsTest {

  static final String DOCUMENT = "document";
  static final String PDF_TEXT =
      "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\nАнализ крови\n%%EOF";
  static final byte[] PDF = PDF_TEXT.getBytes(StandardCharsets.UTF_8);

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired InMemoryFileStore files;

  Browser anna;
  Browser boris;
  String annaId;
  final UUID masha = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisHaveMasha() throws Exception {
    FreshInstallation.reset(jdbc);
    files.reset();
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    annaId = SyncRequests.memberId(anna);
    pushApplied(
        anna, SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"));
  }

  /**
   * The form fields of an upload to the person's card, titled «Анализ крови» on 2 December 2026.
   */
  static Map<String, String> form(UUID id, String personField, Object person) {
    Map<String, String> fields = new HashMap<>();
    fields.put("id", id.toString());
    fields.put(personField, person.toString());
    fields.put("title", "Анализ крови");
    fields.put("date", "2026-12-02");
    fields.put("description", "Натощак");
    return fields;
  }

  static MockMultipartFile file(String name, String declaredType, byte[] bytes) {
    return new MockMultipartFile("file", name, declaredType, bytes);
  }

  static MockMultipartFile pdf() {
    return file("Анализ крови.pdf", "application/pdf", PDF);
  }

  ResultActions upload(Browser device, Map<String, String> form, MockMultipartFile file)
      throws Exception {
    return device.postMultipart("/api/documents", form, file);
  }

  @Test
  void anUploadedFileIsStoredEncryptedAndReadBackAsItWas() throws Exception {
    UUID id = UUID.randomUUID();

    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());

    assertThat(files.keys()).hasSize(1);
    byte[] stored = files.object(files.keys().iterator().next()).orElseThrow();
    assertThat(new String(stored, StandardCharsets.ISO_8859_1))
        .doesNotContain("%PDF")
        .doesNotContain(new String(PDF, StandardCharsets.ISO_8859_1));
    for (Browser member : new Browser[] {anna, boris}) {
      member
          .get("/api/documents/" + id + "/file")
          .andExpect(status().isOk())
          .andExpect(content().contentType("application/pdf"))
          .andExpect(content().bytes(PDF));
    }
    assertThat(SyncRequests.fields(boris, DOCUMENT, id))
        .containsEntry("childId", masha.toString())
        .containsEntry("memberId", null)
        .containsEntry("illnessEventId", null)
        .containsEntry("title", "Анализ крови")
        .containsEntry("date", "2026-12-02")
        .containsEntry("description", "Натощак")
        .containsEntry("contentType", "application/pdf")
        .containsEntry("size", PDF.length)
        .doesNotContainKey("file");
  }

  @Test
  void theFileIsNeitherRenderedOnTheSiteNorKeptByASharedCache() throws Exception {
    UUID id = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());

    anna.get("/api/documents/" + id + "/file")
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/pdf"))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(
            header()
                .string(
                    "Content-Disposition",
                    allOf(
                        startsWith("attachment;"),
                        endsWith(
                            "filename*=UTF-8''%D0%90%D0%BD%D0%B0%D0%BB%D0%B8%D0%B7%20"
                                + "%D0%BA%D1%80%D0%BE%D0%B2%D0%B8.pdf"))));
  }

  @Test
  void anIllnessEventCarriesOneDocumentAtMost() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    pushApplied(
        anna,
        illnessOf("childId", masha, illness, "ОРВИ"),
        temperature(event, illness, "2026-12-02", "22:00", 38.5));
    Map<String, String> first = form(UUID.randomUUID(), "childId", masha);
    first.put("illnessEventId", event.toString());
    upload(anna, first, pdf()).andExpect(status().isCreated());
    UUID second = UUID.randomUUID();
    Map<String, String> another = form(second, "childId", masha);
    another.put("illnessEventId", event.toString());

    upload(boris, another, pdf())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("document.event_has_document"))
        .andExpect(jsonPath("$.params.illnessEventId").value(event.toString()));

    assertThat(files.keys()).hasSize(1);
    assertThat(SyncRequests.fields(anna, DOCUMENT, second)).isNull();
  }

  /** An Illness «ОРВИ» on Маша's card with a Temperature, {@code event}. */
  void orviWithATemperature(UUID illness, UUID event) throws Exception {
    pushApplied(
        anna,
        illnessOf("childId", masha, illness, "ОРВИ"),
        temperature(event, illness, "2026-12-02", "22:00", 38.5));
  }

  /** The form of an upload of a Document to Маша's Illness event. */
  Map<String, String> onEvent(UUID id, UUID event) {
    Map<String, String> form = form(id, "childId", masha);
    form.put("illnessEventId", event.toString());
    return form;
  }

  @Test
  void anUploadThatReplacesTheEventsDocumentDeletesTheOldOneAndItsFile() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    orviWithATemperature(illness, event);
    UUID old = UUID.randomUUID();
    upload(anna, onEvent(old, event), pdf()).andExpect(status().isCreated());
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));
    UUID replacement = UUID.randomUUID();
    Map<String, String> form = onEvent(replacement, event);
    form.put("replaces", old.toString());

    upload(anna, form, pdf()).andExpect(status().isCreated());

    assertThat(SyncRequests.change(boris, before, DOCUMENT, old)).containsEntry("deleted", true);
    assertThat(SyncRequests.fields(boris, DOCUMENT, replacement))
        .containsEntry("illnessEventId", event.toString());
    assertThat(files.keys()).containsExactly(Document.objectKey(replacement));
    anna.get("/api/documents/" + old + "/file")
        .andExpect(jsonPath("$.code").value("medical.not_found"));
  }

  @Test
  void anUploadReplacingAnotherDocumentThanTheEventsIsRefused() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    orviWithATemperature(illness, event);
    upload(anna, onEvent(UUID.randomUUID(), event), pdf()).andExpect(status().isCreated());
    Map<String, String> form = onEvent(UUID.randomUUID(), event);
    form.put("replaces", UUID.randomUUID().toString());

    upload(boris, form, pdf())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("document.event_has_document"));

    assertThat(files.keys()).hasSize(1);
  }

  @Test
  void deletingAnIllnessEventDeletesItsDocumentAndFile() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    UUID other = UUID.randomUUID();
    orviWithATemperature(illness, event);
    pushApplied(anna, temperature(other, illness, "2026-12-03", "08:00", 37.5));
    UUID id = UUID.randomUUID();
    UUID kept = UUID.randomUUID();
    upload(anna, onEvent(id, event), pdf()).andExpect(status().isCreated());
    upload(anna, onEvent(kept, other), pdf()).andExpect(status().isCreated());
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(boris, SyncRequests.delete("illness_event", event));

    assertThat(SyncRequests.change(anna, before, DOCUMENT, id)).containsEntry("deleted", true);
    assertThat(files.keys()).containsExactly(Document.objectKey(kept));
    anna.get("/api/documents/" + kept + "/file").andExpect(status().isOk());
  }

  @Test
  void deletingAnIllnessDeletesItsEventsDocumentsAndFiles() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    UUID cardLevel = UUID.randomUUID();
    orviWithATemperature(illness, event);
    UUID id = UUID.randomUUID();
    upload(anna, onEvent(id, event), pdf()).andExpect(status().isCreated());
    upload(anna, form(cardLevel, "childId", masha), pdf()).andExpect(status().isCreated());
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(boris, SyncRequests.delete("illness", illness));

    assertThat(SyncRequests.change(anna, before, DOCUMENT, id)).containsEntry("deleted", true);
    assertThat(files.keys()).containsExactly(Document.objectKey(cardLevel));
  }

  @Test
  void theUploadAnswersWithTheDocument() throws Exception {
    UUID id = UUID.randomUUID();

    upload(anna, form(id, "memberId", annaId), pdf())
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value(id.toString()))
        .andExpect(jsonPath("$.memberId").value(annaId))
        .andExpect(jsonPath("$.title").value("Анализ крови"))
        .andExpect(jsonPath("$.contentType").value("application/pdf"))
        .andExpect(jsonPath("$.size").value(PDF.length));
  }

  @Test
  void aRetriedUploadAddsTheDocumentOnce() throws Exception {
    UUID id = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());
    long before = SyncRequests.version(SyncRequests.pull(anna, 0));

    upload(anna, form(id, "childId", masha), pdf())
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value(id.toString()))
        .andExpect(jsonPath("$.title").value("Анализ крови"));

    assertThat(files.keys()).hasSize(1);
    assertThat(SyncRequests.change(anna, before, DOCUMENT, id)).isNull();
  }

  @Test
  void aFileOver20MbIsTooLarge() throws Exception {
    byte[] large = Arrays.copyOf(PDF, 20 * 1024 * 1024 + 1);

    upload(
            anna,
            form(UUID.randomUUID(), "childId", masha),
            file("Скан.pdf", "application/pdf", large))
        .andExpect(status().isPayloadTooLarge())
        .andExpect(jsonPath("$.code").value("document.too_large"));

    assertThat(files.keys()).isEmpty();
  }

  @Test
  void aFileOfExactly20MbIsAccepted() throws Exception {
    byte[] largest = Arrays.copyOf(PDF, 20 * 1024 * 1024);

    upload(
            anna,
            form(UUID.randomUUID(), "childId", masha),
            file("Скан.pdf", "application/pdf", largest))
        .andExpect(status().isCreated());
  }

  @Test
  void aTextFileRenamedToPdfIsAnUnsupportedType() throws Exception {
    UUID id = UUID.randomUUID();
    byte[] text = "Анализ крови: гемоглобин 120".getBytes(StandardCharsets.UTF_8);

    upload(anna, form(id, "childId", masha), file("Анализ.pdf", "application/pdf", text))
        .andExpect(status().isUnsupportedMediaType())
        .andExpect(jsonPath("$.code").value("document.unsupported_type"));

    assertThat(files.keys()).isEmpty();
    assertThat(SyncRequests.fields(anna, DOCUMENT, id)).isNull();
  }

  @Test
  void photosAreTakenByTheirContentWhateverTheyAreCalled() throws Exception {
    Map<String, byte[]> photos =
        Map.of(
            "image/jpeg",
            new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16},
            "image/png",
            new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0},
            "image/heic",
            heif("heic"),
            "image/heif",
            heif("mif1"));
    for (Map.Entry<String, byte[]> photo : photos.entrySet()) {
      UUID id = UUID.randomUUID();

      upload(
              anna,
              form(id, "childId", masha),
              file("IMG_0001", "application/octet-stream", photo.getValue()))
          .andExpect(status().isCreated());

      anna.get("/api/documents/" + id + "/file")
          .andExpect(content().contentType(photo.getKey()))
          .andExpect(content().bytes(photo.getValue()));
    }
  }

  /** The start of an ISO base media file of this major brand, as an iPhone's photo begins. */
  static byte[] heif(String brand) {
    return ("\0\0\0\u0018ftyp" + brand + "\0\0\0\0mif1heic").getBytes(StandardCharsets.US_ASCII);
  }

  @Test
  void aDocumentWhoseObjectIsGoneHasItsFileMissing() throws Exception {
    UUID id = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());
    files.keys().forEach(files::lose);

    anna.get("/api/documents/" + id + "/file")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("document.file_missing"))
        .andExpect(jsonPath("$.params.documentId").value(id.toString()));
  }

  @Test
  void anUnknownDocumentIsNotFound() throws Exception {
    anna.get("/api/documents/" + UUID.randomUUID() + "/file")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
  }

  @Test
  void aMembersOwnDocumentsAreHersAlone() throws Exception {
    UUID id = UUID.randomUUID();
    upload(anna, form(id, "memberId", annaId), pdf()).andExpect(status().isCreated());

    boris
        .get("/api/documents/" + id + "/file")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
    assertThat(SyncRequests.change(boris, 0, DOCUMENT, id)).isNull();
    assertThat(SyncRequests.fields(anna, DOCUMENT, id)).containsEntry("memberId", annaId);
    SyncRequests.push(boris, SyncRequests.upsert(DOCUMENT, id, "{\"title\":\"Чужой\"}"))
        .andExpect(jsonPath("$.results[0].code").value("medical.not_found"));
    SyncRequests.push(boris, SyncRequests.delete(DOCUMENT, id))
        .andExpect(jsonPath("$.results[0].code").value("medical.not_found"));
    assertThat(files.keys()).hasSize(1);
  }

  @Test
  void noOneAddsADocumentToAnotherMembersCard() throws Exception {
    UUID id = UUID.randomUUID();

    upload(boris, form(id, "memberId", annaId), pdf())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
    // Nor by retrying with the id of one already there.
    upload(anna, form(id, "memberId", annaId), pdf()).andExpect(status().isCreated());
    upload(boris, form(id, "childId", masha), pdf())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"));

    assertThat(files.keys()).hasSize(1);
    assertThat(SyncRequests.fields(anna, DOCUMENT, id)).containsEntry("memberId", annaId);
  }

  @Test
  void aDocumentGoesOnlyToAChildWhoIsThere() throws Exception {
    pushApplied(anna, SyncRequests.delete("child", masha));

    upload(anna, form(UUID.randomUUID(), "childId", masha), pdf())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
    upload(anna, form(UUID.randomUUID(), "childId", UUID.randomUUID()), pdf())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
    assertThat(files.keys()).isEmpty();
  }

  @Test
  void anUploadNeedsItsFields() throws Exception {
    Map<String, String> form = form(UUID.randomUUID(), "childId", masha);
    form.put("title", " ");
    form.put("date", "2 декабря");

    upload(anna, form, pdf())
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("validation.failed"))
        .andExpect(jsonPath("$.params.errors[*].field", containsInAnyOrder("title", "date")));
  }

  @Test
  void aDocumentMayBelongToAnIllnessEventOnItsCard() throws Exception {
    UUID illness = UUID.randomUUID();
    UUID event = UUID.randomUUID();
    UUID annas = UUID.randomUUID();
    UUID annasEvent = UUID.randomUUID();
    pushApplied(
        anna,
        illnessOf("childId", masha, illness, "ОРВИ"),
        temperature(event, illness, "2026-12-02", "22:00", 38.5),
        illnessOf("memberId", annaId, annas, "Простуда"),
        temperature(annasEvent, annas, "2026-12-02", "22:00", 37.5));
    UUID id = UUID.randomUUID();
    Map<String, String> onEvent = form(id, "childId", masha);
    onEvent.put("illnessEventId", event.toString());
    Map<String, String> onAnotherCard = form(UUID.randomUUID(), "childId", masha);
    onAnotherCard.put("illnessEventId", annasEvent.toString());

    upload(anna, onEvent, pdf()).andExpect(status().isCreated());
    upload(anna, onAnotherCard, pdf())
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"))
        .andExpect(jsonPath("$.params.illnessEventId").value(annasEvent.toString()));

    assertThat(SyncRequests.fields(boris, DOCUMENT, id))
        .containsEntry("illnessEventId", event.toString());
  }

  @Test
  void theTitleDateAndDescriptionAreEditedThroughSync() throws Exception {
    UUID id = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());

    pushApplied(
        boris,
        SyncRequests.upsert(
            DOCUMENT,
            id,
            "{\"title\":\" Анализ мочи \",\"date\":\"2026-12-03\",\"description\":null}"));
    SyncRequests.push(anna, SyncRequests.upsert(DOCUMENT, id, "{\"title\":\"\"}"))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"));
    SyncRequests.push(
            anna, SyncRequests.upsert(DOCUMENT, UUID.randomUUID(), "{\"title\":\"Новый\"}"))
        .andExpect(jsonPath("$.results[0].code").value("medical.not_found"));

    assertThat(SyncRequests.fields(anna, DOCUMENT, id))
        .containsEntry("title", "Анализ мочи")
        .containsEntry("date", "2026-12-03")
        .containsEntry("description", null)
        .containsEntry("contentType", "application/pdf");
  }

  @Test
  void deletingADocumentDeletesItsFile() throws Exception {
    UUID id = UUID.randomUUID();
    UUID kept = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());
    upload(anna, form(kept, "childId", masha), pdf()).andExpect(status().isCreated());
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(boris, SyncRequests.delete(DOCUMENT, id));

    assertThat(files.keys()).hasSize(1);
    anna.get("/api/documents/" + kept + "/file").andExpect(status().isOk());
    anna.get("/api/documents/" + id + "/file")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
    assertThat(SyncRequests.change(anna, before, DOCUMENT, id)).containsEntry("deleted", true);
    upload(anna, form(id, "childId", masha), pdf())
        .andExpect(jsonPath("$.code").value("medical.not_found"));
  }

  @Test
  void aFileThatCantBeDeletedLeavesTheDeletionDone() throws Exception {
    UUID id = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());
    files.failDeletes();

    pushApplied(anna, SyncRequests.delete(DOCUMENT, id));

    anna.get("/api/documents/" + id + "/file")
        .andExpect(jsonPath("$.code").value("medical.not_found"));
  }

  @Test
  void deletingAChildDeletesTheirDocumentsAndFiles() throws Exception {
    UUID id = UUID.randomUUID();
    UUID annas = UUID.randomUUID();
    upload(anna, form(id, "childId", masha), pdf()).andExpect(status().isCreated());
    upload(anna, form(annas, "memberId", annaId), pdf()).andExpect(status().isCreated());
    long before = SyncRequests.version(SyncRequests.pull(anna, 0));

    pushApplied(boris, SyncRequests.delete("child", masha));

    assertThat(SyncRequests.change(anna, before, DOCUMENT, id)).containsEntry("deleted", true);
    assertThat(files.keys()).hasSize(1);
    anna.get("/api/documents/" + annas + "/file").andExpect(status().isOk());
  }
}
