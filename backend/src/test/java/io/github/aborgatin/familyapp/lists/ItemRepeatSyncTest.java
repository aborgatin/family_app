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
 * A todo item's Repeat through the sync push and pull (spec #81, ticket #86): daily, weekly,
 * monthly or yearly, only with a Due date. What marking a repeating item Done does is ticket #87.
 * Two {@code Browser}s play Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ItemRepeatSyncTest {

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
  void eachRepeatArrivesThroughTheOthersPullAndCanBeRemoved() throws Exception {
    UUID plain = UUID.randomUUID();
    UUID daily = UUID.randomUUID();
    UUID weekly = UUID.randomUUID();
    UUID monthly = UUID.randomUUID();
    UUID yearly = UUID.randomUUID();

    SyncRequests.push(
            anna,
            add(plain, chores, "Полить цветы"),
            SyncRequests.upsert("item", plain, "{\"dueDate\":\"2026-11-15\"}"),
            dated(daily, "Покормить кота", "DAILY"),
            dated(weekly, "Вынести мусор", "WEEKLY"),
            dated(monthly, "Оплатить садик", "MONTHLY"),
            add(yearly, chores, "Поменять шины"),
            SyncRequests.upsert(
                "item", yearly, "{\"dueDate\":\"2026-11-15\",\"repeat\":\"YEARLY\"}"))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains(
                    "applied", "applied", "applied", "applied", "applied", "applied", "applied")));

    assertThat(SyncRequests.fields(boris, "item", plain)).containsEntry("repeat", null);
    assertThat(SyncRequests.fields(boris, "item", daily)).containsEntry("repeat", "DAILY");
    assertThat(SyncRequests.fields(boris, "item", weekly)).containsEntry("repeat", "WEEKLY");
    assertThat(SyncRequests.fields(boris, "item", monthly)).containsEntry("repeat", "MONTHLY");
    assertThat(SyncRequests.fields(boris, "item", yearly)).containsEntry("repeat", "YEARLY");

    SyncRequests.push(
            boris,
            SyncRequests.upsert("item", daily, "{\"repeat\":null}"),
            SyncRequests.upsert("item", weekly, "{\"repeat\":\"MONTHLY\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(anna, "item", daily))
        .containsEntry("repeat", null)
        .containsEntry("dueDate", "2026-11-15");
    assertThat(SyncRequests.fields(anna, "item", weekly)).containsEntry("repeat", "MONTHLY");
  }

  @Test
  void aRepeatOnAShoppingOrWishItemIsRejected() throws Exception {
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
            SyncRequests.upsert("item", milk, "{\"repeat\":\"WEEKLY\"}"),
            SyncRequests.upsert("item", lego, "{\"repeat\":null}"),
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Хлеб\",\"repeat\":\"DAILY\"}".formatted(groceries)))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains("item.list_not_todo", "item.list_not_todo", "item.list_not_todo")))
        .andExpect(jsonPath("$.results[0].params.listId").value(groceries.toString()))
        .andExpect(jsonPath("$.results[1].params.listId").value(wishes.toString()));

    assertThat(SyncRequests.fields(boris, "item", milk)).containsEntry("repeat", null);
  }

  @Test
  void aRepeatWithoutADueDateIsRejected() throws Exception {
    UUID flowers = UUID.randomUUID();
    UUID rubbish = UUID.randomUUID();
    SyncRequests.push(
        anna, add(flowers, chores, "Полить цветы"), dated(rubbish, "Вынести мусор", "WEEKLY"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", flowers, "{\"repeat\":\"DAILY\"}"),
            SyncRequests.upsert("item", rubbish, "{\"dueDate\":null,\"repeat\":\"WEEKLY\"}"),
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Покормить кота\",\"repeat\":\"DAILY\"}"
                    .formatted(chores)))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "item.repeat_without_due_date",
                    "item.repeat_without_due_date",
                    "item.repeat_without_due_date")));

    assertThat(SyncRequests.fields(boris, "item", flowers)).containsEntry("repeat", null);
    assertThat(SyncRequests.fields(boris, "item", rubbish))
        .containsEntry("dueDate", "2026-11-15")
        .containsEntry("repeat", "WEEKLY");
  }

  @Test
  void anUnknownRepeatIsRejected() throws Exception {
    UUID rubbish = UUID.randomUUID();
    SyncRequests.push(anna, dated(rubbish, "Вынести мусор", "WEEKLY"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", rubbish, "{\"repeat\":\"HOURLY\"}"),
            SyncRequests.upsert("item", rubbish, "{\"repeat\":\"weekly\"}"),
            SyncRequests.upsert("item", rubbish, "{\"repeat\":\"\"}"),
            SyncRequests.upsert("item", rubbish, "{\"repeat\":7}"))
        .andExpect(
            jsonPath(
                "$.results[*].status", contains("rejected", "rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "validation.failed",
                    "validation.failed",
                    "validation.failed",
                    "validation.failed")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='repeat')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='repeat')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(boris, "item", rubbish)).containsEntry("repeat", "WEEKLY");
  }

  @Test
  void removingTheDueDateRemovesTheRepeatAndANewDayKeepsIt() throws Exception {
    UUID rubbish = UUID.randomUUID();
    UUID nursery = UUID.randomUUID();
    SyncRequests.push(
        anna,
        dated(rubbish, "Вынести мусор", "WEEKLY"),
        dated(nursery, "Оплатить садик", "MONTHLY"));

    SyncRequests.push(
            boris,
            SyncRequests.upsert("item", rubbish, "{\"dueDate\":null}"),
            SyncRequests.upsert("item", nursery, "{\"dueDate\":\"2026-12-01\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(anna, "item", rubbish))
        .containsEntry("dueDate", null)
        .containsEntry("repeat", null);
    assertThat(SyncRequests.fields(anna, "item", nursery))
        .containsEntry("dueDate", "2026-12-01")
        .containsEntry("repeat", "MONTHLY");

    // A Due date given back does not bring the Repeat back.
    SyncRequests.push(anna, SyncRequests.upsert("item", rubbish, "{\"dueDate\":\"2026-11-20\"}"));
    assertThat(SyncRequests.fields(boris, "item", rubbish)).containsEntry("repeat", null);
  }

  @Test
  void aRepeatSetOnOneDeviceAndTheTextOnTheOtherAreBothKept() throws Exception {
    UUID rubbish = UUID.randomUUID();
    SyncRequests.push(
        anna,
        add(rubbish, chores, "Вынести мусор"),
        SyncRequests.upsert("item", rubbish, "{\"dueDate\":\"2026-11-15\"}"));

    SyncRequests.push(anna, SyncRequests.upsert("item", rubbish, "{\"repeat\":\"WEEKLY\"}"));
    SyncRequests.push(boris, SyncRequests.upsert("item", rubbish, "{\"text\":\"Мусор и стекло\"}"));

    assertThat(SyncRequests.fields(anna, "item", rubbish))
        .containsEntry("text", "Мусор и стекло")
        .containsEntry("dueDate", "2026-11-15")
        .containsEntry("repeat", "WEEKLY");
  }

  /** Creates an open Item due on 15 November 2026 with this Repeat, in one upsert. */
  String dated(UUID id, String text, String repeat) {
    return SyncRequests.upsert(
        "item",
        id,
        "{\"listId\":\"%s\",\"text\":\"%s\",\"dueDate\":\"2026-11-15\",\"repeat\":\"%s\"}"
            .formatted(chores, text, repeat));
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
