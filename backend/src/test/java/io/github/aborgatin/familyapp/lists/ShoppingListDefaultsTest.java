package io.github.aborgatin.familyapp.lists;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import java.util.Comparator;
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
 * A fresh installation starts with the Default Shopping lists (spec #4 stories 46–48; ticket #76):
 * Супермаркет with «Еда», «Бытовая химия» and the Unnamed category last, and Аптека with only the
 * Unnamed category, both Shared and owned by the first Member. Two {@code Browser}s play Anna's
 * phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ShoppingListDefaultsTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshInstallation() {
    FreshInstallation.reset(jdbc);
  }

  @Test
  void theFirstMemberStartsWithSupermarketAndPharmacyOwnedByThemAndShared() throws Exception {
    Browser anna = SyncRequests.bootstrapAnna(mvc);
    String annaId = memberId(anna);

    String pulled = firstPull(anna);

    List<Map<String, Object>> lists = changes(pulled, "list");
    assertThat(lists)
        .extracting(
            l -> field(l, "name"),
            l -> field(l, "kind"),
            l -> field(l, "visibility"),
            l -> field(l, "ownerId"),
            l -> field(l, "unnamedCategoryPosition"))
        .containsExactlyInAnyOrder(
            tuple("Супермаркет", "SHOPPING", "SHARED", annaId, 0.0),
            tuple("Аптека", "SHOPPING", "SHARED", annaId, 0.0));
    Object supermarket = idOf(lists, "Супермаркет");
    assertThat(byPosition(changes(pulled, "category")))
        .extracting(c -> field(c, "listId"), c -> field(c, "name"), c -> field(c, "position"))
        .containsExactly(tuple(supermarket, "Еда", 1.0), tuple(supermarket, "Бытовая химия", 2.0));
  }

  @Test
  void aMemberJoiningThroughAnInviteGetsNoListsOfTheirOwnAndSeesTheFirstMembersDefaults()
      throws Exception {
    Browser anna = SyncRequests.bootstrapAnna(mvc);
    String annasPull = firstPull(anna);

    Browser boris = joinThroughAnInvite(anna);

    String borisPull = firstPull(boris);
    assertThat(changes(borisPull, "list"))
        .extracting(l -> l.get("id"), l -> field(l, "name"), l -> field(l, "ownerId"))
        .containsExactlyInAnyOrderElementsOf(
            changes(annasPull, "list").stream()
                .map(l -> tuple(l.get("id"), field(l, "name"), field(l, "ownerId")))
                .toList());
    assertThat(changes(borisPull, "list")).hasSize(2);
    assertThat(changes(borisPull, "category"))
        .extracting(c -> c.get("id"), c -> field(c, "name"))
        .containsExactlyInAnyOrderElementsOf(
            changes(annasPull, "category").stream()
                .map(c -> tuple(c.get("id"), field(c, "name")))
                .toList());
    assertThat(changes(firstPull(anna), "list")).hasSize(2);
  }

  @Test
  void theDefaultsAreOrdinaryListsAndCategoriesToRenameOrDelete() throws Exception {
    Browser anna = SyncRequests.bootstrapAnna(mvc);
    String pulled = firstPull(anna);
    UUID supermarket = UUID.fromString((String) idOf(changes(pulled, "list"), "Супермаркет"));
    UUID pharmacy = UUID.fromString((String) idOf(changes(pulled, "list"), "Аптека"));
    UUID food = UUID.fromString((String) idOf(changes(pulled, "category"), "Еда"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("list", supermarket, "{\"name\":\"Ашан\"}"),
            SyncRequests.upsert("category", food, "{\"name\":\"Продукты\"}"),
            SyncRequests.delete("list", pharmacy))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied", "applied")));

    String after = firstPull(anna);
    assertThat(changes(after, "list")).extracting(l -> field(l, "name")).containsExactly("Ашан");
    assertThat(changes(after, "category"))
        .extracting(c -> field(c, "name"))
        .containsExactlyInAnyOrder("Продукты", "Бытовая химия");
  }

  /** Anna invites Boris, who registers through the link; returns his logged-in device. */
  private Browser joinThroughAnInvite(Browser anna) throws Exception {
    String url =
        JsonPath.read(
            anna.post("/api/invites")
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            "$.url");
    Browser boris = new Browser(mvc);
    boris.openApp();
    boris
        .postJson(
            "/api/invites/by-token/" + url.substring(url.lastIndexOf('/') + 1) + "/accept",
            """
            {"email":"boris@example.com","password":"boris-pass","displayName":"Борис",
             "grammaticalGender":"MASCULINE"}
            """)
        .andExpect(status().isCreated());
    return boris;
  }

  private static String firstPull(Browser device) throws Exception {
    return SyncRequests.pull(device, 0).andReturn().getResponse().getContentAsString();
  }

  private static List<Map<String, Object>> changes(String pulled, String table) {
    return JsonPath.read(
        pulled, "$.changes[?(@.table=='%s' && @.deleted==false)]".formatted(table));
  }

  private static List<Map<String, Object>> byPosition(List<Map<String, Object>> categories) {
    return categories.stream()
        .sorted(Comparator.comparingDouble(c -> ((Number) field(c, "position")).doubleValue()))
        .toList();
  }

  private static Object idOf(List<Map<String, Object>> lists, String name) {
    return lists.stream()
        .filter(l -> name.equals(field(l, "name")))
        .findFirst()
        .orElseThrow()
        .get("id");
  }

  private static Object field(Map<String, Object> change, String name) {
    return ((Map<?, ?>) change.get("fields")).get(name);
  }

  private static String memberId(Browser device) throws Exception {
    String body = device.openApp().andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.member.id");
  }
}
