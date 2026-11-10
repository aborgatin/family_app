package io.github.aborgatin.familyapp.lists;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.jayway.jsonpath.JsonPath;
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
 * A todo item's Assignee through the sync push and pull (spec #81, ticket #85): a Member, only on a
 * Shared Todo list. Two {@code Browser}s play Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ItemAssigneeSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  String annaId;
  String borisId;
  UUID chores;

  @BeforeEach
  void annaAndBorisShareATodoList() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    annaId = memberId(anna);
    borisId = memberId(boris);
    chores = UUID.randomUUID();
    SyncRequests.push(anna, list(chores, "Дела по дому", "TODO", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
  }

  @Test
  void anAssigneeTheOtherMemberOrOneselfArrivesThroughTheOthersPull() throws Exception {
    UUID plain = UUID.randomUUID();
    UUID forBoris = UUID.randomUUID();
    UUID forAnna = UUID.randomUUID();

    SyncRequests.push(
            anna,
            add(plain, chores, "Полить цветы"),
            add(forBoris, chores, "Оплатить садик"),
            assign(forBoris, borisId),
            SyncRequests.upsert(
                "item",
                forAnna,
                "{\"listId\":\"%s\",\"text\":\"Забрать справку\",\"assigneeId\":\"%s\"}"
                    .formatted(chores, annaId)))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));

    assertThat(SyncRequests.fields(boris, "item", plain)).containsEntry("assigneeId", null);
    assertThat(SyncRequests.fields(boris, "item", forBoris)).containsEntry("assigneeId", borisId);
    assertThat(SyncRequests.fields(boris, "item", forAnna)).containsEntry("assigneeId", annaId);

    SyncRequests.push(boris, assign(forBoris, null), assign(forAnna, borisId))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(anna, "item", forBoris)).containsEntry("assigneeId", null);
    assertThat(SyncRequests.fields(anna, "item", forAnna)).containsEntry("assigneeId", borisId);
  }

  @Test
  void anAssigneeOnAShoppingOrWishItemIsRejected() throws Exception {
    UUID groceries = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();
    UUID milk = UUID.randomUUID();
    UUID lego = UUID.randomUUID();
    SyncRequests.push(
        anna,
        list(groceries, "Супермаркет", "SHOPPING", "SHARED"),
        list(wishes, "Желания", "WISH", "SHARED"),
        add(milk, groceries, "Молоко"),
        add(lego, wishes, "Лего"));

    SyncRequests.push(
            anna,
            assign(milk, borisId),
            assign(lego, annaId),
            assign(lego, null),
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Хлеб\",\"assigneeId\":\"%s\"}"
                    .formatted(groceries, borisId)))
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

    assertThat(SyncRequests.fields(boris, "item", milk)).containsEntry("assigneeId", null);
  }

  @Test
  void anAssigneeOnAPrivateListIsRejected() throws Exception {
    UUID secrets = UUID.randomUUID();
    UUID gift = UUID.randomUUID();
    SyncRequests.push(
        anna, list(secrets, "Подарки Борису", "TODO", "PRIVATE"), add(gift, secrets, "Часы"));

    SyncRequests.push(
            anna,
            assign(gift, annaId),
            assign(gift, borisId),
            SyncRequests.upsert(
                "item",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"text\":\"Открытка\",\"assigneeId\":\"%s\"}"
                    .formatted(secrets, annaId)))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "item.assignee_on_private_list",
                    "item.assignee_on_private_list",
                    "item.assignee_on_private_list")))
        .andExpect(jsonPath("$.results[0].params.listId").value(secrets.toString()));

    assertThat(SyncRequests.fields(anna, "item", gift)).containsEntry("assigneeId", null);
  }

  @Test
  void removingTheAssigneeOnAPrivateListChangesNothingAndIsNotRejected() throws Exception {
    // The Owner's other phone may remove an Assignee while the List is being made Private.
    UUID secrets = UUID.randomUUID();
    UUID gift = UUID.randomUUID();
    SyncRequests.push(
        anna, list(secrets, "Подарки Борису", "TODO", "PRIVATE"), add(gift, secrets, "Часы"));

    SyncRequests.push(anna, assign(gift, null))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "item", gift)).containsEntry("assigneeId", null);
  }

  @Test
  void anAssigneeWhoIsNoMemberIsRejected() throws Exception {
    UUID flowers = UUID.randomUUID();
    UUID nobody = UUID.randomUUID();
    SyncRequests.push(anna, add(flowers, chores, "Полить цветы"), assign(flowers, borisId));

    SyncRequests.push(
            anna,
            assign(flowers, nobody.toString()),
            assign(flowers, chores.toString()),
            assign(flowers, "Борис"),
            SyncRequests.upsert("item", flowers, "{\"assigneeId\":7}"))
        .andExpect(
            jsonPath(
                "$.results[*].status", contains("rejected", "rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "item.assignee_not_found",
                    "item.assignee_not_found",
                    "validation.failed",
                    "validation.failed")))
        .andExpect(jsonPath("$.results[0].params.assigneeId").value(nobody.toString()))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='assigneeId')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='assigneeId')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(boris, "item", flowers)).containsEntry("assigneeId", borisId);
  }

  @Test
  void makingTheListPrivateRemovesEveryAssigneeAndSharedAgainRestoresNothing() throws Exception {
    UUID flowers = UUID.randomUUID();
    UUID nursery = UUID.randomUUID();
    UUID rubbish = UUID.randomUUID();
    UUID elsewhere = UUID.randomUUID();
    UUID other = UUID.randomUUID();
    SyncRequests.push(
        anna,
        add(flowers, chores, "Полить цветы"),
        assign(flowers, borisId),
        add(nursery, chores, "Оплатить садик"),
        assign(nursery, annaId),
        add(rubbish, chores, "Вынести мусор"),
        assign(rubbish, borisId),
        SyncRequests.upsert("item", rubbish, "{\"done\":true}"),
        list(other, "Ремонт", "TODO", "SHARED"),
        add(elsewhere, other, "Купить краску"),
        assign(elsewhere, borisId));
    long shared = SyncRequests.version(SyncRequests.pull(anna, 0));

    SyncRequests.push(anna, SyncRequests.upsert("list", chores, "{\"visibility\":\"PRIVATE\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    // Open and Done Items alike, each with a new Version: the Owner's other phone pulls them.
    for (UUID item : new UUID[] {flowers, nursery, rubbish}) {
      assertThat(SyncRequests.change(anna, shared, "item", item))
          .extracting("fields.assigneeId")
          .isNull();
      assertThat(SyncRequests.fields(anna, "item", item)).containsEntry("assigneeId", null);
    }
    // Another List's Items keep theirs.
    assertThat(SyncRequests.fields(anna, "item", elsewhere)).containsEntry("assigneeId", borisId);

    SyncRequests.push(anna, SyncRequests.upsert("list", chores, "{\"visibility\":\"SHARED\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "item", flowers)).containsEntry("assigneeId", null);
    assertThat(SyncRequests.fields(boris, "item", nursery)).containsEntry("assigneeId", null);
    assertThat(SyncRequests.fields(boris, "item", rubbish)).containsEntry("assigneeId", null);
  }

  @Test
  void anAssigneeSetOnOneDeviceAndADueDateOnTheOtherAreBothKept() throws Exception {
    UUID flowers = UUID.randomUUID();
    SyncRequests.push(anna, add(flowers, chores, "Полить цветы"));

    SyncRequests.push(anna, assign(flowers, borisId));
    SyncRequests.push(
        boris,
        SyncRequests.upsert("item", flowers, "{\"dueDate\":\"2026-11-15\",\"dueTime\":\"15:00\"}"));

    assertThat(SyncRequests.fields(anna, "item", flowers))
        .containsEntry("assigneeId", borisId)
        .containsEntry("dueDate", "2026-11-15")
        .containsEntry("dueTime", "15:00");

    SyncRequests.push(anna, SyncRequests.upsert("item", flowers, "{\"dueDate\":null}"));
    SyncRequests.push(boris, assign(flowers, annaId));

    assertThat(SyncRequests.fields(boris, "item", flowers))
        .containsEntry("assigneeId", annaId)
        .containsEntry("dueDate", null);
  }

  static String list(UUID id, String name, String kind, String visibility) {
    return SyncRequests.upsert(
        "list",
        id,
        "{\"name\":\"%s\",\"kind\":\"%s\",\"visibility\":\"%s\"}"
            .formatted(name, kind, visibility));
  }

  static String add(UUID id, UUID listId, String text) {
    return SyncRequests.upsert(
        "item", id, "{\"listId\":\"%s\",\"text\":\"%s\"}".formatted(listId, text));
  }

  /** Sets the Item's Assignee; {@code null} is nobody. */
  static String assign(UUID id, String memberId) {
    return SyncRequests.upsert(
        "item",
        id,
        memberId == null ? "{\"assigneeId\":null}" : "{\"assigneeId\":\"%s\"}".formatted(memberId));
  }

  private static String memberId(Browser device) throws Exception {
    String body = device.openApp().andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.member.id");
  }
}
