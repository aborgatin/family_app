package io.github.aborgatin.familyapp.lists;

import static io.github.aborgatin.familyapp.ListOperations.add;
import static io.github.aborgatin.familyapp.ListOperations.done;
import static io.github.aborgatin.familyapp.ListOperations.list;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

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
 * Hide done on a Todo list through the sync push and pull (spec #81, ticket #93): a List upsert
 * carrying {@code hideDone}, the id of one press of «Скрыть», makes the server stamp the List's
 * {@code doneHiddenAt} with its own time, once per press; the Done items marked Done up to that
 * moment leave «Выполнено» on every device. Two {@code Browser}s play Anna's phone and Boris's
 * phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class HideDoneSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  UUID chores;

  @BeforeEach
  void annaAndBorisShareATodoList() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    chores = UUID.randomUUID();
    SyncRequests.push(anna, list(chores, "Дела по дому", "TODO", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
  }

  @Test
  void aListNeverHiddenHasNoMomentAndAHideStampsTheServersTimeForTheOtherMember() throws Exception {
    assertThat(SyncRequests.fields(boris, "list", chores)).containsEntry("doneHiddenAt", null);
    Instant before = Instant.now();

    SyncRequests.push(anna, hideDone(chores))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    Instant hidden = doneHiddenAt(boris, chores);
    assertThat(hidden).isAfterOrEqualTo(before.minusSeconds(1)).isBeforeOrEqualTo(Instant.now());
  }

  @Test
  void anItemTickedBeforeTheHideInTheSamePushIsHiddenWithItAndOneTickedAfterIsNot()
      throws Exception {
    UUID earlier = UUID.randomUUID();
    UUID later = UUID.randomUUID();
    SyncRequests.push(
        anna, add(earlier, chores, "Полить цветы"), add(later, chores, "Купить хлеб"));

    // An offline phone's Outbox: a tick, the press of «Скрыть», another tick, sent on reconnect.
    SyncRequests.push(anna, done(earlier, true), hideDone(chores), done(later, true))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied", "applied")));

    Instant hidden = doneHiddenAt(boris, chores);
    assertThat(doneAt(boris, earlier)).isBeforeOrEqualTo(hidden);
    assertThat(doneAt(boris, later)).isAfter(hidden);
  }

  @Test
  void eitherMemberHidesAndALaterHideMovesTheMomentOn() throws Exception {
    SyncRequests.push(anna, hideDone(chores));
    Instant first = doneHiddenAt(anna, chores);

    SyncRequests.push(boris, hideDone(chores))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(doneHiddenAt(anna, chores)).isAfter(first);
  }

  @Test
  void repeatingAPushOfThePressLeavesTheSameMomentAndVersion() throws Exception {
    String press = hideDone(chores);
    SyncRequests.push(anna, press);
    Instant first = doneHiddenAt(anna, chores);
    long version = SyncRequests.version(SyncRequests.pull(anna, 0));

    // The answer was lost: the phone sends its Outbox again.
    SyncRequests.push(anna, press).andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(doneHiddenAt(boris, chores)).isEqualTo(first);
    assertThat(SyncRequests.change(boris, version, "list", chores)).isNull();
  }

  @Test
  void onlyATodoListIsHidden() throws Exception {
    UUID groceries = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();
    SyncRequests.push(
        anna,
        list(groceries, "Супермаркет", "SHOPPING", "SHARED"),
        list(wishes, "Желания Даши", "WISH", "SHARED"));

    SyncRequests.push(anna, hideDone(groceries), hideDone(wishes))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("list.hide_done_not_todo"))
        .andExpect(jsonPath("$.results[0].params.listId").value(groceries.toString()))
        .andExpect(jsonPath("$.results[1].code").value("list.hide_done_not_todo"));

    assertThat(SyncRequests.fields(boris, "list", groceries)).containsEntry("doneHiddenAt", null);
    assertThat(SyncRequests.fields(boris, "list", wishes)).containsEntry("doneHiddenAt", null);
  }

  @Test
  void hideDoneIsOnlyEverAPressIdAndTheMomentIsNeverTakenFromTheDevice() throws Exception {
    SyncRequests.push(
            anna,
            SyncRequests.upsert("list", chores, "{\"hideDone\":true}"),
            SyncRequests.upsert("list", chores, "{\"hideDone\":\"yes\"}"),
            SyncRequests.upsert("list", chores, "{\"hideDone\":null}"),
            SyncRequests.upsert("list", chores, "{\"doneHiddenAt\":\"2020-01-01T00:00:00Z\"}"))
        .andExpect(
            jsonPath(
                "$.results[*].status", contains("rejected", "rejected", "rejected", "applied")))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='hideDone')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='hideDone')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='hideDone')].code")
                .value("value.invalid"));
    assertThat(SyncRequests.fields(boris, "list", chores)).containsEntry("doneHiddenAt", null);
    Instant before = Instant.now();

    // A press carrying a moment of the device's own: the server's clock still sets it.
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "list",
                chores,
                "{\"hideDone\":\"%s\",\"doneHiddenAt\":\"2020-01-01T00:00:00Z\"}"
                    .formatted(UUID.randomUUID())))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(doneHiddenAt(boris, chores)).isAfterOrEqualTo(before.minusSeconds(1));
  }

  @Test
  void aChildsTodoListIsHiddenByAMemberWhoIsNotItsOwner() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID school = UUID.randomUUID();
    SyncRequests.push(
        anna,
        SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
        SyncRequests.upsert(
            "list",
            school,
            "{\"name\":\"Школа\",\"kind\":\"TODO\",\"visibility\":\"SHARED\",\"childId\":\"%s\"}"
                .formatted(masha)));

    SyncRequests.push(boris, hideDone(school))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "list", school).get("doneHiddenAt")).isNotNull();
  }

  /** One press of «Скрыть», with its own id, as the app sends it. */
  private static String hideDone(UUID listId) {
    return SyncRequests.upsert(
        "list", listId, "{\"hideDone\":\"%s\"}".formatted(UUID.randomUUID()));
  }

  private static Instant doneHiddenAt(Browser device, UUID listId) throws Exception {
    return instant(SyncRequests.fields(device, "list", listId), "doneHiddenAt");
  }

  private static Instant doneAt(Browser device, UUID itemId) throws Exception {
    return instant(SyncRequests.fields(device, "item", itemId), "doneAt");
  }

  private static Instant instant(Map<String, Object> fields, String field) {
    Object value = fields.get(field);
    assertThat(value).as(field).isInstanceOf(String.class);
    return Instant.parse((String) value);
  }
}
