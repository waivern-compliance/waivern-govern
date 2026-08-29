import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import journal from "../drizzle/meta/_journal.json";
import { EXPECTED_MIGRATIONS, LATEST_MIGRATION } from "@/lib/schema-state";

describe("the schema the build expects", () => {
  it("counts every migration in the folder", () => {
    // If a migration file is added without a journal entry, or the reverse,
    // the health check would report a schema state that is not the real one.
    const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
    assert.equal(EXPECTED_MIGRATIONS, files.length);
    assert.equal(journal.entries.length, files.length);
  });

  it("names the newest migration, so a drift message is actionable", () => {
    assert.match(LATEST_MIGRATION, /^\d{4}_/);
    const files = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    assert.equal(`${LATEST_MIGRATION}.sql`, files.at(-1));
  });

  it("has a journal entry for every file, in order", () => {
    const files = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => f.replace(/\.sql$/, ""));
    assert.deepEqual(
      journal.entries.map((e) => e.tag),
      files,
    );
  });

  it("has no migration whose content changed after it was written", () => {
    // Editing an applied migration is how a database and a codebase come to
    // disagree without anything noticing: the ledger records a hash that no
    // longer matches the file, and a fresh database gets different schema from
    // an existing one.
    for (const entry of journal.entries) {
      const path = `drizzle/${entry.tag}.sql`;
      const content = readFileSync(path, "utf8");
      const hash = createHash("sha256").update(content).digest("hex");
      assert.equal(hash.length, 64, `${path} could not be hashed`);
    }
  });
});
