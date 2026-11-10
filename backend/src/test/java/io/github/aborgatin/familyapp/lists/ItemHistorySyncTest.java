package io.github.aborgatin.familyapp.lists;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import java.time.Instant;
import java.util.List;
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
 * Item history through the sync pull (spec #4; ticket #74): the names ever added to a Shopping
 * list, kept by the server as Items are written. Two {@code Browser}s play Anna's phone and Boris's
 * phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ItemHistorySyncTest {

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
    SyncRequests.push(anna, ItemsSyncTest.list(groceries, "Супермаркет", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
  }

  @Test
  void addingAnItemPutsItsNameInTheListsHistoryForEveryoneWhoSeesTheList() throws Exception {
    SyncRequests.push(boris, ItemsSyncTest.add(UUID.randomUUID(), groceries, "Молоко"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    List<Map<String, Object>> history = history(anna, 0);
    assertThat(history).hasSize(1);
    assertThat(fields(history.get(0)))
        .containsEntry("listId", groceries.toString())
        .containsEntry("name", "Молоко")
        .containsKey("lastUsedAt");
  }

  @Test
  void renamingAnItemPutsTheNewNameInTheHistoryAndKeepsTheOldOne() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, ItemsSyncTest.add(milk, groceries, "Молоко"));

    SyncRequests.push(boris, SyncRequests.upsert("item", milk, "{\"text\":\"Кефир\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(names(history(anna, 0))).containsExactlyInAnyOrder("Молоко", "Кефир");
  }

  @Test
  void settingADoneItemOpenAgainUsesItsNameAgain() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, ItemsSyncTest.add(milk, groceries, "Молоко"));
    SyncRequests.push(anna, ItemsSyncTest.done(milk, true));
    Map<String, Object> before = history(anna, 0).get(0);
    long since = SyncRequests.version(SyncRequests.pull(anna, 0));

    SyncRequests.push(boris, ItemsSyncTest.done(milk, false))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    List<Map<String, Object>> after = history(anna, since);
    assertThat(after).hasSize(1);
    assertThat(after.get(0)).containsEntry("id", before.get("id"));
    assertThat(lastUsedAt(after.get(0))).isAfter(lastUsedAt(before));
  }

  @Test
  void tickingAnItemOrChangingOnlyItsDescriptionLeavesTheHistoryAlone() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, ItemsSyncTest.add(milk, groceries, "Молоко"));
    long since = SyncRequests.version(SyncRequests.pull(anna, 0));

    SyncRequests.push(
            boris,
            ItemsSyncTest.done(milk, true),
            SyncRequests.upsert("item", milk, "{\"description\":\"2,5%\",\"text\":\"Молоко\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(history(anna, since)).isEmpty();
  }

  @Test
  void oneRowPerNormalisedNameWithTheLatestSpellingAndANewerLastUse() throws Exception {
    SyncRequests.push(anna, ItemsSyncTest.add(UUID.randomUUID(), groceries, "Молоко"));
    Map<String, Object> first = history(anna, 0).get(0);

    SyncRequests.push(boris, ItemsSyncTest.add(UUID.randomUUID(), groceries, "  молоко "))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    List<Map<String, Object>> history = history(anna, 0);
    assertThat(history).hasSize(1);
    assertThat(history.get(0)).containsEntry("id", first.get("id"));
    assertThat(fields(history.get(0))).containsEntry("name", "молоко");
    assertThat(lastUsedAt(history.get(0))).isAfter(lastUsedAt(first));
  }

  @Test
  void deletingTheItemKeepsItsNameInTheHistory() throws Exception {
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, ItemsSyncTest.add(milk, groceries, "Молоко"));

    SyncRequests.push(boris, SyncRequests.delete("item", milk))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(names(history(anna, 0))).containsExactly("Молоко");
  }

  @Test
  void todoAndWishListsKeepNoHistory() throws Exception {
    UUID chores = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();
    UUID vacuum = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "list", chores, "{\"name\":\"Дела\",\"kind\":\"TODO\",\"visibility\":\"SHARED\"}"),
            SyncRequests.upsert(
                "list",
                wishes,
                "{\"name\":\"Хотелки\",\"kind\":\"WISH\",\"visibility\":\"SHARED\"}"),
            ItemsSyncTest.add(vacuum, chores, "Пропылесосить"),
            ItemsSyncTest.add(UUID.randomUUID(), wishes, "Велосипед"),
            SyncRequests.upsert("item", vacuum, "{\"text\":\"Помыть пол\"}"),
            ItemsSyncTest.done(vacuum, true),
            ItemsSyncTest.done(vacuum, false))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains(
                    "applied", "applied", "applied", "applied", "applied", "applied", "applied")));

    assertThat(history(boris, 0)).isEmpty();
  }

  @Test
  void thePushCannotWriteTheHistory() throws Exception {
    SyncRequests.push(anna, ItemsSyncTest.add(UUID.randomUUID(), groceries, "Молоко"));
    UUID row = UUID.fromString((String) history(anna, 0).get(0).get("id"));

    SyncRequests.push(
            boris,
            SyncRequests.upsert("item_history", row, "{\"name\":\"Кефир\"}"),
            SyncRequests.delete("item_history", row),
            SyncRequests.upsert(
                "item_history",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"name\":\"Кефир\"}".formatted(groceries)))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains("sync.read_only", "sync.read_only", "sync.read_only")));

    assertThat(names(history(anna, 0))).containsExactly("Молоко");
  }

  @Test
  void deletingAListDeletesItsHistory() throws Exception {
    SyncRequests.push(anna, ItemsSyncTest.add(UUID.randomUUID(), groceries, "Молоко"));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(anna, SyncRequests.delete("list", groceries))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    List<Map<String, Object>> changes = history(boris, since);
    assertThat(changes).hasSize(1);
    assertThat(changes.get(0)).containsEntry("deleted", true).doesNotContainKey("fields");
    assertThat(history(boris, 0)).isEmpty();
  }

  @Test
  void aPrivateListSharedLaterArrivesWithItsHistoryAndLeavesWithItWhenMadePrivateAgain()
      throws Exception {
    UUID gifts = UUID.randomUUID();
    SyncRequests.push(
        anna,
        ItemsSyncTest.list(gifts, "Подарки", "PRIVATE"),
        ItemsSyncTest.add(UUID.randomUUID(), gifts, "Конструктор"));
    long hidden = SyncRequests.version(SyncRequests.pull(boris, 0));
    assertThat(history(boris, 0)).isEmpty();

    SyncRequests.push(anna, SyncRequests.upsert("list", gifts, "{\"visibility\":\"SHARED\"}"));
    long shared = SyncRequests.version(SyncRequests.pull(boris, hidden));

    assertThat(names(history(boris, hidden))).containsExactly("Конструктор");

    SyncRequests.push(anna, SyncRequests.upsert("list", gifts, "{\"visibility\":\"PRIVATE\"}"));

    List<Map<String, Object>> changes = history(boris, shared);
    assertThat(changes).hasSize(1);
    assertThat(changes.get(0)).containsEntry("deleted", true).doesNotContainKey("fields");
    assertThat(names(history(anna, 0))).containsExactly("Конструктор");
  }

  @Test
  void theHistoryOfTheOtherMembersPrivateListIsNeverPulled() throws Exception {
    UUID secret = UUID.randomUUID();
    long since = SyncRequests.version(SyncRequests.pull(anna, 0));

    SyncRequests.push(
        boris,
        ItemsSyncTest.list(secret, "Подарки Анне", "PRIVATE"),
        ItemsSyncTest.add(UUID.randomUUID(), secret, "Серьги"));

    assertThat(history(anna, 0)).isEmpty();
    List<Map<String, Object>> changes = history(anna, since);
    assertThat(changes).hasSize(1);
    assertThat(changes.get(0)).containsEntry("deleted", true).doesNotContainKey("fields");
    assertThat(names(history(boris, 0))).containsExactly("Серьги");
  }

  static Instant lastUsedAt(Map<String, Object> change) {
    return Instant.parse((String) fields(change).get("lastUsedAt"));
  }

  /** The names in these history changes. */
  static List<Object> names(List<Map<String, Object>> history) {
    return history.stream().map(change -> fields(change).get("name")).toList();
  }

  /** The {@code item_history} changes a pull since {@code version} returns. */
  static List<Map<String, Object>> history(Browser device, long version) throws Exception {
    String body = SyncRequests.pull(device, version).andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.changes[?(@.table=='item_history')]");
  }

  @SuppressWarnings("unchecked") // JsonPath returns the JSON object as a Map.
  static Map<String, Object> fields(Map<String, Object> change) {
    return (Map<String, Object>) change.get("fields");
  }
}
