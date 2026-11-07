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

  List<Member> findByDeletedFalseOrderByDisplayNameAscEmailAsc();
}
