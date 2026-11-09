package io.github.aborgatin.familyapp.family;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
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
    anna = Sync.bootstrapAnna(mvc);
    boris = Sync.loginBoris(mvc, jdbc);
  }

  @Test
  void aChildPushedByOneDeviceArrivesThroughTheOthersPull() throws Exception {
    UUID masha = UUID.randomUUID();

    Sync.push(
            anna,
            Sync.upsert(
                "child",
                masha,
                "{\"name\":\"  Маша  \",\"color\":\"coral\",\"birthday\":\"2019-04-12\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[*].status", contains("applied")))
        .andExpect(jsonPath("$.version").isNumber());

    Sync.pull(boris, 0)
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

    Sync.push(boris, Sync.upsert("child", masha, "{\"color\":\"teal\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));

    assertThat(Sync.fields(anna, "child", masha))
        .containsEntry("name", "Маша")
        .containsEntry("color", "teal")
        .containsEntry("birthday", "2019-04-12");
  }

  @Test
  void theSameFieldChangedOnTwoDevicesKeepsTheChangeTheServerReceivedLater() throws Exception {
    UUID masha = addMasha();

    Sync.push(boris, Sync.upsert("child", masha, "{\"name\":\"Мария\"}"));
    Sync.push(anna, Sync.upsert("child", masha, "{\"name\":\"Маруся\"}"));

    assertThat(Sync.fields(boris, "child", masha)).containsEntry("name", "Маруся");
  }

  @Test
  void differentFieldsChangedOnTwoDevicesAreBothKept() throws Exception {
    UUID masha = addMasha();

    Sync.push(boris, Sync.upsert("child", masha, "{\"name\":\"Мария\"}"));
    Sync.push(anna, Sync.upsert("child", masha, "{\"birthday\":null}"));

    Map<String, Object> fields = Sync.fields(boris, "child", masha);
    assertThat(fields).containsEntry("name", "Мария").containsEntry("color", "coral");
    assertThat(fields.get("birthday")).isNull();
  }

  @Test
  void deleteWinsOverALaterChangeAndADeleteOfNothingIsIgnored() throws Exception {
    UUID masha = addMasha();
    long before = Sync.version(Sync.pull(boris, 0));

    Sync.push(
            anna,
            Sync.delete("child", masha),
            Sync.upsert("child", masha, "{\"name\":\"Мария\"}"),
            Sync.delete("child", masha),
            Sync.delete("child", UUID.randomUUID()))
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "ignored", "ignored", "ignored")));

    // Changes since a Version: the deleted Child comes as a tombstone, without its fields.
    Map<String, Object> tombstone = Sync.change(boris, before, "child", masha);
    assertThat(tombstone).containsEntry("deleted", true).doesNotContainKey("fields");
    // A first sync leaves deleted rows out.
    assertThat(Sync.change(boris, 0, "child", masha)).isNull();
  }

  @Test
  void aRejectedOperationDoesNotStopTheOthers() throws Exception {
    UUID nameless = UUID.randomUUID();
    UUID petya = UUID.randomUUID();
    UUID masha = addMasha();

    Sync.push(
            anna,
            Sync.upsert("child", nameless, "{\"name\":\"   \"}"),
            Sync.upsert("child", masha, "{\"color\":\"#ff0000\",\"name\":\"Мария\"}"),
            Sync.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"))
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

    assertThat(Sync.fields(boris, "child", nameless)).isNull();
    // The rejected operation changed nothing, not even the valid name it carried.
    assertThat(Sync.fields(boris, "child", masha))
        .containsEntry("name", "Маша")
        .containsEntry("color", "coral");
    assertThat(Sync.fields(boris, "child", petya)).containsEntry("name", "Петя");
  }

  @Test
  void repeatingAWholePushLeavesTheSameState() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();
    String[] push = {
      Sync.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
      Sync.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"),
      Sync.upsert("child", masha, "{\"birthday\":\"2019-04-12\"}"),
      Sync.delete("child", petya)
    };

    Sync.push(anna, push)
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "applied", "applied", "applied")));
    String first = Sync.pull(boris, 0).andReturn().getResponse().getContentAsString();
    Sync.push(anna, push)
        .andExpect(
            jsonPath("$.results[*].status", contains("applied", "ignored", "applied", "ignored")));
    String second = Sync.pull(boris, 0).andReturn().getResponse().getContentAsString();

    assertThat(JsonPath.<List<Object>>read(second, "$.changes[?(@.table=='child')].fields"))
        .isEqualTo(JsonPath.<List<Object>>read(first, "$.changes[?(@.table=='child')].fields"));
    assertThat(Sync.fields(boris, "child", masha))
        .containsEntry("name", "Маша")
        .containsEntry("birthday", "2019-04-12");
    assertThat(Sync.fields(boris, "child", petya)).isNull();
  }

  @Test
  void everyWriteGetsAHigherVersionThanAnyBefore() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID petya = UUID.randomUUID();

    long created =
        pushVersion(Sync.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"));
    long other = pushVersion(Sync.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"));
    long edited = pushVersion(Sync.upsert("child", masha, "{\"name\":\"Мария\"}"));
    long deleted = pushVersion(Sync.delete("child", petya));

    assertThat(other).isGreaterThan(created);
    assertThat(edited).isGreaterThan(other);
    assertThat(deleted).isGreaterThan(edited);
    assertThat(Sync.change(boris, 0, "child", masha)).containsEntry("version", (int) edited);
    assertThat(Sync.change(boris, edited, "child", petya)).containsEntry("version", (int) deleted);
  }

  @Test
  void aPullSinceTheLastHighWaterVersionReturnsOnlyNewerChanges() throws Exception {
    UUID masha = addMasha();
    long highWater = Sync.version(Sync.pull(boris, 0));
    UUID petya = UUID.randomUUID();
    Sync.push(anna, Sync.upsert("child", petya, "{\"name\":\"Петя\",\"color\":\"blue\"}"));

    Sync.pull(boris, highWater)
        .andExpect(jsonPath("$.changes[*].id", contains(petya.toString())))
        .andExpect(jsonPath("$.version").value(greaterThan((int) highWater)));
    assertThat(Sync.change(boris, highWater, "child", masha)).isNull();
    Sync.pull(boris, Sync.version(Sync.pull(boris, highWater)))
        .andExpect(jsonPath("$.changes").isEmpty());
  }

  @Test
  void operationsOnUnknownTablesAndOnMembersAreRejected() throws Exception {
    Sync.push(
            anna,
            Sync.upsert("shop", UUID.randomUUID(), "{}"),
            Sync.upsert("member", UUID.randomUUID(), "{\"displayName\":\"Аня\"}"),
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
  void theOldChildrenWriteEndpointsAreGone() throws Exception {
    anna.putJson("/api/children/" + UUID.randomUUID(), "{\"name\":\"Маша\",\"color\":\"coral\"}")
        .andExpect(status().is4xxClientError());
    anna.delete("/api/children/" + UUID.randomUUID()).andExpect(status().is4xxClientError());
  }

  @Test
  void syncNeedsASession() throws Exception {
    Browser stranger = new Browser(mvc);
    stranger.openApp();

    Sync.pull(stranger, 0)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
    Sync.push(stranger, Sync.delete("child", UUID.randomUUID()))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("auth.required"));
  }

  private UUID addMasha() throws Exception {
    UUID masha = UUID.randomUUID();
    Sync.push(
            anna,
            Sync.upsert(
                "child",
                masha,
                "{\"name\":\"Маша\",\"color\":\"coral\",\"birthday\":\"2019-04-12\"}"))
        .andExpect(jsonPath("$.results[*].status", contains("applied")));
    return masha;
  }

  private long pushVersion(String operation) throws Exception {
    return Sync.version(
        Sync.push(anna, operation).andExpect(jsonPath("$.results[*].status", contains("applied"))));
  }
}
