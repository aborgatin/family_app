package io.github.aborgatin.familyapp.notifications.dose;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.github.aborgatin.familyapp.family.Children;
import io.github.aborgatin.familyapp.family.MemberSummary;
import io.github.aborgatin.familyapp.family.Members;
import io.github.aborgatin.familyapp.medical.MedicineDoseLogged;
import io.github.aborgatin.familyapp.notifications.PushMessage;
import io.github.aborgatin.familyapp.notifications.Pushes;
import io.github.aborgatin.familyapp.notifications.push.PushPayloads;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * The dose Notification (spec #128 "Notification", ticket #136): a new Medicine dose on a Child's
 * card goes at once to every other Member, one push each, after the push that logged it commits.
 * Not batched and Mute doesn't apply; {@link Pushes#sendTo} leaves out those whose switch is off.
 * The payload names the actor and the Child, never the Medicine or the amount, so a lock screen
 * shows nothing medical.
 */
@Component
class DoseNotifications {

  private static final Logger log = LoggerFactory.getLogger(DoseNotifications.class);

  /** The push payload of a dose Notification, as the service worker reads it. */
  record DosePayload(
      String actorName, String actorGrammaticalGender, String childName, String url) {

    @JsonProperty
    String type() {
      return "dose";
    }
  }

  private final Members members;
  private final Children children;
  private final PushPayloads payloads;
  private final Pushes pushes;

  DoseNotifications(Members members, Children children, PushPayloads payloads, Pushes pushes) {
    this.members = members;
    this.children = children;
    this.payloads = payloads;
    this.pushes = pushes;
  }

  /**
   * After the commit, outside any transaction: a rolled-back push sends nothing. A failed push is
   * logged and costs only itself; the sync push has already succeeded.
   */
  @TransactionalEventListener
  void onDoseLogged(MedicineDoseLogged dose) {
    Optional<MemberSummary> actor = members.byId(dose.byMemberId());
    Optional<String> child = children.name(dose.childId());
    if (actor.isEmpty() || child.isEmpty()) {
      return;
    }
    String payload =
        payloads.write(
            new DosePayload(
                actor.get().displayName(),
                actor.get().grammaticalGender(),
                child.get(),
                PushPayloads.childIllnessUrl(dose.childId(), dose.illnessId())));
    for (MemberSummary member : members.all()) {
      if (!member.id().equals(dose.byMemberId())) {
        send(PushMessage.notification(member.id(), payload));
      }
    }
  }

  private void send(PushMessage message) {
    try {
      pushes.sendTo(message.recipientId(), message.payload(), message.ttl(), message.urgency());
    } catch (RuntimeException e) {
      log.warn("A dose push to Member {} failed; it is not retried", message.recipientId(), e);
    }
  }
}
