package io.github.aborgatin.familyapp.family.member;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/** Members. Deliberately has no delete methods: Members are syncable and deletes are soft (S2). */
public interface MemberRepository extends Repository<Member, UUID> {

  Member saveAndFlush(Member member);

  Optional<Member> findByIdAndDeletedFalse(UUID id);

  Optional<Member> findByEmailAndDeletedFalse(String email);

  boolean existsBy();

  /** Also counts removed Members: their email stays taken (the column is unique). */
  boolean existsByEmail(String email);

  List<Member> findByDeletedFalseOrderByDisplayNameAscEmailAsc();

  /** Every Member written after this Version, removed ones included (the sync pull). */
  List<Member> findByVersionGreaterThan(long version);
}
