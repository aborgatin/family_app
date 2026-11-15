package io.github.aborgatin.familyapp.notifications;

import static io.github.aborgatin.familyapp.ListOperations.list;
import static io.github.aborgatin.familyapp.SyncRequests.pushApplied;
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
 * Mute through the sync push and pull (spec #104 "Mute", ticket #111): a per-Member row saying
 * «Без уведомлений» for one Shared list. Two {@code Browser}s play Anna's phone and Boris's phone;
 * every test starts with Anna's Shared list «Дом».
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PostgresTestcontainer.class)
class MuteSyncTest {

  static final String TABLE = "mute";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;

  Browser anna;
  Browser boris;
  final UUID home = UUID.randomUUID();

  @BeforeEach
  void annaAndBorisShareATodoList() throws Exception {
    FreshInstallation.reset(jdbc);
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    pushApplied(anna, list(home, "Дом", "TODO", "SHARED"));
  }

  /** The upsert that Mutes {@code listId}. */
  static String mute(UUID id, UUID listId) {
    return SyncRequests.upsert(TABLE, id, "{\"listId\":\"%s\"}".formatted(listId));
  }

  @Test
  void aMuteReachesOnlyItsOwnMembersPull() throws Exception {
    UUID annasMute = UUID.randomUUID();
    long before = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(anna, mute(annasMute, home));

    assertThat(SyncRequests.fields(anna, TABLE, annasMute))
        .containsEntry("listId", home.toString());
    assertThat(SyncRequests.change(boris, before, TABLE, annasMute)).isNull();
    assertThat(SyncRequests.change(boris, 0, TABLE, annasMute)).isNull();
  }

  @Test
  void aPrivateListCannotBeMutedNorCanAListTheMemberDoesNotSee() throws Exception {
    UUID annasOwn = UUID.randomUUID();
    UUID borisOwn = UUID.randomUUID();
    pushApplied(anna, list(annasOwn, "Моё", "TODO", "PRIVATE"));
    pushApplied(boris, list(borisOwn, "Секрет", "TODO", "PRIVATE"));
    UUID muteOfPrivate = UUID.randomUUID();
    UUID muteOfOthers = UUID.randomUUID();
    UUID muteOfUnknown = UUID.randomUUID();

    SyncRequests.push(
            anna,
            mute(muteOfPrivate, annasOwn),
            mute(muteOfOthers, borisOwn),
            mute(muteOfUnknown, UUID.randomUUID()),
            SyncRequests.upsert(TABLE, UUID.randomUUID(), "{}"),
            SyncRequests.upsert(TABLE, UUID.randomUUID(), "{\"listId\":\"дом\"}"))
        .andExpect(
            jsonPath(
                "$.results[*].status",
                contains("rejected", "rejected", "rejected", "rejected", "rejected")))
        .andExpect(
            jsonPath(
                "$.results[*].code",
                contains(
                    "mute.private_list",
                    "list.not_found",
                    "list.not_found",
                    "validation.failed",
                    "validation.failed")))
        .andExpect(
            jsonPath("$.results[3].params.errors[?(@.field=='listId')].code").value("required"))
        .andExpect(
            jsonPath("$.results[4].params.errors[?(@.field=='listId')].code")
                .value("value.invalid"));

    assertThat(SyncRequests.fields(anna, TABLE, muteOfPrivate)).isNull();
    assertThat(SyncRequests.fields(anna, TABLE, muteOfOthers)).isNull();
    assertThat(SyncRequests.fields(anna, TABLE, muteOfUnknown)).isNull();
  }

  @Test
  void aChildListIsSharedAndCanBeMuted() throws Exception {
    UUID masha = UUID.randomUUID();
    UUID school = UUID.randomUUID();
    UUID muted = UUID.randomUUID();
    pushApplied(
        anna,
        SyncRequests.upsert("child", masha, "{\"name\":\"Маша\",\"color\":\"coral\"}"),
        SyncRequests.upsert(
            "list",
            school,
            "{\"name\":\"Школа\",\"kind\":\"TODO\",\"visibility\":\"SHARED\",\"childId\":\"%s\"}"
                .formatted(masha)));

    pushApplied(boris, mute(muted, school));

    assertThat(SyncRequests.fields(boris, TABLE, muted)).containsEntry("listId", school.toString());
  }

  @Test
  void unmutingDeletesTheMuteAndItsMemberPullsATombstone() throws Exception {
    UUID annasMute = UUID.randomUUID();
    pushApplied(anna, mute(annasMute, home));
    long muted = SyncRequests.version(SyncRequests.pull(anna, 0));

    pushApplied(anna, SyncRequests.delete(TABLE, annasMute));

    assertThat(SyncRequests.change(anna, muted, TABLE, annasMute))
        .containsEntry("deleted", true)
        .doesNotContainKey("fields");
    SyncRequests.push(anna, mute(annasMute, home), SyncRequests.delete(TABLE, annasMute))
        .andExpect(jsonPath("$.results[*].status", contains("ignored", "ignored")));
  }

  @Test
  void aMutePushedAgainChangesNothing() throws Exception {
    UUID annasMute = UUID.randomUUID();
    pushApplied(anna, mute(annasMute, home));
    long muted = SyncRequests.version(SyncRequests.pull(anna, 0));

    pushApplied(anna, mute(annasMute, home));

    assertThat(SyncRequests.change(anna, muted, TABLE, annasMute)).isNull();
  }

  @Test
  void anotherMembersMuteIsUnknownToThePush() throws Exception {
    UUID annasMute = UUID.randomUUID();
    pushApplied(anna, mute(annasMute, home));

    SyncRequests.push(boris, mute(annasMute, home), SyncRequests.delete(TABLE, annasMute))
        .andExpect(jsonPath("$.results[*].status", contains("rejected", "rejected")))
        .andExpect(jsonPath("$.results[*].code", contains("mute.not_found", "mute.not_found")));

    assertThat(SyncRequests.fields(anna, TABLE, annasMute)).containsEntry("listId", home.toString());
    assertThat(SyncRequests.fields(boris, TABLE, annasMute)).isNull();
  }

  @Test
  void aDeletedListTakesItsMutesAndMutingItLaterIsIgnored() throws Exception {
    UUID annasMute = UUID.randomUUID();
    UUID borisMute = UUID.randomUUID();
    pushApplied(anna, mute(annasMute, home));
    pushApplied(boris, mute(borisMute, home));
    long annaMuted = SyncRequests.version(SyncRequests.pull(anna, 0));
    long borisMuted = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(anna, SyncRequests.delete("list", home));

    assertThat(SyncRequests.change(anna, annaMuted, TABLE, annasMute))
        .containsEntry("deleted", true);
    assertThat(SyncRequests.change(boris, borisMuted, TABLE, borisMute))
        .containsEntry("deleted", true);
    SyncRequests.push(boris, mute(UUID.randomUUID(), home))
        .andExpect(jsonPath("$.results[*].status", contains("ignored")));
  }

  @Test
  void aListMadePrivateTakesItsMutes() throws Exception {
    UUID annasMute = UUID.randomUUID();
    UUID borisMute = UUID.randomUUID();
    pushApplied(anna, mute(annasMute, home));
    pushApplied(boris, mute(borisMute, home));
    long annaMuted = SyncRequests.version(SyncRequests.pull(anna, 0));
    long borisMuted = SyncRequests.version(SyncRequests.pull(boris, 0));

    pushApplied(anna, SyncRequests.upsert("list", home, "{\"visibility\":\"PRIVATE\"}"));

    assertThat(SyncRequests.change(anna, annaMuted, TABLE, annasMute))
        .containsEntry("deleted", true);
    assertThat(SyncRequests.change(boris, borisMuted, TABLE, borisMute))
        .containsEntry("deleted", true);

    // Shared again: nobody is Muted until they Mute again.
    pushApplied(anna, SyncRequests.upsert("list", home, "{\"visibility\":\"SHARED\"}"));
    assertThat(SyncRequests.fields(boris, TABLE, borisMute)).isNull();
  }
}
