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
 * Lists through the sync push and pull (spec #3; ticket #55): creating them, the rules on their
 * fields, and Visibility in the pull. Two {@code Browser}s play Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ListsSyncTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;

  @BeforeEach
  void annaAndBorisAreLoggedIn() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
  }

  @Test
  void aSharedListCreatedOnOneDeviceArrivesThroughTheOthersPull() throws Exception {
    UUID groceries = UUID.randomUUID();
    Instant before = Instant.now();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "list",
                groceries,
                "{\"name\":\"  Супермаркет  \",\"kind\":\"SHOPPING\",\"visibility\":\"SHARED\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    Map<String, Object> fields = SyncRequests.fields(boris, "list", groceries);
    assertThat(fields)
        .containsEntry("name", "Супермаркет")
        .containsEntry("kind", "SHOPPING")
        .containsEntry("visibility", "SHARED")
        .containsEntry("ownerId", memberId(anna));
    assertThat(Instant.parse((String) fields.get("createdAt"))).isAfter(before.minusSeconds(1));
  }

  @Test
  void aPrivateListReachesOnlyItsOwner() throws Exception {
    UUID gifts = UUID.randomUUID();

    SyncRequests.push(boris, create(gifts, "Подарки Анне", "TODO", "PRIVATE"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(boris, "list", gifts))
        .containsEntry("name", "Подарки Анне")
        .containsEntry("visibility", "PRIVATE");
    assertThat(SyncRequests.change(anna, 0, "list", gifts)).isNull();
  }

  @Test
  void aChangeToTheOtherMembersPrivateListReachesThePullOnlyAsATombstone() throws Exception {
    UUID gifts = UUID.randomUUID();
    long since = SyncRequests.version(SyncRequests.pull(anna, 0));

    SyncRequests.push(boris, create(gifts, "Подарки Анне", "TODO", "PRIVATE"));

    Map<String, Object> change = SyncRequests.change(anna, since, "list", gifts);
    assertThat(change).containsEntry("deleted", true).doesNotContainKey("fields");
  }

  @Test
  void anUpsertOfAKnownListChangesOnlyTheFieldsItCarriesAndKeepsTheOwner() throws Exception {
    UUID groceries = UUID.randomUUID();
    SyncRequests.push(anna, create(groceries, "Супермаркет", "SHOPPING", "SHARED"));
    Map<String, Object> created = SyncRequests.fields(anna, "list", groceries);

    SyncRequests.push(boris, SyncRequests.upsert("list", groceries, "{\"name\":\"Ашан\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "list", groceries))
        .containsEntry("name", "Ашан")
        .containsEntry("kind", "SHOPPING")
        .containsEntry("visibility", "SHARED")
        .containsEntry("ownerId", memberId(anna))
        .containsEntry("createdAt", created.get("createdAt"));
  }

  @Test
  void aListNeedsANameOfAtMost100CharactersAKnownKindAndAVisibility() throws Exception {
    UUID nameless = UUID.randomUUID();
    UUID tooLong = UUID.randomUUID();
    UUID longest = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert("list", nameless, "{\"name\":\"   \",\"kind\":\"BOOKS\"}"),
            create(tooLong, "я".repeat(101), "TODO", "SHARED"),
            create(longest, "я".repeat(100), "TODO", "SHARED"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "applied")))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='name')].code").value("required"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='kind')].code").value("value.invalid"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='visibility')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='name')].code").value("too_long"));

    assertThat(SyncRequests.fields(boris, "list", nameless)).isNull();
    assertThat(SyncRequests.fields(boris, "list", tooLong)).isNull();
  }

  @Test
  void aListsKindNeverChanges() throws Exception {
    UUID groceries = UUID.randomUUID();
    SyncRequests.push(anna, create(groceries, "Супермаркет", "SHOPPING", "SHARED"));

    SyncRequests.push(
            boris,
            SyncRequests.upsert("list", groceries, "{\"kind\":\"TODO\",\"name\":\"Дела\"}"),
            SyncRequests.upsert("list", groceries, "{\"kind\":\"SHOPPING\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "applied")))
        .andExpect(jsonPath("$.results[0].code").value("list.kind_immutable"));

    assertThat(SyncRequests.fields(anna, "list", groceries))
        .containsEntry("kind", "SHOPPING")
        .containsEntry("name", "Супермаркет");
  }

  @Test
  void aWishListIsNeverPrivate() throws Exception {
    UUID secretWishes = UUID.randomUUID();
    UUID wishes = UUID.randomUUID();

    SyncRequests.push(
            anna,
            create(secretWishes, "Тайные желания", "WISH", "PRIVATE"),
            create(wishes, "Желания Маши", "WISH", "SHARED"),
            SyncRequests.upsert("list", wishes, "{\"visibility\":\"PRIVATE\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "applied", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("list.wish_shared_only"))
        .andExpect(jsonPath("$.results[2].code").value("list.wish_shared_only"));

    assertThat(SyncRequests.fields(anna, "list", secretWishes)).isNull();
    assertThat(SyncRequests.fields(boris, "list", wishes)).containsEntry("visibility", "SHARED");
  }

  @Test
  void theOtherMembersPrivateListIsUnknownToEveryOperation() throws Exception {
    UUID gifts = UUID.randomUUID();
    SyncRequests.push(boris, create(gifts, "Подарки Анне", "TODO", "PRIVATE"));

    SyncRequests.push(
            anna,
            SyncRequests.upsert("list", gifts, "{\"name\":\"Моё\"}"),
            create(gifts, "Моё", "TODO", "SHARED"),
            SyncRequests.delete("list", gifts))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "rejected")))
        .andExpect(jsonPath("$.results[*].code", contains(notFound(), notFound(), notFound())));

    assertThat(SyncRequests.fields(boris, "list", gifts))
        .containsEntry("name", "Подарки Анне")
        .containsEntry("visibility", "PRIVATE");
  }

  @Test
  void repeatingAWholePushLeavesTheSameState() throws Exception {
    UUID groceries = UUID.randomUUID();
    String[] push = {
      create(groceries, "Супермаркет", "SHOPPING", "SHARED"),
      SyncRequests.upsert("list", groceries, "{\"name\":\"Ашан\"}")
    };

    SyncRequests.push(anna, push);
    Map<String, Object> once = SyncRequests.fields(boris, "list", groceries);
    SyncRequests.push(anna, push)
        .andExpect(jsonPath("$.results[*].status", contains("applied", "applied")));

    assertThat(SyncRequests.fields(boris, "list", groceries)).isEqualTo(once);
  }

  @Test
  void aDeletedListIsATombstoneAndDeleteWinsOverALaterChange() throws Exception {
    UUID groceries = UUID.randomUUID();
    SyncRequests.push(anna, create(groceries, "Супермаркет", "SHOPPING", "SHARED"));
    long since = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            boris,
            SyncRequests.delete("list", groceries),
            SyncRequests.upsert("list", groceries, "{\"name\":\"Ашан\"}"),
            SyncRequests.delete("list", UUID.randomUUID()))
        .andExpect(jsonPath("$.results[*].status", contains("applied", "ignored", "ignored")));

    assertThat(SyncRequests.change(anna, since, "list", groceries))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    assertThat(SyncRequests.change(anna, 0, "list", groceries)).isNull();
  }

  private static String notFound() {
    return "list.not_found";
  }

  private static String create(UUID id, String name, String kind, String visibility) {
    return SyncRequests.upsert(
        "list",
        id,
        "{\"name\":\"%s\",\"kind\":\"%s\",\"visibility\":\"%s\"}"
            .formatted(name, kind, visibility));
  }

  private static String memberId(Browser device) throws Exception {
    String body = device.openApp().andReturn().getResponse().getContentAsString();
    return JsonPath.read(body, "$.member.id");
  }
}
