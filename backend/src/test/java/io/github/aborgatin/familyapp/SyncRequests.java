package io.github.aborgatin.familyapp;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.Nullable;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Test helpers for the sync API (ticket #52): Outbox operations as JSON, {@code POST
 * /api/sync/push} and {@code GET /api/sync/pull}, and the two logged-in devices most sync tests
 * start from.
 */
public final class SyncRequests {

  private SyncRequests() {}

  /** An {@code upsert} operation carrying {@code fieldsJson} (a JSON object). */
  public static String upsert(String table, UUID id, String fieldsJson) {
    return """
        {"table":"%s","id":"%s","op":"upsert","fields":%s}
        """
        .formatted(table, id, fieldsJson);
  }

  /** A {@code delete} operation. */
  public static String delete(String table, UUID id) {
    return """
        {"table":"%s","id":"%s","op":"delete"}
        """
        .formatted(table, id);
  }

  /** Pushes the operations, in this order, as one push. */
  public static ResultActions push(Browser device, String... operations) throws Exception {
    return device.postJson(
        "/api/sync/push", "{\"operations\":[" + String.join(",", operations) + "]}");
  }

  /** Pulls the changes since {@code version}. */
  public static ResultActions pull(Browser device, long version) throws Exception {
    return device.get("/api/sync/pull?since=" + version);
  }

  /** The high-water Version a pull or push answered with. */
  public static long version(ResultActions result) throws Exception {
    Number version =
        JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.version");
    return version.longValue();
  }

  /**
   * The change a pull since {@code version} returns for this row ({@code table}, {@code id}, {@code
   * version}, {@code deleted}, {@code fields}), or {@code null} when it returns none.
   */
  @Nullable
  public static Map<String, Object> change(Browser device, long version, String table, UUID id)
      throws Exception {
    String body = pull(device, version).andReturn().getResponse().getContentAsString();
    List<Map<String, Object>> found =
        JsonPath.read(body, "$.changes[?(@.table=='%s' && @.id=='%s')]".formatted(table, id));
    return found.isEmpty() ? null : found.get(0);
  }

  /** The fields of the row as a first pull (since 0) returns them; {@code null} when absent. */
  @Nullable
  @SuppressWarnings("unchecked") // JsonPath returns the JSON object as a Map.
  public static Map<String, Object> fields(Browser device, String table, UUID id) throws Exception {
    Map<String, Object> change = change(device, 0, table, id);
    return change == null ? null : (Map<String, Object>) change.get("fields");
  }

  /** A device on which Anna has just set up a fresh installation (she is its first Member). */
  public static Browser bootstrapAnna(MockMvc mvc) throws Exception {
    Browser anna = new Browser(mvc);
    anna.openApp();
    anna.postJson(
            "/api/auth/bootstrap",
            """
            {"email":"anna@example.com","password":"secret123","displayName":"Анна",
             "grammaticalGender":"FEMININE"}
            """)
        .andExpect(status().isCreated());
    return anna;
  }

  /** Adds Boris as a second Member and returns a device he is logged in on. */
  public static Browser loginBoris(MockMvc mvc, JdbcTemplate jdbc) throws Exception {
    FreshInstallation.addMember(jdbc, "boris@example.com", "boris-pass", "Борис", "MASCULINE");
    Browser boris = new Browser(mvc);
    boris.openApp();
    boris
        .postJson(
            "/api/auth/login", "{\"email\":\"boris@example.com\",\"password\":\"boris-pass\"}")
        .andExpect(status().isOk());
    return boris;
  }
}
