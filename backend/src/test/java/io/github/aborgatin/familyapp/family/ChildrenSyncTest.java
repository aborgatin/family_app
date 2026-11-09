package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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
 * Children through the sync push and pull (spec #3 "Write path", "Read path"; ticket #52). Two
 * {@code Browser}s play two devices: Anna's phone and Boris's phone.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class ChildrenSyncTest {

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
  void aChildPushedByOneDeviceArrivesThroughTheOthersPull() throws Exception {
    UUID masha = UUID.randomUUID();

    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "child",
                masha,
                "{\"name\":\"  Маша  \",\"color\":\"coral\",\"birthday\":\"2019-04-12\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("applied")))
        .andExpect(jsonPath("$.version").isNumber());

    SyncRequests.pull(boris, 0)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").isNumber())
        .andExpect(jsonPath("$.changes[?(@.table=='child')].id", contains(masha.toString())))
        .andExpect(jsonPath("$.changes[?(@.table=='child')].deleted", contains(false)))
        .andExpect(jsonPath("$.changes[?(@.table=='child')].fields.name", contains("Маша")))
        .andExpect(jsonPath("$.changes[?(@.table=='child')].fields.color", contains("coral")))
        .andExpect(
            jsonPath("$.changes[?(@.table=='child')].fields.birthday", contains("2019-04-12")));
  }

  @Test
  void anUpsertOfAKnownChildChangesOnlyTheFieldsItCarries() throws Exception {
    UUID masha = addMasha();

    SyncRequests.push(boris, SyncRequests.upsert("child", masha, "{\"color\":\"teal\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(SyncRequests.fields(anna, "child", masha))
        .containsEntry("name", "Маша")
        .containsEntry("color", "teal")
        .containsEntry("birthday", "2019-04-12");
  }

  @Test
  void theSameFieldChangedOnTwoDevicesKeepsTheChangeTheServerReceivedLater() throws Exception {
    UUID masha = addMasha();

    SyncRequests.push(boris, SyncRequests.upsert("child", masha, "{\"name\":\"Мария\"}"));
    SyncRequests.push(anna, SyncRequests.upsert("child", masha, "{\"name\":\"Маруся\"}"));

    assertThat(SyncRequests.fields(boris, "child", masha)).containsEntry("name", "Маруся");
  }

  @Test
  void differentFieldsChangedOnTwoDevicesAreBothKept() throws Exception {
    UUID masha = addMasha();

    SyncRequests.push(boris, SyncRequests.upsert("child", masha, "{\"name\":\"Мария\"}"));
    SyncRequests.push(anna, SyncRequests.upsert("child", masha, "{\"birthday\":null}"));

    Map<String, Object> fields = SyncRequests.fields(boris, "child", masha);
    assertThat(fields).containsEntry("name", "Мария").containsEntry("color", "coral");
    assertThat(fields.get("birthday")).isNull();
  }

  @Test
  void deleteWinsOverALaterChangeAndADeleteOfNothingIsIgnored() throws Exception {
    UUID masha = addMasha();
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    SyncRequests.push(
            anna,
            SyncRequests.delete("child", masha),
            SyncRequests.upsert("child", masha, "{\"name\":\"Мария\"}"),
            SyncRequests.delete("child", masha),
            SyncRequests.delete("child", UUID.randomUUID()))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "ignored", "ignored", "ignored")));

    // Changes since a Version: the deleted Child comes as a tombstone, without its fields.
    Map<String, Object> tombstone = SyncRequests.change(boris, before, "child", masha);
    assertThat(tombstone).containsEntry("deleted", true).doesNotContainKey("fields");
    // A first sync leaves deleted rows out.
    assertThat(SyncRequests.change(boris, 0, "child", masha)).isNull();
  }

  @Test
  void aRejectedOperationDoesNotStopTheOthers() throws Exception {
    UUID nameless = UUID.randomUUID();
    UUID petya = UUID.randomUUID();
    UUID masha = addMasha();

    SyncRequests.push(
            anna,
            SyncRequests.upsert("child", nameless, "{\"name\":\"   \"}"),
            SyncRequests.upsert("child", masha, "{\"color\":\"#ff0000\",\"name\":\"Мария\"}"),
            SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected", "applied")))
        .andExpect(jsonPath("$.results[0].code").value("validation.failed"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='name')].code").value("required"))
        .andExpect(
            jsonPath("$.results[0].params.errors[?(@.field=='color')].code").value("required"))
        .andExpect(
            jsonPath("$.results[1].params.errors[?(@.field=='color')].code").value("color.invalid"))
        .andExpect(jsonPath("$.results[2].code").doesNotExist());

    assertThat(SyncRequests.fields(boris, "child", nameless)).isNull();
    // The rejected operation changed nothing, not even the valid name it carried.
    assertThat(SyncRequests.fields(boris, "child", masha))
        .containsEntry("name", "Маша")
        .containsEntry("color", "coral");
    assertThat(SyncRequests.fields(boris, "child", petya)).containsEntry("name", "Петя");
  }

  @Test
  void repeatingAWholePushLeavesTheSameState() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();
    String[] push = {
      SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
      SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"),
      SyncRequests.upsert("child", masha, "{\"birthday\":\"2019-04-12\"}"),
      SyncRequests.delete("child", petya)
    };

    SyncRequests.push(anna, push)
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));
    String first = SyncRequests.pull(boris, 0).andReturn().getResponse().getContentAsString();
    SyncRequests.push(anna, push)
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "ignored", "applied", "ignored")));
    String second = SyncRequests.pull(boris, 0).andReturn().getResponse().getContentAsString();

    assertThat(JsonPath.<List<Object>>read(second, "$.changes[?(@.table=='child')].fields"))
        .isEqualTo(JsonPath.<List<Object>>read(first, "$.changes[?(@.table=='child')].fields"));
    assertThat(SyncRequests.fields(boris, "child", masha))
        .containsEntry("name", "Маша")
        .containsEntry("birthday", "2019-04-12");
    assertThat(SyncRequests.fields(boris, "child", petya)).isNull();
  }

  @Test
  void everyWriteGetsAHigherVersionThanAnyBefore() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();

    long created =
        pushVersion(SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"));
    long other =
        pushVersion(SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"));
    long edited = pushVersion(SyncRequests.upsert("child", masha, "{\"name\":\"Мария\"}"));
    long deleted = pushVersion(SyncRequests.delete("child", petya));

    assertThat(other).isGreaterThan(created);
    assertThat(edited).isGreaterThan(other);
    assertThat(deleted).isGreaterThan(edited);
    assertThat(SyncRequests.change(boris, 0, "child", masha))
        .containsEntry("version", (int) edited);
    assertThat(SyncRequests.change(boris, edited, "child", petya))
        .containsEntry("version", (int) deleted);
  }

  @Test
  void aPullSinceTheLastHighWaterVersionReturnsOnlyNewerChanges() throws Exception {
    UUID masha = addMasha();
    long highWater = SyncRequests.version(SyncRequests.pull(boris, 0));
    UUID petya = UUID.randomUUID();
    SyncRequests.push(
        anna, SyncRequests.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"));

    SyncRequests.pull(boris, highWater)
        .andExpect(jsonPath("$.changes[*].id", contains(petya.toString())))
        .andExpect(jsonPath("$.version").value(greaterThan((int) highWater)));
    assertThat(SyncRequests.change(boris, highWater, "child", masha)).isNull();
    SyncRequests.pull(boris, SyncRequests.version(SyncRequests.pull(boris, highWater)))
        .andExpect(jsonPath("$.changes").isEmpty());
  }

  @Test
  void operationsOnUnknownTablesAndOnMembersAreRejected() throws Exception {
    SyncRequests.push(
            anna,
            SyncRequests.upsert("shop", UUID.randomUUID(), "{}"),
            SyncRequests.upsert("member", UUID.randomUUID(), "{\"displayName\":\"Аня\"}"),
            "{\"table\":\"child\",\"id\":\"not-a-uuid\",\"op\":\"upsert\",\"fields\":{}}",
            "{\"table\":\"child\",\"id\":\"%s\",\"op\":\"merge\"}".formatted(UUID.randomUUID()))
        .andExpect(
            jsonPath(
                "$.results[*].status", contains("rejected", "rejected", "rejected", "rejected")))
        .andExpect(jsonPath("$.results[0].code").value("sync.table_unknown"))
        .andExpect(jsonPath("$.results[0].params.table").value("shop"))
        .andExpect(jsonPath("$.results[1].code").value("sync.read_only"))
        .andExpect(jsonPath("$.results[2].code").value("request.invalid"))
        .andExpect(jsonPath("$.results[3].code").value("request.invalid"));
  }

  @Test
  void theOldChildrenEndpointsAreGoneThePullAndPushReplaceThem() throws Exception {
    anna.get("/api/children").andExpect(status().is4xxClientError());
    anna.putJson("/api/children/" + UUID.randomUUID(), "{\"name\":\"Маша\",\"color\":\"coral\"}")
        .andExpect(status().is4xxClientError());
    anna.delete("/api/children/" + UUID.randomUUID()).andExpect(status().is4xxClientError());
  }

  @Test
  void syncNeedsASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    SyncRequests.pull(stranger, 0)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
    SyncRequests.push(stranger, SyncRequests.delete("child", UUID.randomUUID()))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  private UUID addMasha() throws Exception {
    UUID masha = UUID.randomUUID();
    SyncRequests.push(
            anna,
            SyncRequests.upsert(
                "child",
                masha,
                "{\"name\":\"Маша\",\"color\":\"coral\",\"birthday\":\"2019-04-12\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    return masha;
  }

  private long pushVersion(String operation) throws Exception {
    return SyncRequests.version(
        SyncRequests.push(anna, operation)
            .andExpect(jsonPath("$.results[*].status", contains("applied"))));
  }
}
