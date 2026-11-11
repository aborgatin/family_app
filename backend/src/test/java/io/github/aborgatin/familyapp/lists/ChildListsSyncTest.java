package io.github.aborgatin.familyapp.lists;

import static io.github.aborgatin.familyapp.ListOperations.add;
import static io.github.aborgatin.familyapp.ListOperations.list;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
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
 * Child lists through the sync push and pull (spec #81; ticket #90): a List tied to a Child for
 * good, always Shared, of kind TODO or WISH, and deleted with the Child. Two {@code Browser}s play
 * Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildListsSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  UUID masha;

  @BeforeEach
  void annaAndBorisAreLoggedInAndHaveAChild() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    masha = child("Маша");
  }

  @Test
  void aChildListArrivesThroughTheOthersPullWithItsChildAndAnOrdinaryListWithNone()
      throws Exception {
    UUID school = UUID.randomUUID();
    UUID groceries = UUID.randomUUID();

    SyncRequests.push(
            anna,
            childList(school, "Школа", "TODO", masha),
            list(groceries, "Супермаркет", "SHOPPING", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(boris, "list", school))
        .containsEntry("name", "Школа")
        .containsEntry("kind", "TODO")
        .containsEntry("visibility", "SHARED")
        .containsEntry("childId", masha.toString())
        .containsEntry("ownerId", SyncRequests.memberId(anna));
    assertThat(SyncRequests.fields(boris, "list", groceries)).containsEntry("childId", null);
  }

  @Test
  void aWishListCreatedWithoutAChildIsSharedAndTiedToNobody() throws Exception {
    UUID wishes = UUID.randomUUID();

    SyncRequests.push(anna, list(wishes, "Желания Даши", "WISH", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "list", wishes))
        .containsEntry("visibility", "SHARED")
        .containsEntry("childId", null);
  }

  @Test
  void aChildListIsNeverAShoppingList() throws Exception {
    UUID shopping = UUID.randomUUID();

    SyncRequests.push(anna, childList(shopping, "Покупки Маши", "SHOPPING", masha))
        .andExpect(jsonPath("$.results[*].status", contains("rejected")))
        .andExpect(jsonPath("$.results[0].code").value("list.child_not_shopping"));

    assertThat(SyncRequests.fields(anna, "list", shopping)).isNull();
  }

  @Test
  void aChildListIsNeverPrivateOnCreateOrLater() throws Exception {
    UUID secret = UUID.randomUUID();
    UUID school = UUID.randomUUID();

    SyncRequests.push(
            anna,
            childList(secret, "Сюрприз", "TODO", "PRIVATE", masha.toString()),
            childList(school, "Школа", "TODO", masha),
            SyncRequests.upsert("list", school, "{\"visibility\":\"PRIVATE\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "applied", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("list.child_shared_only"))
        .andExpect(jsonPath("$.results[2].code").value("list.child_shared_only"));

    assertThat(SyncRequests.fields(anna, "list", secret)).isNull();
    assertThat(SyncRequests.fields(boris, "list", school)).containsEntry("visibility", "SHARED");
  }

  @Test
  void aListsChildNeverChanges() throws Exception {
    UUID petya = child("Петя");
    UUID school = UUID.randomUUID();
    UUID chores = UUID.randomUUID();
    SyncRequests.push(
        anna, childList(school, "Школа", "TODO", masha), list(chores, "Дела", "TODO", "SHARED"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("list", school, "{\"childId\":\"%s\"}".formatted(petya)),
            SyncRequests.upsert("list", school, "{\"childId\":null,\"name\":\"Ничья\"}"),
            SyncRequests.upsert("list", chores, "{\"childId\":\"%s\"}".formatted(masha)),
            SyncRequests.upsert(
                "list", school, "{\"childId\":\"%s\",\"name\":\"Уроки\"}".formatted(masha)),
            SyncRequests.upsert("list", chores, "{\"childId\":null,\"name\":\"По дому\"}"))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("rejected", "rejected", "rejected", "applied", "applied")))
        .andExpect(jsonPath("$.results[0].code").value("list.child_immutable"))
        .andExpect(jsonPath("$.results[1].code").value("list.child_immutable"))
        .andExpect(jsonPath("$.results[2].code").value("list.child_immutable"));

    assertThat(SyncRequests.fields(boris, "list", school))
        .containsEntry("childId", masha.toString())
        .containsEntry("name", "Уроки");
    assertThat(SyncRequests.fields(boris, "list", chores))
        .containsEntry("childId", null)
        .containsEntry("name", "По дому");
  }

  @Test
  void aChildListNeedsAKnownChild() throws Exception {
    UUID nobody = UUID.randomUUID();
    UUID school = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();

    SyncRequests.push(
            anna,
            childList(school, "Школа", "TODO", nobody),
            childList(wishes, "Желания", "WISH", "SHARED", "not-a-child"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("list.child_not_found"))
        .andExpect(jsonPath("$.results[0].params.childId").value(nobody.toString()))
        .andExpect(jsonPath("$.results[1].code").value("validation.failed"))
        .andExpect(jsonPath("$.results[1].params.errors[0].field").value("childId"));

    assertThat(SyncRequests.fields(anna, "list", school)).isNull();
    assertThat(SyncRequests.fields(anna, "list", wishes)).isNull();
  }

  @Test
  void aChildListCreatedForAChildDeletedMeanwhileIsIgnored() throws Exception {
    UUID school = UUID.randomUUID();
    SyncRequests.push(boris, SyncRequests.delete("child", masha));

    SyncRequests.push(anna, childList(school, "Школа", "TODO", masha))
        .andExpect(jsonPath("$.results[*].status", contains("ignored")));

    assertThat(SyncRequests.fields(anna, "list", school)).isNull();
  }

  @Test
  void theCreatorOwnsAChildListEitherMemberRenamesItAndOnlyTheOwnerDeletesIt() throws Exception {
    UUID wishes = UUID.randomUUID();
    SyncRequests.push(boris, childList(wishes, "Желания Маши", "WISH", masha));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("list", wishes, "{\"name\":\"Подарки Маше\"}"),
            SyncRequests.delete("list", wishes))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "rejected")))
        .andExpect(jsonPath("$.results[1].code").value("list.owner_only"));

    assertThat(SyncRequests.fields(anna, "list", wishes))
        .containsEntry("name", "Подарки Маше")
        .containsEntry("ownerId", SyncRequests.memberId(boris));

    SyncRequests.push(boris, SyncRequests.delete("list", wishes))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "list", wishes)).isNull();
  }

  @Test
  void deletingAChildDeletesItsChildListsAndTheirItemsWhoeverOwnsThem() throws Exception {
    UUID petya = child("Петя");
    UUID school = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();
    UUID petyasWishes = UUID.randomUUID();
    UUID chores = UUID.randomUUID();
    UUID homework = UUID.randomUUID();
    UUID doll = UUID.randomUUID();
    UUID robot = UUID.randomUUID();
    UUID dishes = UUID.randomUUID();
    SyncRequests.push(
        anna,
        childList(school, "Школа", "TODO", masha),
        add(homework, school, "Уроки"),
        childList(petyasWishes, "Желания Пети", "WISH", petya),
        add(robot, petyasWishes, "Робот"),
        list(chores, "Дела", "TODO", "SHARED"),
        add(dishes, chores, "Посуда"));
    SyncRequests.push(
        boris, childList(wishes, "Желания Маши", "WISH", masha), add(doll, wishes, "Кукла"));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(anna, SyncRequests.delete("child", masha))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    for (Map.Entry<String, UUID> gone :
        List.of(
            Map.entry("child", masha),
            Map.entry("list", school),
            Map.entry("list", wishes),
            Map.entry("item", homework),
            Map.entry("item", doll))) {
      assertThat(SyncRequests.change(boris, since, gone.getKey(), gone.getValue()))
          .as("%s %s", gone.getKey(), gone.getValue())
          .containsEntry("deleted", true)
          .doesNotContainKey("fields");
      assertThat(SyncRequests.fields(boris, gone.getKey(), gone.getValue())).isNull();
    }
    assertThat(SyncRequests.change(boris, since, "list", petyasWishes)).isNull();
    assertThat(SyncRequests.fields(boris, "list", petyasWishes)).isNotNull();
    assertThat(SyncRequests.fields(boris, "item", robot)).isNotNull();
    assertThat(SyncRequests.fields(boris, "list", chores)).isNotNull();
    assertThat(SyncRequests.fields(boris, "item", dishes)).isNotNull();

    SyncRequests.push(
            boris,
            SyncRequests.upsert("list", wishes, "{\"name\":\"Подарки\"}"),
            add(UUID.randomUUID(), wishes, "Мяч"),
            SyncRequests.upsert("item", doll, "{\"text\":\"Большая кукла\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("ignored", "ignored", "ignored")));
  }

  private UUID child(String name) throws Exception {
    UUID id = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "child", id, "{\"name\":\"%s\",\"color\":\"coral\"}".formatted(name)))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    return id;
  }

  private static String childList(UUID id, String name, String kind, UUID childId) {
    return childList(id, name, kind, "SHARED", childId.toString());
  }

  private static String childList(
      UUID id, String name, String kind, String visibility, String childId) {
    return SyncRequests.upsert(
        "list",
        id,
        "{\"name\":\"%s\",\"kind\":\"%s\",\"visibility\":\"%s\",\"childId\":\"%s\"}"
            .formatted(name, kind, visibility, childId));
  }
}
