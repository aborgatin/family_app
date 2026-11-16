package io.github.aborgatin.familyapp;

import java.util.UUID;

/**
 * The Medical card operations (spec #128) the {@code medical} tests and the dose Notification test
 * push, statically imported.
 */
public final class MedicalOperations {

  private MedicalOperations() {}

  /** An Illness on the card of {@code personField} ({@code memberId} or {@code childId}). */
  public static String illnessOf(String personField, Object person, UUID id, String name) {
    return SyncRequests.upsert(
        "illness",
        id,
        "{\"%s\":\"%s\",\"kind\":\"ILLNESS\",\"name\":\"%s\"}"
            .formatted(personField, person, name));
  }

  /** A Temperature; {@code time} may be {@code null}. */
  public static String temperature(UUID id, UUID illness, String date, String time, double value) {
    return SyncRequests.upsert(
        "illness_event",
        id,
        "{\"illnessId\":\"%s\",\"kind\":\"TEMPERATURE\",\"date\":\"%s\",\"time\":%s,\"temperature\":%s}"
            .formatted(illness, date, time == null ? "null" : "\"" + time + "\"", value));
  }

  /** A Medicine dose on 2 December 2026, 22:00; {@code temperature} may be {@code null}. */
  public static String dose(
      UUID id, UUID illness, UUID medicine, String amount, Double temperature) {
    return SyncRequests.upsert(
        "illness_event",
        id,
        ("{\"illnessId\":\"%s\",\"kind\":\"MEDICINE_DOSE\",\"date\":\"2026-12-02\","
                + "\"time\":\"22:00\",\"medicineId\":\"%s\",\"amount\":\"%s\",\"temperature\":%s}")
            .formatted(illness, medicine, amount, temperature));
  }

  /** A Medicine of the Family's list. */
  public static String medicine(UUID id, String name) {
    return SyncRequests.upsert("medicine", id, "{\"name\":\"%s\"}".formatted(name));
  }
}
