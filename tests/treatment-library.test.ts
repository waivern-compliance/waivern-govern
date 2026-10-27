import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, mitigations, organisations } from "@/db/schema";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import {
  TREATMENT_SUGGESTIONS,
  suggestionByKey,
  suggestionsFor,
} from "@/lib/risk/treatment-library";
import { addMitigation, createRisk } from "@/services/risks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world() {
  const [org] = await db
    .insert(organisations)
    .values({ name: "TL", slug: `tl-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const risk = await createRisk({
    organisationId: org.id,
    entityId: entity.id,
    title: "Outputs drift",
    description: "Accuracy falls as the caseload changes.",
    category: "technical_robustness",
    likelihood: 3,
    impact: 3,
    actor: SYSTEM,
  });
  return { org, risk };
}

describe("toolkit treatment library", () => {
  after(() => pg.end());

  it("has unique keys and offers something for every category", () => {
    const keys = TREATMENT_SUGGESTIONS.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const c of AI_RISK_CATEGORIES) {
      assert.ok(
        suggestionsFor(c.value).matching.length > 0,
        `nothing suggested for ${c.value}`,
      );
    }
  });

  it("splits suggestions by category but never hides any", () => {
    const { matching, others } = suggestionsFor("security");
    assert.ok(matching.every((s) => s.categories.includes("security")));
    assert.equal(matching.length + others.length, TREATMENT_SUGGESTIONS.length);
    // A category of the organisation's own matches nothing, and still sees all.
    const own = suggestionsFor("Supplier insolvency");
    assert.equal(own.matching.length, 0);
    assert.equal(own.others.length, TREATMENT_SUGGESTIONS.length);
  });

  it("does not call an acceptance a treatment it is not", () => {
    for (const s of TREATMENT_SUGGESTIONS.filter((x) => x.treatment === null)) {
      assert.equal(s.toolkitType, "Acceptance");
    }
  });

  it("records which suggestion a mitigation started from, and audits it", async () => {
    const { org, risk } = await world();
    const m = await addMitigation({
      riskId: risk.id,
      organisationId: org.id,
      description: "Red-team it with the security team before beta.",
      treatmentType: "limitation",
      suggestionKey: "accuracy.red_team",
      actor: SYSTEM,
    });
    const [row] = await db.select().from(mitigations).where(eq(mitigations.id, m.id));
    assert.equal(row.suggestionKey, "accuracy.red_team");
    // Reworded, and still credited: it records where the idea came from.
    assert.notEqual(row.description, suggestionByKey("accuracy.red_team")!.text);

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, m.id), eq(auditEvents.action, "mitigation.added")));
    assert.equal((event.after as Record<string, unknown>).suggestionKey, "accuracy.red_team");
  });

  it("refuses a suggestion that does not exist", async () => {
    const { org, risk } = await world();
    await assert.rejects(
      addMitigation({
        riskId: risk.id,
        organisationId: org.id,
        description: "Something",
        suggestionKey: "made.up",
        actor: SYSTEM,
      }),
      /No such treatment suggestion/,
    );
  });
});
