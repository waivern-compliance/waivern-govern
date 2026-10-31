import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GATE_WORDS } from "@/lib/ai/lifecycle";
import { pecrObligationsFor } from "@/lib/breach/statutory";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { LEGAL_REFERENCES } from "@/lib/templates/library/legal-references";
import { templateDefinition } from "@/lib/templates/schema";

const code = (c: string) => LEGAL_REFERENCES.find((r) => r.code === c);

describe("the Data Protection Act 2018 in the library", () => {
  it("holds what the public-sector phases will cite, Part 2 and Part 3", () => {
    for (const c of [
      "uk.dpa2018.s7", "uk.dpa2018.s8", "uk.dpa2018.sch1", "uk.dpa2018.sch1.para2", "uk.dpa2018.sch1.para3",
      "uk.dpa2018.sch1.para6", "uk.dpa2018.sch1.para10", "uk.dpa2018.sch1.para18", "uk.dpa2018.sch1.part4",
      "uk.dpa2018.sch2.para2", "uk.dpa2018.sch2.para4", "uk.dpa2018.sch3", "uk.dpa2018.sch7", "uk.dpa2018.sch8",
      "uk.dpa2018.s30", "uk.dpa2018.s31", "uk.dpa2018.s35", "uk.dpa2018.s38", "uk.dpa2018.s42", "uk.dpa2018.s45",
      "uk.dpa2018.s50a", "uk.dpa2018.s61", "uk.dpa2018.s62", "uk.dpa2018.s64", "uk.dpa2018.s65", "uk.dpa2018.s67",
      "uk.dpa2018.s68", "uk.dpa2018.s69", "uk.dpa2018.part3.ch5", "uk.dpa2018.s78a", "uk.dpa2018.s82a",
      "ukgdpr.art10", "ukgdpr.art37",
    ]) {
      assert.ok(code(c), `${c} is in the library`);
    }
  });

  it("points each Act reference at its section, schedule, paragraph, part or chapter", () => {
    for (const ref of LEGAL_REFERENCES.filter((r) => r.code.startsWith("uk.dpa2018."))) {
      assert.match(
        ref.url!,
        /\/ukpga\/2018\/12\/(section\/\d+[A-Z]{0,2}|schedule\/\d+(\/(paragraph|part)\/\d+)?|part\/\d+\/chapter\/\d+)$/,
        `${ref.code} is not a precise link`,
      );
    }
  });

  it("is cited where the DPIA asks about conditions, the public task and rights", () => {
    const dpia = templateDefinition.parse(SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!.definition).schema;
    const refs = (key: string) => dpia.sections.flatMap((s) => s.questions).find((q) => q.key === key)!.legalRefs;
    assert.ok(refs("criminal_offence").includes("ukgdpr.art10"));
    assert.ok(refs("art9_condition").includes("uk.dpa2018.sch1"));
    assert.ok(refs("schedule1_condition").includes("uk.dpa2018.sch1.part4"));
    assert.ok(refs("policy_document").includes("uk.dpa2018.sch1.part4"));
    assert.ok(refs("lawful_basis").includes("uk.dpa2018.s8"));
    for (const c of ["uk.dpa2018.sch2", "uk.dpa2018.sch3", "uk.duaa2025"]) assert.ok(refs("rights_support").includes(c), c);
  });
});

describe("the regulator's name", () => {
  it("is the Information Commission wherever its statutory role is described", () => {
    const templates = JSON.stringify(SYSTEM_TEMPLATES.filter((t) => t.jurisdiction === "UK").map((t) => t.definition));
    assert.doesNotMatch(templates, /Information Commissioner|consultation with the ICO|the ICO's advice|ICO's advice has/);
    assert.match(templates, /prior consultation with the Information Commission/);
    assert.match(GATE_WORDS.ico_consulted, /Information Commission's advice/);
    assert.match(pecrObligationsFor({ discoveredAt: new Date() })[0].what, /Information Commission\b/);
    assert.doesNotMatch(pecrObligationsFor({ discoveredAt: new Date() })[0].what, /Commissioner/);
  });

  it("keeps the ICO's name on the guidance it publishes", () => {
    assert.ok(LEGAL_REFERENCES.filter((r) => r.code.startsWith("ico.")).every((r) => r.url?.startsWith("https://ico.org.uk/")));
  });
});
