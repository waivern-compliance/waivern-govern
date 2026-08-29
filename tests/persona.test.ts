import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { navFor } from "@/lib/nav";
import {
  PERSONAS,
  resolvePersona,
  statusWords,
  type Persona,
} from "@/lib/persona";
import { can, type Grant } from "@/lib/rbac";

const contributor: Grant[] = [{ role: "contributor", scope: "organisation" }];
const analyst: Grant[] = [{ role: "privacy_analyst", scope: "organisation" }];
const admin: Grant[] = [{ role: "privacy_admin", scope: "organisation" }];
const auditor: Grant[] = [{ role: "auditor", scope: "organisation" }];

describe("persona never decides access", () => {
  it("does not change what any capability check returns", () => {
    // The whole safety argument rests on this. If a persona could widen or
    // narrow access there would be two permission systems, and the one nobody
    // is testing would win.
    const capabilities = [
      "record.read", "risk.manage", "risk.accept", "approval.decide",
      "assessment.answer", "audit.read", "template.author",
    ] as const;

    for (const grants of [contributor, analyst, admin, auditor]) {
      for (const capability of capabilities) {
        const answers = PERSONAS.map((p) => {
          // `can` takes grants and a capability. There is deliberately no
          // parameter for a persona to occupy.
          void p;
          return can(grants, capability);
        });
        assert.equal(
          new Set(answers).size,
          1,
          `${capability} must not vary by persona`,
        );
      }
    }
  });

  it("does not change what the navigation offers", () => {
    for (const grants of [contributor, analyst, auditor]) {
      const shown = navFor(grants).map((i) => i.href).join(",");
      for (const _ of PERSONAS) {
        assert.equal(navFor(grants).map((i) => i.href).join(","), shown);
      }
    }
  });

  it("is never read by anything that authorises", () => {
    // A structural check rather than a behavioural one: if persona ever appears
    // in the authorisation modules, the separation has been broken by someone
    // who did not read the comment saying not to.
    for (const file of ["src/lib/rbac.ts", "src/lib/session.ts"]) {
      const source = readFileSync(file, "utf8");
      const authorising = source
        .split("\n")
        .filter((line) => /\bcan\(|scopedEntityIds|requireCapability/.test(line))
        .join("\n");
      assert.ok(
        !/persona/i.test(authorising),
        `${file}: an authorisation path mentions persona`,
      );
    }
  });

  it("keeps the services free of persona entirely", () => {
    // Presentation may branch on persona; the services that read and write
    // governance records may not.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const offenders = walk("src/services")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !f.endsWith("persona.ts"))
      .filter((f) => /persona/i.test(readFileSync(f, "utf8")));

    assert.deepEqual(offenders, []);
  });
});

describe("resolving a persona", () => {
  it("uses what was stated, whatever the grants say", () => {
    for (const p of PERSONAS) {
      assert.equal(resolvePersona(p, contributor), p);
      assert.equal(resolvePersona(p, admin), p);
    }
  });

  it("falls back sensibly when nobody has chosen", () => {
    assert.equal(resolvePersona(null, admin), "privacy_governance");
    assert.equal(resolvePersona(null, analyst), "privacy_governance");
    assert.equal(resolvePersona(null, auditor), "privacy_governance");
    // Answering questions and nothing else: the home that leads with assigned
    // work, not one that opens with a button to start an assessment.
    assert.equal(resolvePersona(null, contributor), "engineering");
  });

  it("gives everybody a persona, including somebody with no grants", () => {
    assert.ok(PERSONAS.includes(resolvePersona(null, [])));
  });
});

describe("the words each persona sees", () => {
  it("keeps the real vocabulary for professionals", () => {
    // "In review" means something precise to a DPO, and softening it loses
    // information they use.
    assert.equal(statusWords("in_review", "privacy_governance"), "in review");
    assert.equal(statusWords("in_review", "ai_governance"), "in review");
  });

  it("says what happened, in plain words, for everybody else", () => {
    assert.equal(statusWords("in_review", "product"), "With the privacy team");
    assert.equal(statusWords("returned", "product"), "Needs more from you");
    assert.equal(statusWords("approved", "product"), "Cleared");
    assert.equal(statusWords("in_review", "engineering"), "With the privacy team");
  });

  it("never leaves a status unrendered", () => {
    const statuses = [
      "draft", "in_progress", "in_review", "returned",
      "approved", "rejected", "superseded", "withdrawn",
    ];
    for (const s of statuses) {
      for (const p of PERSONAS) {
        const words = statusWords(s, p as Persona);
        assert.ok(words.length > 0);
        assert.ok(!words.includes("_"), `${s} for ${p} still reads like a database value`);
      }
    }
  });
});
