import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, users } from "@/db/schema";
import { GENESIS_HASH, audit } from "@/lib/audit";
import { canonicalise } from "@/lib/canonical";
import { toCsv } from "@/lib/csv";
import { createRisk, setResidual } from "@/services/risks";
import { exportAudit, exportRisks, recordExport } from "@/services/exports";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `E ${label}`, slug: `exp-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [ps] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Public Service", isDefault: true })
    .returning();
  const [studios] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Studios" })
    .returning();
  return { org, ps, studios };
}

after(async () => {
  await pg.end();
});

describe("exporting the risk register", () => {
  it("carries the acceptance and says whether it has lapsed", async () => {
    const w = await world("risks");
    const risk = await createRisk({
      organisationId: w.org.id, entityId: w.ps.id,
      title: "Residual exposure", description: "x",
      likelihood: 3, impact: 3, actor: SYSTEM,
    });
    await setResidual({
      riskId: risk.id, organisationId: w.org.id,
      likelihood: 2, impact: 2, actor: SYSTEM,
    });

    const result = await exportRisks(w.org.id, null);
    assert.equal(result.rows.length, 1);
    const row = Object.fromEntries(result.columns.map((c, i) => [c, result.rows[0][i]]));
    assert.equal(row["Reference"], risk.reference);
    assert.equal(row["Inherent tier"], "high");
    assert.equal(row["Residual tier"], "medium");
    // No acceptance yet, so the lapsed column is blank rather than "no" —
    // "no" would imply an acceptance exists and is current.
    assert.equal(row["Acceptance lapsed"], null);
  });

  it("only exports what the person can see", async () => {
    const w = await world("scoped");
    await createRisk({
      organisationId: w.org.id, entityId: w.ps.id, title: "Mine",
      description: "x", likelihood: 2, impact: 2, actor: SYSTEM,
    });
    await createRisk({
      organisationId: w.org.id, entityId: w.studios.id, title: "Theirs",
      description: "x", likelihood: 2, impact: 2, actor: SYSTEM,
    });

    assert.equal((await exportRisks(w.org.id, null)).rows.length, 2);
    const scoped = await exportRisks(w.org.id, [w.ps.id]);
    assert.equal(scoped.rows.length, 1);
    assert.equal(scoped.rows[0][2], "Mine");
  });
});

describe("exporting the audit log", () => {
  it("lets a recipient verify the chain without trusting us", async () => {
    const w = await world("verify");
    for (let i = 0; i < 6; i++) {
      await audit({
        organisationId: w.org.id,
        actorKind: "system",
        actorLabel: "test",
        action: `test.step_${i}`,
        subjectType: "organisation",
        subjectId: w.org.id,
      });
    }

    const result = await exportAudit(w.org.id, null);
    assert.equal(result.complete, true);
    assert.equal(result.caveat, undefined);

    // Reproduce the verification the manifest describes, from the exported
    // columns alone. This is the whole point of a tamper-evident log: if only
    // we can check it, it is a claim rather than evidence.
    const index = Object.fromEntries(result.columns.map((c, i) => [c, i]));
    let expectedPrev = GENESIS_HASH;
    let expectedSeq = 1;

    for (const row of result.rows) {
      const at = row[index["At"]] as Date;
      assert.equal(row[index["Sequence"]], expectedSeq, "sequence must not skip");
      assert.equal(row[index["Previous hash"]], expectedPrev, "chain must join up");

      const recomputed = createHash("sha256")
        .update(
          canonicalise([
            w.org.id,
            row[index["Sequence"]],
            at.toISOString(),
            row[index["Actor kind"]],
            null,
            row[index["Actor"]],
            row[index["Action"]],
            row[index["Subject type"]],
            row[index["Subject"]],
            row[index["Entity"]] ?? null,
            row[index["Before"]] ?? null,
            row[index["After"]] ?? null,
            row[index["Metadata"]],
            row[index["Previous hash"]],
          ]),
        )
        .digest("hex");

      assert.equal(recomputed, row[index["Hash"]], `event ${expectedSeq} does not verify`);
      expectedPrev = row[index["Hash"]] as string;
      expectedSeq += 1;
    }
  });

  it("says plainly when an extract cannot be verified", async () => {
    const w = await world("extract");
    await audit({
      organisationId: w.org.id, actorKind: "system", actorLabel: "test",
      action: "test.one", subjectType: "organisation", subjectId: w.org.id,
    });

    const result = await exportAudit(w.org.id, [w.ps.id]);
    assert.equal(result.complete, false);
    // A recipient must not discover this when verification fails on a gap.
    assert.match(result.caveat ?? "", /cannot be verified/);
    assert.match(result.caveat ?? "", /organisation-wide audit access/);
  });

  it("records the export itself", async () => {
    const w = await world("selfrecord");
    const before = (await exportAudit(w.org.id, null)).rows.length;

    await recordExport({
      organisationId: w.org.id,
      dataset: "risks",
      rows: 12,
      actor: { actorKind: "user", actorUserId: null, actorLabel: "dpo@example.com" },
    });

    const after = await exportAudit(w.org.id, null);
    assert.equal(after.rows.length, before + 1);
    const last = after.rows.at(-1)!;
    const index = Object.fromEntries(after.columns.map((c, i) => [c, i]));
    assert.equal(last[index["Action"]], "data.exported");
    assert.equal(last[index["Actor"]], "dpo@example.com");
    // Somebody took the register out of the building. In a platform whose whole
    // argument is an unbroken record, that is a strange thing to leave out.
    assert.match(JSON.stringify(last[index["After"]]), /risks/);
  });

  it("stays verifiable once an export has been recorded into it", async () => {
    const w = await world("recursive");
    await recordExport({
      organisationId: w.org.id, dataset: "audit", rows: 3, complete: true, actor: SYSTEM,
    });
    const result = await exportAudit(w.org.id, null);
    const index = Object.fromEntries(result.columns.map((c, i) => [c, i]));
    let prev = GENESIS_HASH;
    for (const row of result.rows) {
      assert.equal(row[index["Previous hash"]], prev);
      prev = row[index["Hash"]] as string;
    }
  });
});

describe("the file a person opens", () => {
  it("survives a risk title that is a spreadsheet formula", async () => {
    const w = await world("injection");
    await createRisk({
      organisationId: w.org.id,
      entityId: w.ps.id,
      title: '=HYPERLINK("http://attacker.example","Click for your refund")',
      description: "Somebody typed this into a title field.",
      likelihood: 2, impact: 2, actor: SYSTEM,
    });

    const result = await exportRisks(w.org.id, null);
    const csv = toCsv(result.columns, result.rows);
    // Present and readable, but inert — no cell in the file starts a formula.
    assert.ok(csv.includes("HYPERLINK"));
    const cells = csv.split(/\r\n/).flatMap((line) => line.split(","));
    assert.ok(!cells.some((c) => /^=/.test(c)), "a live formula reached the file");
  });
});
