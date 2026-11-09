package io.github.aborgatin.familyapp.lists;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Items through the sync push and pull (spec #3; ticket #57): adding, editing and deleting them,
 * Last write wins per field, delete wins, a List's delete and Visibility taking its Items along.
 * Two {@code Browser}s play Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ItemsSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  UUID groceries;

  @BeforeEach
  void annaAndBorisShareAShoppingList() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    groceries = UUID.randomUUID();
    SyncRequests.push(anna, list(groceries, "Супермаркет", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
  }

  @Test
  void anItemAddedOnOneDeviceArrivesThroughTheOthersPullWithItsCreator() throws Exception {
    UUID milk = UUID.randomUUID();
    Instant before = Instant.now();

    SyncRequests.push(boris, add(milk, groceries, "  Молоко  "))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    Map<String, Object> fields = SyncRequests.fields(anna, "item", milk);
    assertThat(fields)
        .containsEntry("listId", groceries.toString())
        .containsEntry("text", "Молоко")
        .containsEntry("note", null)
        .containsEntry("done", false)
        .containsEntry("doneById", null)
        .containsEntry("doneAt", null)
        .containsEntry("creatorId", memberId(boris));
    assertThat(Instant.parse((String) fields.get("createdAt"))).isAfter(before.minusSeconds(1));
  }

  @Test
  void deletingAListDeletesItsItemsAndLaterChangesToThemAreIgnored() throws Exception {
    UUID milk = UUID.randomUUID();
    UUID bread = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"), add(bread, groceries, "Хлеб"));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            anna,
            SyncRequests.delete("list", groceries),
            SyncRequests.upsert("item", milk, "{\"text\":\"Кефир\"}"),
            add(UUID.randomUUID(), groceries, "Сыр"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "ignored", "ignored")));

    assertThat(SyncRequests.change(boris, since, "item", milk))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(boris, since, "item", bread)).containsEntry("deleted", true);
    assertThat(SyncRequests.change(boris, 0, "item", milk)).isNull();
  }

  @Test
  void aPrivateListSharedLaterArrivesWithItsItemsAndLeavesWithThemWhenMadePrivateAgain()
      throws Exception {
    UUID gifts = UUID.randomUUID();
    UUID lego = UUID.randomUUID();
    SyncRequests.push(anna, list(gifts, "Подарки", "PRIVATE"), add(lego, gifts, "Лего"));
    long hidden = SyncRequests.version(SyncRequests.pull(boris, 0));
    assertThat(SyncRequests.change(boris, 0, "item", lego)).isNull();

    SyncRequests.push(anna, SyncRequests.upsert("list", gifts, "{\"visibility\":\"SHARED\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    long shared = SyncRequests.version(SyncRequests.pull(boris, hidden));

    Map<String, Object> arrived = SyncRequests.change(boris, hidden, "item", lego);
    assertThat(arrived).containsEntry("deleted", false);
    assertThat(SyncRequests.fields(boris, "item", lego)).containsEntry("text", "Лего");

    SyncRequests.push(anna, SyncRequests.upsert("list", gifts, "{\"visibility\":\"PRIVATE\"}"));

    assertThat(SyncRequests.change(boris, shared, "item", lego))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.fields(anna, "item", lego)).containsEntry("text", "Лего");
  }

  @Test
  void theServerSetsTheCreatorWhateverTheOperationCarries() throws Exception {
    UUID milk = UUID.randomUUID();

    SyncRequests.push(
            boris,
            SyncRequests.upsert(
                "item",
                milk,
                "{\"listId\":\"%s\",\"text\":\"Молоко\",\"creatorId\":\"%s\",\"createdAt\":\"%s\"}"
                    .formatted(groceries, memberId(anna), "2020-01-01T00:00:00Z")))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    Map<String, Object> created = SyncRequests.fields(anna, "item", milk);

    SyncRequests.push(
        anna,
        SyncRequests.upsert(
            "item", milk, "{\"text\":\"Кефир\",\"creatorId\":\"%s\"}".formatted(memberId(anna))));

    assertThat(SyncRequests.fields(boris, "item", milk))
        .containsEntry("text", "Кефир")
        .containsEntry("creatorId", memberId(boris))
        .containsEntry("createdAt", created.get("createdAt"));
    assertThat((String) created.get("createdAt")).doesNotStartWith("2020");
  }

  @Test
  void theSameFieldChangedOnBothDevicesKeepsTheChangeTheServerReceivedLast() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));

    SyncRequests.push(boris, SyncRequests.upsert("item", milk, "{\"text\":\"Молоко 3,2%\"}"));
    SyncRequests.push(anna, SyncRequests.upsert("item", milk, "{\"text\":\"Молоко 1,5%\"}"));

    assertThat(SyncRequests.fields(boris, "item", milk)).containsEntry("text", "Молоко 1,5%");
  }

  @Test
  void differentFieldsChangedOnBothDevicesAreBothKept() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));

    SyncRequests.push(boris, SyncRequests.upsert("item", milk, "{\"note\":\"Безлактозное\"}"));
    SyncRequests.push(anna, SyncRequests.upsert("item", milk, "{\"text\":\"Молоко 1,5%\"}"));

    assertThat(SyncRequests.fields(boris, "item", milk))
        .containsEntry("text", "Молоко 1,5%")
        .containsEntry("note", "Безлактозное");
  }

  @Test
  void aDeletedItemIsATombstoneAndDeleteWinsOverALaterChange() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            boris,
            SyncRequests.delete("item", milk),
            SyncRequests.upsert("item", milk, "{\"text\":\"Кефир\"}"),
            add(milk, groceries, "Молоко"),
            SyncRequests.delete("item", milk),
            SyncRequests.delete("item", UUID.randomUUID()))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("applied", "ignored", "ignored", "ignored", "ignored")));

    assertThat(SyncRequests.change(anna, since, "item", milk))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(anna, 0, "item", milk)).isNull();
  }

  @Test
  void anItemCreatedInADeletedListIsIgnored() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(boris, SyncRequests.delete("list", groceries));

    SyncRequests.push(anna, add(milk, groceries, "Молоко"))
        .andExpect(jsonPath("$.results[*].status", contains("ignored")));

    assertThat(SyncRequests.change(anna, 0, "item", milk)).isNull();
  }

  @Test
  void itemsOfTheOtherMembersPrivateListNeverReachThePullAndAreUnknownToThePush() throws Exception {
    UUID gifts = UUID.randomUUID();
    UUID lego = UUID.randomUUID();
    long since = SyncRequests.version(SyncRequests.pull(anna, 0));
    SyncRequests.push(boris, list(gifts, "Подарки Анне", "PRIVATE"), add(lego, gifts, "Серьги"));

    assertThat(SyncRequests.change(anna, 0, "item", lego)).isNull();
    assertThat(SyncRequests.change(anna, since, "item", lego))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", lego, "{\"text\":\"Кольцо\"}"),
            add(UUID.randomUUID(), gifts, "Кольцо"),
            SyncRequests.delete("item", lego))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains("list.not_found", "list.not_found", "list.not_found")))
        .andExpect(jsonPath("$.results[1].params.listId").value(gifts.toString()));

    assertThat(SyncRequests.fields(boris, "item", lego)).containsEntry("text", "Серьги");
  }

  @Test
  void anItemNeedsAKnownListAndATextOfAtMost1000Characters() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", UUID.randomUUID(), "{\"text\":\"Хлеб\"}"),
            SyncRequests.upsert("item", UUID.randomUUID(), "{\"listId\":\"x\",\"text\":\"Хлеб\"}"),
            add(UUID.randomUUID(), UUID.randomUUID(), "Хлеб"),
            add(UUID.randomUUID(), groceries, "   "),
            add(UUID.randomUUID(), groceries, "я".repeat(1001)),
            SyncRequests.upsert("item", milk, "{\"listId\":\"%s\"}".formatted(UUID.randomUUID())),
            SyncRequests.upsert("item", milk, "{\"text\":\"\"}"),
            add(UUID.randomUUID(), groceries, "я".repeat(1000)))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains(
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "rejected",
                    "applied")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='listId')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='listId')].code")
                .value("value.invalid"))
        .andExpect(jsonPath("$.results[2].code").value("list.not_found"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='text')].code").value("required"))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='text')].code").value("too_long"))
        .andExpect(
            jsonPath("$.results[5].params.errors[?(@.field=='listId')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[6].params.errors[?(@.field=='text')].code").value("required"));

    assertThat(SyncRequests.fields(boris, "item", milk)).containsEntry("text", "Молоко");
  }

  @Test
  void repeatingAWholePushLeavesTheSameState() throws Exception {
    UUID milk = UUID.randomUUID();
    String[] push = {
      add(milk, groceries, "Молоко"), SyncRequests.upsert("item", milk, "{\"text\":\"Кефир\"}")
    };

    SyncRequests.push(anna, push);
    Map<String, Object> once = SyncRequests.fields(boris, "item", milk);
    SyncRequests.push(anna, push)
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(boris, "item", milk)).isEqualTo(once);
  }

  @Test
  void doneSetsWhoMarkedItAndWhenAndUndoingClearsBoth() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));
    Instant before = Instant.now();

    SyncRequests.push(boris, done(milk, true))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    Map<String, Object> done = SyncRequests.fields(anna, "item", milk);
    assertThat(done).containsEntry("done", true).containsEntry("doneById", memberId(boris));
    assertThat(Instant.parse((String) done.get("doneAt"))).isAfter(before.minusSeconds(1));

    SyncRequests.push(anna, done(milk, false))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "item", milk))
        .containsEntry("done", false)
        .containsEntry("doneById", null)
        .containsEntry("doneAt", null);
  }

  @Test
  void markingAnItemDoneAgainChangesNothing() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"), done(milk, true));
    Map<String, Object> once = SyncRequests.fields(boris, "item", milk);
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(boris, done(milk, true), SyncRequests.upsert("item", milk, "{}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.change(anna, since, "item", milk)).isNull();
    assertThat(SyncRequests.fields(anna, "item", milk)).isEqualTo(once);
  }

  @Test
  void doneOnOneDeviceAndATextEditOnTheOtherAreBothKept() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));

    SyncRequests.push(boris, done(milk, true));
    SyncRequests.push(anna, SyncRequests.upsert("item", milk, "{\"text\":\"Молоко 1,5%\"}"));

    assertThat(SyncRequests.fields(boris, "item", milk))
        .containsEntry("text", "Молоко 1,5%")
        .containsEntry("done", true)
        .containsEntry("doneById", memberId(boris));
  }

  @Test
  void doneMustBeTrueOrFalse() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, add(milk, groceries, "Молоко"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", milk, "{\"done\":\"yes\"}"),
            SyncRequests.upsert("item", milk, "{\"done\":null}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='done')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='done')].code").value("required"));
  }

  static String list(UUID id, String name, String visibility) {
    return SyncRequests.upsert(
        "list",
        id,
        "{\"name\":\"%s\",\"kind\":\"SHOPPING\",\"visibility\":\"%s\"}"
            .formatted(name, visibility));
  }

  static String add(UUID id, UUID listId, String text) {
    return SyncRequests.upsert(
        "item", id, "{\"listId\":\"%s\",\"text\":\"%s\"}".formatted(listId, text));
  }

  static String done(UUID id, boolean done) {
    return SyncRequests.upsert("item", id, "{\"done\":%s}".formatted(done));
  }

  private static String memberId(Browser device) throws Exception {
    String body = device.openApp().andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.member.id");
  }
}
