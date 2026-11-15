package io.github.aborgatin.familyapp.notifications;

/** What became of one push (spec #104, "Push gateway"). */
public enum PushResult {
  /** The push service accepted it. */
  DELIVERED,
  /** The subscription no longer exists (404 or 410): it is deleted. */
  GONE,
  /** Anything else: logged, not retried. */
  FAILED
}
