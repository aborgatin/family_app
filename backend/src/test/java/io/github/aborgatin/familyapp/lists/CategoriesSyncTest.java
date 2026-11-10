package io.github.aborgatin.familyapp.lists;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.InstanceOfAssertFactories.MAP;
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
 * Categories through the sync push and pull (spec #4; ticket #70): a Shopping list's Categories,
 * the Items in them, and the List's place for the Unnamed category. Two {@code Browser}s play
 * Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class CategoriesSyncTest {

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
  void aCategoryAddedOnOneDeviceArrivesThroughTheOthersPullAndARenameFollows() throws Exception {
    UUID food = UUID.randomUUID();

    SyncRequests.push(boris, category(food, groceries, "  Еда  ", 1.5))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "category", food))
        .containsEntry("listId", groceries.toString())
        .containsEntry("name", "Еда")
        .containsEntry("position", 1.5);

    SyncRequests.push(anna, SyncRequests.upsert("category", food, "{\"name\":\"Продукты\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "category", food))
        .containsEntry("name", "Продукты")
        .containsEntry("position", 1.5);
  }

  @Test
  void onlyAShoppingListHasCategories() throws Exception {
    UUID chores = UUID.randomUUID();
    SyncRequests.push(
        anna,
        SyncRequests.upsert(
            "list", chores, "{\"name\":\"Дела\",\"kind\":\"TODO\",\"visibility\":\"SHARED\"}"));

    SyncRequests.push(boris, category(UUID.randomUUID(), chores, "Дом", 1))
        .andExpect(jsonPath("$.results[*].status", contains("rejected")))
        .andExpect(jsonPath("$.results[0].code").value("category.list_not_shopping"))
        .andExpect(jsonPath("$.results[0].params.listId").value(chores.toString()));
  }

  @Test
  void aCategoryNeedsAKnownListANameOfAtMost100CharactersAndAPosition() throws Exception {
    UUID food = UUID.randomUUID();
    SyncRequests.push(anna, category(food, groceries, "Еда", 1));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("category", UUID.randomUUID(), "{\"name\":\"Еда\",\"position\":1}"),
            category(UUID.randomUUID(), UUID.randomUUID(), "Еда", 1),
            category(UUID.randomUUID(), groceries, "   ", 1),
            category(UUID.randomUUID(), groceries, "я".repeat(101), 1),
            SyncRequests.upsert(
                "category",
                UUID.randomUUID(),
                "{\"listId\":\"%s\",\"name\":\"Еда\"}".formatted(groceries)),
            SyncRequests.upsert("category", food, "{\"position\":\"top\"}"),
            SyncRequests.upsert(
                "category", food, "{\"listId\":\"%s\"}".formatted(UUID.randomUUID())),
            category(UUID.randomUUID(), groceries, "Еда", 2),
            category(UUID.randomUUID(), groceries, "я".repeat(100), 3))
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
                    "applied",
                    "applied")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='listId')].code").value("required"))
        .andExpect(jsonPath("$.results[1].code").value("list.not_found"))
        .andExpect(
            jsonPath("$.results[2].params.errors[?(@.field=='name')].code").value("required"))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='name')].code").value("too_long"))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='position')].code").value("required"))
        .andExpect(
            jsonPath("$.results[5].params.errors[?(@.field=='position')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[6].params.errors[?(@.field=='listId')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(boris, "category", food))
        .containsEntry("listId", groceries.toString())
        .containsEntry("position", 1.0);
  }

  @Test
  void aDeletedCategoryIsATombstoneAndDeleteWinsOverALaterChange() throws Exception {
    UUID food = UUID.randomUUID();
    SyncRequests.push(anna, category(food, groceries, "Еда", 1));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            boris,
            SyncRequests.delete("category", food),
            SyncRequests.upsert("category", food, "{\"name\":\"Продукты\"}"),
            category(food, groceries, "Еда", 1),
            SyncRequests.delete("category", food),
            SyncRequests.delete("category", UUID.randomUUID()))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("applied", "ignored", "ignored", "ignored", "ignored")));

    assertThat(SyncRequests.change(anna, since, "category", food))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(anna, 0, "category", food)).isNull();
  }

  @Test
  void aCategoryCreatedInADeletedListIsIgnored() throws Exception {
    UUID food = UUID.randomUUID();
    SyncRequests.push(anna, SyncRequests.delete("list", groceries));

    SyncRequests.push(boris, category(food, groceries, "Еда", 1))
        .andExpect(jsonPath("$.results[*].status", contains("ignored")));

    assertThat(SyncRequests.change(boris, 0, "category", food)).isNull();
  }

  @Test
  void categoriesOfTheOtherMembersPrivateListNeverReachThePullAndAreUnknownToThePush()
      throws Exception {
    UUID secret = UUID.randomUUID();
    UUID gifts = UUID.randomUUID();
    long since = SyncRequests.version(SyncRequests.pull(anna, 0));
    SyncRequests.push(
        boris,
        ItemsSyncTest.list(secret, "Подарки Анне", "PRIVATE"),
        category(gifts, secret, "Украшения", 1));

    assertThat(SyncRequests.change(anna, 0, "category", gifts)).isNull();
    assertThat(SyncRequests.change(anna, since, "category", gifts))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");

    SyncRequests.push(
            anna,
            SyncRequests.upsert("category", gifts, "{\"name\":\"Цветы\"}"),
            category(UUID.randomUUID(), secret, "Цветы", 2),
            SyncRequests.delete("category", gifts))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains("list.not_found", "list.not_found", "list.not_found")));

    assertThat(SyncRequests.fields(boris, "category", gifts)).containsEntry("name", "Украшения");
  }

  @Test
  void deletingAListDeletesItsCategories() throws Exception {
    UUID food = UUID.randomUUID();
    SyncRequests.push(anna, category(food, groceries, "Еда", 1));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            anna,
            SyncRequests.delete("list", groceries),
            SyncRequests.upsert("category", food, "{\"name\":\"Продукты\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "ignored")));

    assertThat(SyncRequests.change(boris, since, "category", food))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(boris, 0, "category", food)).isNull();
  }

  @Test
  void aPrivateListSharedLaterArrivesWithItsCategoriesAndLeavesWithThemWhenMadePrivateAgain()
      throws Exception {
    UUID gifts = UUID.randomUUID();
    UUID toys = UUID.randomUUID();
    SyncRequests.push(
        anna, ItemsSyncTest.list(gifts, "Подарки", "PRIVATE"), category(toys, gifts, "Игрушки", 1));
    long hidden = SyncRequests.version(SyncRequests.pull(boris, 0));
    assertThat(SyncRequests.change(boris, 0, "category", toys)).isNull();

    SyncRequests.push(anna, SyncRequests.upsert("list", gifts, "{\"visibility\":\"SHARED\"}"));
    long shared = SyncRequests.version(SyncRequests.pull(boris, hidden));

    assertThat(SyncRequests.change(boris, hidden, "category", toys))
        .containsEntry("deleted", false);
    assertThat(SyncRequests.fields(boris, "category", toys)).containsEntry("name", "Игрушки");

    SyncRequests.push(anna, SyncRequests.upsert("list", gifts, "{\"visibility\":\"PRIVATE\"}"));

    assertThat(SyncRequests.change(boris, shared, "category", toys))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.fields(anna, "category", toys)).containsEntry("name", "Игрушки");
  }

  @Test
  void anItemAddedInACategoryArrivesInItAndMovesToTheUnnamedCategoryWithNull() throws Exception {
    UUID food = UUID.randomUUID();
    UUID milk = UUID.randomUUID();
    UUID bread = UUID.randomUUID();
    SyncRequests.push(anna, category(food, groceries, "Еда", 1));

    SyncRequests.push(
            boris,
            addIn(milk, groceries, "Молоко", food),
            ItemsSyncTest.add(bread, groceries, "Хлеб"))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(anna, "item", milk))
        .containsEntry("categoryId", food.toString());
    assertThat(SyncRequests.fields(anna, "item", bread)).containsEntry("categoryId", null);

    SyncRequests.push(
            anna,
            SyncRequests.upsert("item", milk, "{\"categoryId\":null}"),
            SyncRequests.upsert("item", bread, "{\"categoryId\":\"%s\"}".formatted(food)))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(boris, "item", milk)).containsEntry("categoryId", null);
    assertThat(SyncRequests.fields(boris, "item", bread))
        .containsEntry("categoryId", food.toString());
  }

  @Test
  void anItemsCategoryMustBeOneOfItsOwnShoppingList() throws Exception {
    UUID pharmacy = UUID.randomUUID();
    UUID chores = UUID.randomUUID();
    UUID medicine = UUID.randomUUID();
    UUID milk = UUID.randomUUID();
    SyncRequests.push(
        anna,
        ItemsSyncTest.list(pharmacy, "Аптека", "SHARED"),
        SyncRequests.upsert(
            "list", chores, "{\"name\":\"Дела\",\"kind\":\"TODO\",\"visibility\":\"SHARED\"}"),
        category(medicine, pharmacy, "Лекарства", 1),
        ItemsSyncTest.add(milk, groceries, "Молоко"));

    SyncRequests.push(
            boris,
            addIn(UUID.randomUUID(), groceries, "Аспирин", medicine),
            SyncRequests.upsert("item", milk, "{\"categoryId\":\"%s\"}".formatted(medicine)),
            addIn(UUID.randomUUID(), groceries, "Хлеб", UUID.randomUUID()),
            addIn(UUID.randomUUID(), chores, "Пропылесосить", medicine),
            SyncRequests.upsert("item", milk, "{\"categoryId\":\"x\"}"))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("rejected", "rejected", "rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[0:4].code",
                contains(
                    "item.category_not_found",
                    "item.category_not_found",
                    "item.category_not_found",
                    "item.category_not_found")))
        .andExpect(jsonPath("$.results[0].params.categoryId").value(medicine.toString()))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='categoryId')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(anna, "item", milk)).containsEntry("categoryId", null);
  }

  @Test
  void anItemPushedIntoACategoryDeletedMeanwhileIsKeptInTheUnnamedCategory() throws Exception {
    UUID food = UUID.randomUUID();
    UUID milk = UUID.randomUUID();
    SyncRequests.push(anna, category(food, groceries, "Еда", 1));
    SyncRequests.push(anna, SyncRequests.delete("category", food));

    SyncRequests.push(boris, addIn(milk, groceries, "Молоко", food))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "item", milk))
        .containsEntry("text", "Молоко")
        .containsEntry("categoryId", null);
  }

  @Test
  void deletingACategoryMovesItsOpenAndDoneItemsToTheUnnamedCategoryWithNewVersions()
      throws Exception {
    UUID food = UUID.randomUUID();
    UUID chemistry = UUID.randomUUID();
    UUID milk = UUID.randomUUID();
    UUID bread = UUID.randomUUID();
    UUID soap = UUID.randomUUID();
    SyncRequests.push(
        anna,
        category(food, groceries, "Еда", 1),
        category(chemistry, groceries, "Бытовая химия", 2),
        addIn(milk, groceries, "Молоко", food),
        addIn(bread, groceries, "Хлеб", food),
        ItemsSyncTest.done(bread, true),
        addIn(soap, groceries, "Мыло", chemistry));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(anna, SyncRequests.delete("category", food))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.change(boris, since, "item", milk))
        .extracting("fields")
        .asInstanceOf(MAP)
        .containsEntry("text", "Молоко")
        .containsEntry("categoryId", null);
    assertThat(SyncRequests.change(boris, since, "item", bread))
        .extracting("fields")
        .asInstanceOf(MAP)
        .containsEntry("done", true)
        .containsEntry("categoryId", null);
    assertThat(SyncRequests.change(boris, since, "item", soap)).isNull();
    assertThat(SyncRequests.fields(boris, "item", soap))
        .containsEntry("categoryId", chemistry.toString());
  }

  @Test
  void twoDevicesMovingDifferentCategoriesAreBothKept() throws Exception {
    UUID food = UUID.randomUUID();
    UUID chemistry = UUID.randomUUID();
    SyncRequests.push(
        anna, category(food, groceries, "Еда", 1), category(chemistry, groceries, "Химия", 2));

    SyncRequests.push(anna, SyncRequests.upsert("category", food, "{\"position\":3}"));
    SyncRequests.push(boris, SyncRequests.upsert("category", chemistry, "{\"position\":0.5}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "category", food)).containsEntry("position", 3.0);
    assertThat(SyncRequests.fields(anna, "category", chemistry)).containsEntry("position", 0.5);
  }

  @Test
  void theUnnamedCategoryStartsFirstAndItsPlaceAndARenameOfTheListAreBothKept() throws Exception {
    assertThat(SyncRequests.fields(boris, "list", groceries))
        .containsEntry("unnamedCategoryPosition", 0.0);

    SyncRequests.push(anna, SyncRequests.upsert("list", groceries, "{\"name\":\"Ашан\"}"));
    SyncRequests.push(
            boris, SyncRequests.upsert("list", groceries, "{\"unnamedCategoryPosition\":2.5}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "list", groceries))
        .containsEntry("name", "Ашан")
        .containsEntry("unnamedCategoryPosition", 2.5);
  }

  @Test
  void theUnnamedCategorysPlaceIsANumber() throws Exception {
    SyncRequests.push(
            boris,
            SyncRequests.upsert("list", groceries, "{\"unnamedCategoryPosition\":\"last\"}"),
            SyncRequests.upsert("list", groceries, "{\"unnamedCategoryPosition\":null}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected")))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='unnamedCategoryPosition')].code")
                .value("value.invalid"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='unnamedCategoryPosition')].code")
                .value("required"));
  }

  static String addIn(UUID id, UUID listId, String text, UUID categoryId) {
    return SyncRequests.upsert(
        "item",
        id,
        "{\"listId\":\"%s\",\"text\":\"%s\",\"categoryId\":\"%s\"}"
            .formatted(listId, text, categoryId));
  }

  static String category(UUID id, UUID listId, String name, double position) {
    return SyncRequests.upsert(
        "category",
        id,
        "{\"listId\":\"%s\",\"name\":\"%s\",\"position\":%s}".formatted(listId, name, position));
  }
}
