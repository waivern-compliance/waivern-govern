import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import {
  SUGGESTIONS_REVIEWED,
  VENDOR_ENDPOINTS,
  suggestionsFor,
} from "@/lib/assistant/models";
import { ask } from "@/lib/assistant/providers";
import { extractJson } from "@/lib/assistant/parse";
import { mismatchedWireFormat } from "@/services/assistant";
import { redact, summariseRedactions } from "@/lib/assistant/redact";

describe("what leaves the platform", () => {
  it("passes ordinary governance prose through untouched", () => {
    const text = "We keep viewing history for 13 months to support recommendations.";
    const { text: out, redactions } = redact(text);
    assert.equal(out, text);
    assert.deepEqual(redactions, []);
  });

  it("removes an email address and says so", () => {
    const { text, redactions } = redact("Ask vincent.nunan@waivern.com about it.");
    assert.ok(!text.includes("vincent.nunan@waivern.com"));
    assert.match(text, /\[email removed\]/);
    assert.deepEqual(redactions, [{ kind: "email address", count: 1 }]);
  });

  it("counts several of the same kind", () => {
    const { redactions } = redact("a@b.com and c@d.com and e@f.com");
    assert.deepEqual(redactions, [{ kind: "email address", count: 3 }]);
  });

  it("ignores a string that only looks like a national insurance number", () => {
    // Q is not a valid first letter. Matching it would mean stripping ordinary
    // text that happens to resemble one.
    assert.deepEqual(redact("reference QQ 12 34 56 C").redactions, []);
  });

  it("removes the identifiers a chat box invites", () => {
    for (const [input, kind] of [
      ["My number is 07700 900123", "UK telephone number"],
      ["NINO AB 12 34 56 C", "national insurance number"],
      ["card 4111 1111 1111 1111", "payment card number"],
      ["they live at SW1A 1AA", "UK postcode"],
      ["from 192.168.1.44", "IP address"],
    ] as const) {
      const { redactions } = redact(input);
      assert.ok(
        redactions.some((r) => r.kind === kind),
        `${kind} not removed from "${input}" (got ${redactions.map((r) => r.kind).join(", ") || "nothing"})`,
      );
    }
  });

  it("keeps a national insurance number intact rather than shredding it", () => {
    // The number rules would otherwise cut it into pieces that no longer look
    // like anything, which reads as safe while leaving fragments behind.
    const { text } = redact("NINO AB123456C on file");
    assert.match(text, /\[national insurance number removed\]/);
    assert.ok(!/\d/.test(text), `digits survived: ${text}`);
  });

  it("says plainly what it took out", () => {
    const { redactions } = redact("a@b.com, c@d.com and 192.168.0.1");
    const said = summariseRedactions(redactions);
    assert.match(said!, /2 email addresses/);
    assert.match(said!, /1 IP address/);
    assert.equal(summariseRedactions([]), null);
  });

  it("is honest about what it cannot catch", () => {
    // Shapes, not meaning. This is why the control is described as partial and
    // why the user is warned at the point of entry.
    const { redactions } = redact("The claimant's mother is unwell.");
    assert.deepEqual(redactions, []);
  });
});

describe("reading a model's answer", () => {
  it("reads plain JSON", () => {
    assert.deepEqual(extractJson('{"answer":"yes"}'), { answer: "yes" });
  });

  it("reads it out of a fenced block", () => {
    assert.deepEqual(extractJson('```json\n{"answer":"yes"}\n```'), { answer: "yes" });
    assert.deepEqual(extractJson('```\n{"answer":"yes"}\n```'), { answer: "yes" });
  });

  it("reads it out of prose the model wrapped around it", () => {
    const raw = 'Certainly! Here is the result:\n{"answer":"yes"}\nLet me know if that helps.';
    assert.deepEqual(extractJson(raw), { answer: "yes" });
  });

  it("reads an array as readily as an object", () => {
    assert.deepEqual(extractJson('Here you go: [1,2,3]'), [1, 2, 3]);
  });

  it("returns nothing rather than throwing when it cannot", () => {
    // The property that matters: a governance record stays savable whether or
    // not the advisory layer answered.
    assert.equal(extractJson("I'm sorry, I can't help with that."), null);
    assert.equal(extractJson(""), null);
    assert.equal(extractJson('{"unclosed": '), null);
  });
});

describe("the boundary the product claims", () => {
  it("tells the model what it may not decide", async () => {
    // Belt and braces. The surfaces do not offer to write these fields, and
    // the prompt says so too, because a model that volunteers a rating puts a
    // number in front of somebody who then has to un-see it.
    const source = readFileSync("src/services/assistant.ts", "utf8");
    for (const forbidden of [
      "likelihood",
      "residual",
      "DPIA is required",
      "adequate",
      "processor",
    ]) {
      assert.ok(
        source.includes(forbidden),
        `the house rules should name "${forbidden}" among what it must not do`,
      );
    }
  });

  it("never sends an assessment's answers to the model", () => {
    // The questions are template text the organisation published. The answers
    // are where somebody may have written about a real person.
    const page = readFileSync("src/app/app/assessments/[id]/page.tsx", "utf8");
    const context = page.slice(
      page.indexOf("const assistantContext"),
      page.indexOf("].join(", page.indexOf("const assistantContext")),
    );
    assert.ok(context.length > 0, "assistant context should be assembled on the page");

    // Strip strings and comments first: the context deliberately *says* the
    // answers are excluded, and matching that sentence would pass a test that
    // proves nothing while failing one that should pass.
    const code = context
      .replace(/`[^`]*`/g, "``")
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const identifier of ["answers", "answerMeta"]) {
      assert.ok(
        !new RegExp(`\\b${identifier}\\b`).test(code),
        `${identifier} is referenced in the assistant context`,
      );
    }
  });

  it("has no default endpoint to fall back to", () => {
    // An organisation that has not configured a provider has no assistant,
    // rather than quietly having ours.
    const source = readFileSync("src/lib/assistant/providers.ts", "utf8");
    assert.ok(!/https?:\/\/[a-z]/i.test(source), "no hardcoded endpoint should appear");
  });
});

describe("choosing the wrong wire format", () => {
  it("catches an Anthropic endpoint set to the OpenAI shape", () => {
    // The failure mode this exists for: a correct key sent to a correct URL in
    // a shape it does not understand. Anthropic answers with an authentication
    // error, which sends somebody looking at their key for hours.
    const said = mismatchedWireFormat("openai_compatible", "https://api.anthropic.com/v1/messages");
    assert.ok(said);
    assert.match(said!, /wire format to Anthropic/);
    assert.match(said!, /x-api-key/);
  });

  it("catches an OpenAI endpoint set to the Anthropic shape", () => {
    const said = mismatchedWireFormat("anthropic", "https://myco.openai.azure.com/openai/deployments/x/chat/completions");
    assert.ok(said);
    assert.match(said!, /OpenAI-compatible/);
  });

  it("says nothing when the two agree", () => {
    assert.equal(mismatchedWireFormat("anthropic", "https://api.anthropic.com/v1/messages"), null);
    assert.equal(mismatchedWireFormat("openai_compatible", "https://api.openai.com/v1/chat/completions"), null);
  });

  it("says nothing about an endpoint it cannot recognise", () => {
    // A self-hosted gateway may speak either shape, and guessing would block a
    // configuration that works.
    assert.equal(mismatchedWireFormat("anthropic", "https://llm.internal.example/v1/messages"), null);
    assert.equal(mismatchedWireFormat("openai_compatible", "https://llm.internal.example/v1/chat"), null);
  });
});

describe("reading what a provider sent back", () => {
  const config = {
    kind: "anthropic" as const,
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-5",
    apiKey: "not-a-real-key",
  };
  const one = { system: "s", turns: [{ role: "user" as const, content: "q" }] };

  const serve = (body: unknown, status = 200) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
  };

  const real = globalThis.fetch;
  after(() => {
    globalThis.fetch = real;
  });

  it("reads a text block", async () => {
    serve({ content: [{ type: "text", text: "ready" }] });
    const r = await ask(config, one);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.text, "ready");
  });

  it("skips a block that is not text and still finds the answer", async () => {
    // The defect this replaced mapped over every block and turned the others
    // into empty strings, so a reply that began with one looked like none.
    serve({ content: [{ type: "thinking", thinking: "…" }, { type: "text", text: "ready" }] });
    const r = await ask(config, one);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.text, "ready");
  });

  it("says what came back when there is no text at all", async () => {
    serve({ content: [{ type: "thinking", thinking: "…" }], stop_reason: "max_tokens" });
    const r = await ask(config, one);
    assert.ok(!r.ok);
    if (r.ok) return;
    // "Nothing" is not a diagnosis, and the message it replaced blamed the
    // model name — which cannot be the cause of a 200.
    assert.match(r.detail!, /thinking/);
    assert.match(r.detail!, /max_tokens/);
    assert.ok(!/model name/.test(r.detail!));
  });

  it("passes on what the provider said about a rejection", async () => {
    serve({ error: { type: "authentication_error", message: "invalid x-api-key" } }, 401);
    const r = await ask(config, one);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.match(r.detail!, /401/);
    assert.match(r.detail!, /invalid x-api-key/);
  });

  it("keeps the user-facing reason free of the detail", async () => {
    // Somebody mid-assessment gets the reassuring line; only the settings
    // screen joins the two together.
    serve({ error: { message: "boom" } }, 500);
    const r = await ask(config, one);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.equal(r.reason, "The model could not be reached.");
    assert.ok(r.detail && r.detail !== r.reason);
  });
});

describe("model suggestions", () => {
  it("keeps Anthropic identifiers out of the OpenAI-shaped list", () => {
    // The suggestion list must not be able to recreate the mismatch the guard
    // exists to catch: picking claude-sonnet-5 while the OpenAI shape is
    // selected sends a bearer token to an endpoint expecting x-api-key.
    for (const m of suggestionsFor("openai_compatible")) {
      assert.ok(!m.id.startsWith("claude-"), `${m.id} should not be offered here`);
    }
    for (const m of suggestionsFor("anthropic")) {
      assert.ok(m.id.startsWith("claude-"), `${m.id} does not speak the Anthropic shape`);
    }
  });

  it("covers the vendors somebody would look for", () => {
    const vendors = new Set(suggestionsFor("openai_compatible").map((m) => m.vendor));
    for (const v of ["OpenAI", "Mistral", "Qwen (Alibaba)", "DeepSeek"]) {
      assert.ok([...vendors].some((x) => x.startsWith(v.split(" ")[0])), `no ${v} models`);
    }
    assert.ok(suggestionsFor("anthropic").length >= 3, "too few Anthropic models");
  });

  it("prefers a stable alias where the provider publishes one", () => {
    // A dated snapshot goes stale; an alias does not. Mistral and DeepSeek
    // both offer them, so those are what is listed.
    const ids = suggestionsFor("openai_compatible").map((m) => m.id);
    assert.ok(ids.includes("mistral-large-latest"));
    assert.ok(ids.includes("deepseek-chat"));
  });

  it("suggests no identifier twice", () => {
    for (const kind of ["anthropic", "openai_compatible"] as const) {
      const ids = suggestionsFor(kind).map((m) => m.id);
      assert.equal(new Set(ids).size, ids.length, `${kind} has a duplicate`);
    }
  });

  it("gives every endpoint suggestion the wire format it speaks", () => {
    for (const e of VENDOR_ENDPOINTS) {
      assert.equal(
        mismatchedWireFormat(e.kind, e.url),
        null,
        `${e.vendor} is offered under a format its own guard rejects`,
      );
    }
  });

  it("says when the list was last looked at", () => {
    // Model identifiers move. Better to show the date than to imply currency.
    assert.match(SUGGESTIONS_REVIEWED, /\d{4}/);
  });
});
