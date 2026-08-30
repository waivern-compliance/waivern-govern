import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { NAV } from "@/lib/nav";
import { searchHelp, topicForPath } from "@/lib/help/search";
import { HELP_TOPICS, TOPIC_BY_ID } from "@/lib/help/topics";

describe("finding help", () => {
  it("finds nothing for an empty or trivial query", () => {
    assert.deepEqual(searchHelp(HELP_TOPICS, ""), []);
    assert.deepEqual(searchHelp(HELP_TOPICS, "  "), []);
    // Single characters match everything and mean nothing.
    assert.deepEqual(searchHelp(HELP_TOPICS, "a"), []);
  });

  it("puts the topic named in the query first", () => {
    assert.equal(searchHelp(HELP_TOPICS, "trends")[0].topic.id, "trends");
    assert.equal(searchHelp(HELP_TOPICS, "exports")[0].topic.id, "exports");
  });

  it("finds a topic by a term that never appears in its prose", () => {
    // Somebody searches the citation, or the old name for the thing.
    assert.equal(searchHelp(HELP_TOPICS, "article 30")[0].topic.id, "ropa");
    assert.equal(searchHelp(HELP_TOPICS, "article 28")[0].topic.id, "third-parties");
    assert.equal(searchHelp(HELP_TOPICS, "sla")[0].topic.id, "service-levels");
    assert.equal(searchHelp(HELP_TOPICS, "shadow ai")[0].topic.id, "ai-register");
  });

  it("treats extra words as narrowing, not widening", () => {
    // Every word must appear somewhere, so this cannot return topics that only
    // mention risk.
    const hits = searchHelp(HELP_TOPICS, "risk acceptance");
    assert.ok(hits.length > 0);
    for (const hit of hits) {
      const blob = JSON.stringify(hit.topic).toLowerCase();
      assert.ok(blob.includes("risk") && blob.includes("accept"), hit.topic.id);
    }
  });

  it("ignores case and punctuation", () => {
    const a = searchHelp(HELP_TOPICS, "DPIA");
    const b = searchHelp(HELP_TOPICS, "dpia?");
    assert.deepEqual(a.map((h) => h.topic.id), b.map((h) => h.topic.id));
    assert.ok(a.length > 0);
  });

  it("returns nothing rather than everything for a term nobody used", () => {
    assert.deepEqual(searchHelp(HELP_TOPICS, "zzzznotathing"), []);
  });

  it("answers the questions somebody would actually type", () => {
    for (const [query, expected] of [
      ["why can't I see", "roles-and-access"],
      ["cookie scan", "findings"],
      ["mention someone", "discussion"],
      ["accept a risk", "risks"],
      ["transfer outside uk", "transfers"],
    ] as const) {
      const hits = searchHelp(HELP_TOPICS, query);
      assert.ok(
        hits.slice(0, 3).some((h) => h.topic.id === expected),
        `"${query}" should surface ${expected}, got ${hits.slice(0, 3).map((h) => h.topic.id).join(", ") || "nothing"}`,
      );
    }
  });
});

describe("help that matches the application", () => {
  it("has no duplicate topic ids", () => {
    assert.equal(TOPIC_BY_ID.size, HELP_TOPICS.length);
  });

  it("never links to a topic that does not exist", () => {
    // A dead 'see also' is the kind of rot nobody notices by reading.
    for (const topic of HELP_TOPICS) {
      for (const id of topic.related ?? []) {
        assert.ok(TOPIC_BY_ID.has(id), `${topic.id} points at missing topic ${id}`);
      }
    }
  });

  it("does not point itself at itself", () => {
    for (const topic of HELP_TOPICS) {
      assert.ok(!(topic.related ?? []).includes(topic.id), topic.id);
    }
  });

  it("covers every screen in the navigation", () => {
    // If a page is worth a nav entry, somebody will want help on it.
    for (const item of NAV) {
      assert.ok(
        topicForPath(HELP_TOPICS, item.href),
        `no help topic covers ${item.href} (${item.label})`,
      );
    }
  });

  it("resolves a nested path to the most specific topic", () => {
    assert.equal(topicForPath(HELP_TOPICS, "/app/ai/graph")?.id, "ai-chain");
    assert.equal(topicForPath(HELP_TOPICS, "/app/ai")?.id, "ai-register");
    assert.equal(topicForPath(HELP_TOPICS, "/app/ropa/some-id")?.id, "ropa");
  });

  it("gives every topic a summary that reads as one sentence", () => {
    for (const t of HELP_TOPICS) {
      assert.ok(t.summary.length > 20, `${t.id} summary too short`);
      assert.ok(t.summary.length < 200, `${t.id} summary too long for a search result`);
      assert.ok(t.sections.length > 0, `${t.id} has no content`);
    }
  });
});

describe("help where the question arises", () => {
  it("puts contextual help on every screen in the navigation", () => {
    // The help centre is the destination; this is the signpost. A screen that
    // loses its signpost still works, which is why nothing else would catch it.
    for (const item of NAV) {
      if (item.href === "/app/help") continue;
      const file = `src/app${item.href}/page.tsx`;
      const source = readFileSync(file, "utf8");
      assert.ok(
        source.includes("<HelpLink"),
        `${file} has no contextual help (${item.label})`,
      );
    }
  });

  it("only ever references topics that exist", () => {
    for (const item of NAV) {
      if (item.href === "/app/help") continue;
      const source = readFileSync(`src/app${item.href}/page.tsx`, "utf8");
      for (const [, id] of source.matchAll(/<HelpLink topic="([^"]+)"/g)) {
        assert.ok(TOPIC_BY_ID.has(id), `${item.href} points at missing topic ${id}`);
      }
    }
  });
});
