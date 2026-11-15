package io.github.aborgatin.familyapp.lists;

import static io.github.aborgatin.familyapp.ListOperations.add;
import static io.github.aborgatin.familyapp.ListOperations.done;
import static io.github.aborgatin.familyapp.ListOperations.list;
import static org.assertj.core.api.Assertions.assertThat;

import io.github.aborgatin.familyapp.Browser;
import io.github.aborgatin.familyapp.FreshInstallation;
import io.github.aborgatin.familyapp.PostgresTestcontainer;
import io.github.aborgatin.familyapp.SyncRequests;
import io.github.aborgatin.familyapp.TestClock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
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
 * The {@code lists} query API other modules use (spec #104 "Events from lists"; ticket #109): a
 * List's summary and who sees it, whether a Member sees it, which Items still exist, and the open
 * todo items due in a window. Members write through the sync push; the API is called as another
 * module would.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PostgresTestcontainer.class, TestClock.Config.class})
class ListsQueryTest {

  static final ZoneId ZONE = ZoneId.systemDefault();
  static final LocalTime MORNING = LocalTime.of(9, 0);

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestClock clock;
  @Autowired Lists lists;

  Browser anna;
  Browser boris;
  UUID annaId;
  UUID borisId;
  final UUID home = UUID.randomUUID();
  final UUID mine = UUID.randomUUID();

  @BeforeEach
  void annaHasASharedAndAPrivateList() throws Exception {
    FreshInstallation.reset(jdbc);
    clock.setToday(LocalDate.of(2026, 3, 10));
    anna = SyncRequests.bootstrapAnna(mvc);
    boris = SyncRequests.loginBoris(mvc, jdbc);
    annaId = UUID.fromString(SyncRequests.memberId(anna));
    borisId = UUID.fromString(SyncRequests.memberId(boris));
    SyncRequests.pushApplied(
        anna, list(home, "Дом", "TODO", "SHARED"), list(mine, "Моё", "SHOPPING", "PRIVATE"));
  }

  @Test
  void aListIsFoundWithEveryoneWhoSeesIt() {
    assertThat(lists.find(home))
        .contains(
            new ListSummary(
                home, "Дом", ListKind.TODO, Visibility.SHARED, annaId, List.of(annaId, borisId)));
    assertThat(lists.find(mine).orElseThrow().seenBy()).containsExactly(annaId);
    assertThat(lists.find(mine).orElseThrow().kind()).isEqualTo(ListKind.SHOPPING);
    assertThat(lists.find(UUID.randomUUID())).isEmpty();
  }

  @Test
  void aDeletedListIsNotFoundNorVisible() throws Exception {
    SyncRequests.pushApplied(anna, SyncRequests.delete("list", home));

    assertThat(lists.find(home)).isEmpty();
    assertThat(lists.visibleTo(home, annaId)).isFalse();
  }

  @Test
  void aSharedListIsVisibleToEveryoneAPrivateOneToItsOwner() {
    assertThat(lists.visibleTo(home, borisId)).isTrue();
    assertThat(lists.visibleTo(mine, annaId)).isTrue();
    assertThat(lists.visibleTo(mine, borisId)).isFalse();
    assertThat(lists.visibleTo(UUID.randomUUID(), annaId)).isFalse();
  }

  @Test
  void onlyItemsThatStillExistAreFoundOpenOrDone() throws Exception {
    UUID tap = UUID.randomUUID();
    UUID bulb = UUID.randomUUID();
    UUID gone = UUID.randomUUID();
    SyncRequests.pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            tap,
            "{\"listId\":\"%s\",\"text\":\"Починить кран\",\"assigneeId\":\"%s\"}"
                .formatted(home, borisId)),
        add(bulb, home, "Купить лампочку"),
        done(bulb, true),
        add(gone, home, "Лишнее"),
        SyncRequests.delete("item", gone));

    assertThat(lists.items(List.of(tap, bulb, gone, UUID.randomUUID())))
        .containsOnlyKeys(tap, bulb)
        .containsEntry(tap, new ItemSummary(tap, home, "Починить кран", borisId))
        .containsEntry(bulb, new ItemSummary(bulb, home, "Купить лампочку", null));
  }

  @Test
  void openTodoItemsAreDueAtTheirTimeOrInTheMorning() throws Exception {
    UUID atThree = due("Забрать справку", "2026-03-10", "15:00");
    UUID morning = due("Позвонить маме", "2026-03-11", null);
    due("Ещё не скоро", "2026-03-12", "08:00");
    due("Уже было", "2026-03-10", "09:00");
    UUID doneItem = due("Сделано", "2026-03-10", "16:00");
    UUID deleted = due("Удалено", "2026-03-10", "16:00");
    SyncRequests.pushApplied(anna, done(doneItem, true), SyncRequests.delete("item", deleted));

    // After 09:00 on the 10th, up to and including 09:00 on the 11th.
    List<DueItem> due = lists.dueBetween(at("2026-03-10T09:00"), at("2026-03-11T09:00"), MORNING);

    assertThat(due)
        .containsExactly(
            new DueItem(
                atThree,
                "Забрать справку",
                home,
                null,
                LocalDate.of(2026, 3, 10),
                LocalTime.of(15, 0)),
            new DueItem(morning, "Позвонить маме", home, null, LocalDate.of(2026, 3, 11), null));
  }

  @Test
  void aDueItemCarriesItsAssigneeAndPrivateListsCount() throws Exception {
    UUID todo = UUID.randomUUID();
    SyncRequests.pushApplied(anna, list(todo, "Мои дела", "TODO", "PRIVATE"));
    UUID own = UUID.randomUUID();
    UUID assigned = UUID.randomUUID();
    SyncRequests.pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            own,
            "{\"listId\":\"%s\",\"text\":\"Своё\",\"dueDate\":\"2026-03-10\",\"dueTime\":\"18:00\"}"
                .formatted(todo)),
        SyncRequests.upsert(
            "item",
            assigned,
            ("{\"listId\":\"%s\",\"text\":\"Общее\",\"dueDate\":\"2026-03-10\","
                    + "\"dueTime\":\"18:00\",\"assigneeId\":\"%s\"}")
                .formatted(home, borisId)));

    List<DueItem> due = lists.dueBetween(at("2026-03-10T17:59"), at("2026-03-10T18:00"), MORNING);

    assertThat(due)
        .extracting(DueItem::itemId, DueItem::listId, DueItem::assigneeId)
        .containsExactlyInAnyOrder(
            org.assertj.core.groups.Tuple.tuple(own, todo, null),
            org.assertj.core.groups.Tuple.tuple(assigned, home, borisId));
  }

  // --- helpers ---

  private UUID due(String text, String day, String time) throws Exception {
    UUID id = UUID.randomUUID();
    String dueTime = time == null ? "" : ",\"dueTime\":\"%s\"".formatted(time);
    SyncRequests.pushApplied(
        anna,
        SyncRequests.upsert(
            "item",
            id,
            "{\"listId\":\"%s\",\"text\":\"%s\",\"dueDate\":\"%s\"%s}"
                .formatted(home, text, day, dueTime)));
    return id;
  }

  private static Instant at(String localDateTime) {
    return LocalDateTime.parse(localDateTime).atZone(ZONE).toInstant();
  }
}
