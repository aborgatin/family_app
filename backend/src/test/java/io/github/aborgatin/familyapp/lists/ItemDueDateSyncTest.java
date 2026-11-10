package io.github.aborgatin.familyapp.lists;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
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
 * A todo item's Due date through the sync push and pull (spec #81, ticket #84): a day, optionally
 * with a time of day, both wall-clock values. Two {@code Browser}s play Anna's phone and Boris's
 * phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ItemDueDateSyncTest {

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
    SyncRequests.push(anna, list(chores, "Дела по дому", "TODO"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
  }

  @Test
  void aDueDateWithOrWithoutATimeArrivesThroughTheOthersPull() throws Exception {
    UUID plain = UUID.randomUUID();
    UUID dated = UUID.randomUUID();
    UUID timed = UUID.randomUUID();

    SyncRequests.push(
            anna,
            add(plain, chores, "Полить цветы"),
            add(dated, chores, "Оплатить садик"),
            SyncRequests.upsert("item", dated, "{\"dueDate\":\"2026-11-15\"}"),
            SyncRequests.upsert(
                "item",
                timed,
                "{\"listId\":\"%s\",\"text\":\"Забрать справку\",\"dueDate\":\"2026-11-16\",\"dueTime\":\"15:00\"}"
                    .formatted(chores)))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));

    assertThat(SyncRequests.fields(boris, "item", plain))
        .containsEntry("dueDate", null)
        .containsEntry("dueTime", null);
    assertThat(SyncRequests.fields(boris, "item", dated))
        .containsEntry("dueDate", "2026-11-15")
        .containsEntry("dueTime", null);
    assertThat(SyncRequests.fields(boris, "item", timed))
        .containsEntry("dueDate", "2026-11-16")
        .containsEntry("dueTime", "15:00");
  }

  @Test
  void aDueDateOnAShoppingOrWishItemIsRejected() throws Exception {
    UUID groceries = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();
    UUID milk = UUID.randomUUID();
    UUID lego = UUID.randomUUID();
    SyncRequests.push(
        anna,
        list(groceries, "Супермаркет", "SHOPPING"),
        list(wishes, "Желания", "WISH"),
        add(milk, groceries, "Молоко"),
        add(lego, wishes, "Лего"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", milk, "{\"dueDate\":\"2026-11-15\"}"),
            SyncRequests.upsert("item", lego, "{\"dueTime\":\"15:00\"}"),
            SyncRequests.upsert("item", lego, "{\"dueDate\":null}"),
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Хлеб\",\"dueDate\":\"2026-11-15\"}"
                    .formatted(groceries)))
        .andExpect(
            jsonPath(
                "$.results[*].status", contains("rejected", "rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "item.list_not_todo",
                    "item.list_not_todo",
                    "item.list_not_todo",
                    "item.list_not_todo")))
        .andExpect(jsonPath("$.results[0].params.listId").value(groceries.toString()))
        .andExpect(jsonPath("$.results[1].params.listId").value(wishes.toString()));

    assertThat(SyncRequests.fields(boris, "item", milk))
        .containsEntry("dueDate", null)
        .containsEntry("dueTime", null);
  }

  @Test
  void aTimeWithoutADueDateIsRejected() throws Exception {
    UUID flowers = UUID.randomUUID();
    SyncRequests.push(anna, add(flowers, chores, "Полить цветы"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", flowers, "{\"dueTime\":\"15:00\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueDate\":null,\"dueTime\":\"15:00\"}"),
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Вынести мусор\",\"dueTime\":\"15:00\"}"
                    .formatted(chores)))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "item.due_time_without_due_date",
                    "item.due_time_without_due_date",
                    "item.due_time_without_due_date")));

    assertThat(SyncRequests.fields(boris, "item", flowers)).containsEntry("dueTime", null);
  }

  @Test
  void aMalformedDueDateOrTimeIsRejected() throws Exception {
    UUID flowers = UUID.randomUUID();
    SyncRequests.push(
        anna,
        add(flowers, chores, "Полить цветы"),
        SyncRequests.upsert("item", flowers, "{\"dueDate\":\"2026-11-15\",\"dueTime\":\"15:00\"}"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", flowers, "{\"dueDate\":\"15.11.2026\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueDate\":\"2026-02-30\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueDate\":20261115}"),
            SyncRequests.upsert("item", flowers, "{\"dueDate\":\"2026-11-15T10:00:00Z\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueTime\":\"25:00\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueTime\":\"15:00:30\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueTime\":\"9:05\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueTime\":\"3 pm\"}"),
            SyncRequests.upsert("item", flowers, "{\"dueTime\":900}"),
            SyncRequests.upsert("item", flowers, "{\"dueDate\":\"\",\"dueTime\":\"\"}"))
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
                    "rejected",
                    "rejected",
                    "rejected")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='dueDate')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='dueDate')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='dueDate')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='dueDate')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='dueTime')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[5].params.errors[?(@.field=='dueTime')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[6].params.errors[?(@.field=='dueTime')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[7].params.errors[?(@.field=='dueTime')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[8].params.errors[?(@.field=='dueTime')].code")
                .value("value.invalid"))
        .andExpect(jsonPath("$.results[9].params.errors[*].field", contains("dueDate", "dueTime")));

    assertThat(SyncRequests.fields(boris, "item", flowers))
        .containsEntry("dueDate", "2026-11-15")
        .containsEntry("dueTime", "15:00");
  }

  @Test
  void removingTheDueDateRemovesTheTimeAndTheTimeAloneCanBeRemoved() throws Exception {
    UUID flowers = UUID.randomUUID();
    UUID certificate = UUID.randomUUID();
    String timed = "{\"dueDate\":\"2026-11-15\",\"dueTime\":\"15:00\"}";
    SyncRequests.push(
        anna,
        add(flowers, chores, "Полить цветы"),
        SyncRequests.upsert("item", flowers, timed),
        add(certificate, chores, "Забрать справку"),
        SyncRequests.upsert("item", certificate, timed));

    SyncRequests.push(
            boris,
            SyncRequests.upsert("item", flowers, "{\"dueDate\":null}"),
            SyncRequests.upsert("item", certificate, "{\"dueTime\":null}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(anna, "item", flowers))
        .containsEntry("dueDate", null)
        .containsEntry("dueTime", null);
    assertThat(SyncRequests.fields(anna, "item", certificate))
        .containsEntry("dueDate", "2026-11-15")
        .containsEntry("dueTime", null);
  }

  @Test
  void aDueDateChangedOnOneDeviceAndTheTextOnTheOtherAreBothKept() throws Exception {
    UUID flowers = UUID.randomUUID();
    SyncRequests.push(
        anna,
        add(flowers, chores, "Полить цветы"),
        SyncRequests.upsert("item", flowers, "{\"dueDate\":\"2026-11-15\",\"dueTime\":\"15:00\"}"));

    SyncRequests.push(boris, SyncRequests.upsert("item", flowers, "{\"dueDate\":\"2026-11-20\"}"));
    SyncRequests.push(anna, SyncRequests.upsert("item", flowers, "{\"text\":\"Полить фикус\"}"));

    // A new day alone keeps the time, and a new text alone keeps both.
    assertThat(SyncRequests.fields(anna, "item", flowers))
        .containsEntry("text", "Полить фикус")
        .containsEntry("dueDate", "2026-11-20")
        .containsEntry("dueTime", "15:00");

    SyncRequests.push(boris, SyncRequests.upsert("item", flowers, "{\"dueTime\":\"09:30\"}"));

    assertThat(SyncRequests.fields(anna, "item", flowers))
        .containsEntry("text", "Полить фикус")
        .containsEntry("dueDate", "2026-11-20")
        .containsEntry("dueTime", "09:30");
  }

  static String list(UUID id, String name, String kind) {
    return SyncRequests.upsert(
        "list",
        id,
        "{\"name\":\"%s\",\"kind\":\"%s\",\"visibility\":\"SHARED\"}".formatted(name, kind));
  }

  static String add(UUID id, UUID listId, String text) {
    return SyncRequests.upsert(
        "item", id, "{\"listId\":\"%s\",\"text\":\"%s\"}".formatted(listId, text));
  }
}
