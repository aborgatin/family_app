package io.github.aborgatin.familyapp.family.member;

import io.github.aborgatin.familyapp.sync.SyncRow;
import io.github.aborgatin.familyapp.sync.SyncableTable;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The {@code member} table in the sync pull (spec #3 "Read path"). Pull only: Member account
 * changes stay online-only REST (S4 exception), and their effects reach other devices here. A row
 * carries what the client shows (display name, Grammatical gender), never the email, the password
 * hash or anything else secret.
 */
@Component
class MemberSyncTable implements SyncableTable {

  private final MemberRepository members;

  MemberSyncTable(MemberRepository members) {
    this.members = members;
  }

  @Override
  public String name() {
    return "member";
  }

  @Override
  public List<SyncRow> changesSince(long version, UUID memberId) {
    return SyncRow.changes(
        members.findByVersionGreaterThan(version),
        (member, fields) -> {
          fields.put("displayName", member.displayName());
          fields.put("grammaticalGender", member.grammaticalGender().name());
        });
  }
}
