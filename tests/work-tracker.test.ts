import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUGGESTED,
  isDone,
  targetFor,
  workTrackerSettings,
  type WorkTrackerSettings,
} from "@/lib/work-tracker/config";

const JIRA: WorkTrackerSettings = {
  provider: "jira",
  baseUrl: "https://example.atlassian.net",
  target: { project: "PRIV", issueType: "Task" },
  doneStatuses: ["Done", "Closed"],
};

const NOW: WorkTrackerSettings = {
  provider: "servicenow",
  baseUrl: "https://example.service-now.com",
  target: { table: "sc_task" },
  doneStatuses: ["3", "Closed Complete"],
};

const ENTITY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("where work goes", () => {
  it("uses the default destination when nothing is scoped", () => {
    assert.deepEqual(targetFor(JIRA, null), { project: "PRIV", issueType: "Task" });
    assert.deepEqual(targetFor(JIRA, ENTITY), { project: "PRIV", issueType: "Task" });
  });

  it("prefers the entity's own board", () => {
    const scoped: WorkTrackerSettings = {
      ...JIRA,
      targetByEntity: { [ENTITY]: { project: "STUDIOS", issueType: "Bug" } },
    };
    assert.deepEqual(targetFor(scoped, ENTITY), { project: "STUDIOS", issueType: "Bug" });
  });

  it("falls back rather than failing for an unmapped entity", () => {
    // Losing a mitigation is worse than putting it on the wrong board.
    const scoped: WorkTrackerSettings = {
      ...JIRA,
      targetByEntity: { [ENTITY]: { project: "STUDIOS", issueType: "Bug" } },
    };
    assert.deepEqual(targetFor(scoped, OTHER), JIRA.target);
  });

  it("carries whatever keys a product needs, without the schema knowing them", () => {
    // The point of the seam: ServiceNow's vocabulary needs no schema change.
    const withGroup: WorkTrackerSettings = {
      ...NOW,
      target: { table: "change_request", assignmentGroup: "Data Protection" },
    };
    assert.deepEqual(targetFor(withGroup, null), {
      table: "change_request",
      assignmentGroup: "Data Protection",
    });
  });
});

describe("whether the work is finished", () => {
  it("matches a named Jira status", () => {
    assert.equal(isDone(JIRA, "Done"), true);
    assert.equal(isDone(JIRA, "In Progress"), false);
  });

  it("matches a numeric ServiceNow state given as a number", () => {
    // The reason done statuses are stored as strings: one comparison has to
    // serve a product that names its statuses and one that numbers them.
    assert.equal(isDone(NOW, 3), true);
    assert.equal(isDone(NOW, "3"), true);
    assert.equal(isDone(NOW, 2), false);
  });

  it("ignores case and surrounding space", () => {
    // A workflow renamed from "Done" to "done" is not a status change.
    assert.equal(isDone(JIRA, "done"), true);
    assert.equal(isDone(JIRA, "  CLOSED  "), true);
  });

  it("treats a missing status as not done", () => {
    // Fail closed: an unreadable status must never complete a governance task.
    for (const missing of [null, undefined, "", "   "]) {
      assert.equal(isDone(JIRA, missing), false, String(missing));
    }
  });

  it("does not match a status that merely contains a done word", () => {
    assert.equal(isDone(JIRA, "Not Done"), false);
    assert.equal(isDone(JIRA, "Done-ish"), false);
  });
});

describe("the stored shape", () => {
  it("accepts a configuration for either product", () => {
    assert.ok(workTrackerSettings.safeParse(JIRA).success);
    assert.ok(workTrackerSettings.safeParse(NOW).success);
  });

  it("refuses a configuration that can never complete anything", () => {
    // Without at least one done status, reconciliation would run forever and
    // silently close nothing.
    const result = workTrackerSettings.safeParse({ ...JIRA, doneStatuses: [] });
    assert.equal(result.success, false);
  });

  it("refuses an endpoint that is not a URL", () => {
    assert.equal(workTrackerSettings.safeParse({ ...JIRA, baseUrl: "example" }).success, false);
  });

  it("offers a starting point for both products", () => {
    for (const provider of ["jira", "servicenow"] as const) {
      const suggested = SUGGESTED[provider];
      assert.ok(suggested.doneStatuses.length > 0, provider);
      assert.ok(Object.keys(suggested.target).length > 0, provider);
    }
  });
});
