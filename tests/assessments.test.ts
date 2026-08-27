import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  assessmentRevisions,
  assessments,
  entities,
  organisations,
} from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { sha256Hex } from "@/lib/canonical";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import {
  AnswersRejected,
  AssessmentNotEditable,
  SubmissionIncomplete,
  assessmentHistory,
  createAssessment,
  loadAssessment,
  returnAssessment,
  saveAnswers,
  submitAssessment,
} from "@/services/assessments";
import {
  completeContributorLink,
  contributorActor,
  issueContributorLink,
  redeemContributorLink,
  revokeContributorLink,
} from "@/services/contributor-links";
import { createTemplate, publishVersion } from "@/services/templates";

const ACTOR = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

function messageChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

/** A world with one organisation, one entity and the shipped DPIA published. */
async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `A ${label}`, slug: `asmt-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main entity", isDefault: true })
    .returning();

  const dpia = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;
  const { version } = await createTemplate({
    organisationId: org.id,
    kind: "dpia",
    name: dpia.name,
    definition: dpia.definition,
    actor: ACTOR,
  });
  const published = await publishVersion({
    organisationId: org.id,
    versionId: version.id,
    actor: ACTOR,
  });

  const assessment = await createAssessment({
    organisationId: org.id,
    entityId: entity.id,
    templateVersionId: published.id,
    title: "Audience personalisation trial",
    actor: ACTOR,
  });

  return { org, entity, assessment };
}

/** Enough answers to satisfy every visible required question of the DPIA. */
const COMPLETE_DPIA = {
  activity_name: "Audience personalisation trial",
  nature: "Collect viewing history and serve ranked recommendations.",
  purpose: "Improve relevance of recommendations on the homepage.",
  lawful_basis: "legitimate_interests",
  lia_reference: "LIA-2026-0007",
  data_categories: ["viewing_history", "account_identifiers"],
  special_category: false,
  subject_groups: "Signed-in audience members in the UK.",
  volume: 2400000,
  retention: "Thirteen months from last activity, then aggregated.",
  necessity: "Ranking cannot be personalised without behavioural signal.",
  alternatives: "Considered editorial-only ranking; materially worse relevance.",
  transparency: "Privacy notice plus an in-product explainer on first use.",
  rights_support: "Self-service controls plus the existing rights workflow.",
  transfers_abroad: false,
  risk_description: "Inference of sensitive interests from viewing behaviour.",
  likelihood: "possible",
  impact: "limited",
  measures: "Interest categories exclude special-category topics; short retention.",
  residual_accepted: false,
};

after(async () => {
  await pg.end();
});

describe("creating an assessment", () => {
  it("allocates a readable reference", async () => {
    const { assessment } = await world("ref");
    assert.match(assessment.reference, /^DPIA-\d{4}-0001$/);
  });

  it("numbers references sequentially without reuse", async () => {
    const { org, entity, assessment } = await world("seq");
    const second = await createAssessment({
      organisationId: org.id,
      entityId: entity.id,
      templateVersionId: assessment.templateVersionId,
      title: "Second",
      actor: ACTOR,
    });
    assert.match(second.reference, /-0002$/);
  });

  it("does not hand two concurrent creations the same reference", async () => {
    const { org, entity, assessment } = await world("race");
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createAssessment({
          organisationId: org.id,
          entityId: entity.id,
          templateVersionId: assessment.templateVersionId,
          title: `Concurrent ${i}`,
          actor: ACTOR,
        }),
      ),
    );
    const refs = created.map((a) => a.reference);
    assert.equal(new Set(refs).size, refs.length, `duplicate references: ${refs.join(", ")}`);
  });

  it("refuses to start from an unpublished template version", async () => {
    const { org, entity } = await world("draftonly");
    const dpia = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;
    const { version } = await createTemplate({
      organisationId: org.id,
      kind: "custom",
      name: "Unpublished",
      definition: dpia.definition,
      actor: ACTOR,
    });
    await assert.rejects(
      createAssessment({
        organisationId: org.id,
        entityId: entity.id,
        templateVersionId: version.id,
        title: "Should not start",
        actor: ACTOR,
      }),
      /published template version/,
    );
  });
});

describe("answering", () => {
  it("records who gave each answer", async () => {
    const { org, assessment } = await world("attrib");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { activity_name: "Trial" },
      actor: { actorKind: "contributor_link", actorUserId: null, actorLabel: "editor@example.com" },
    });
    const loaded = await loadAssessment(assessment.id, org.id);
    assert.equal(loaded!.answerMeta.activity_name.by, "editor@example.com");
  });

  it("rejects a question that is not in the template", async () => {
    const { org, assessment } = await world("unknownq");
    await assert.rejects(
      saveAnswers({
        assessmentId: assessment.id,
        organisationId: org.id,
        answers: { not_a_question: "x" },
        actor: ACTOR,
      }),
      (e) => e instanceof AnswersRejected,
    );
  });

  it("rejects an option that is not offered", async () => {
    const { org, assessment } = await world("badoption");
    await assert.rejects(
      saveAnswers({
        assessmentId: assessment.id,
        organisationId: org.id,
        answers: { lawful_basis: "vibes" },
        actor: ACTOR,
      }),
      /not one of the options/,
    );
  });

  it("refuses to write an answer to a question the logic is not asking", async () => {
    const { org, assessment } = await world("hidden");
    // lia_reference only appears when the lawful basis is legitimate interests.
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { lawful_basis: "consent" },
      actor: ACTOR,
    });
    await assert.rejects(
      saveAnswers({
        assessmentId: assessment.id,
        organisationId: org.id,
        answers: { lia_reference: "LIA-1" },
        actor: ACTOR,
      }),
      /not currently being asked/,
    );
  });

  it("accepts a batch that both reveals a question and answers it", async () => {
    const { org, assessment } = await world("batch");
    const result = await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { lawful_basis: "legitimate_interests", lia_reference: "LIA-2026-0007" },
      actor: ACTOR,
    });
    assert.equal(result.saved, 2);
  });

  it("moves a draft to in progress on first save", async () => {
    const { org, assessment } = await world("status");
    assert.equal(assessment.status, "draft");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { activity_name: "Trial" },
      actor: ACTOR,
    });
    const loaded = await loadAssessment(assessment.id, org.id);
    assert.equal(loaded!.assessment.status, "in_progress");
  });
});

describe("submitting", () => {
  it("refuses an incomplete assessment and names what is missing", async () => {
    const { org, assessment } = await world("incomplete");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { activity_name: "Trial" },
      actor: ACTOR,
    });
    await assert.rejects(
      submitAssessment({ assessmentId: assessment.id, organisationId: org.id, actor: ACTOR }),
      (e) => e instanceof SubmissionIncomplete && e.missing.length > 0,
    );
  });

  it("scores and snapshots a complete assessment", async () => {
    const { org, assessment } = await world("complete");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: COMPLETE_DPIA,
      actor: ACTOR,
    });
    const result = await submitAssessment({
      assessmentId: assessment.id,
      organisationId: org.id,
      actor: ACTOR,
    });

    assert.equal(result.assessment.status, "in_review");
    // possible (3) x limited (2) = 6 -> Medium band (4-7)
    assert.equal(result.assessment.scoreValue, 6);
    assert.equal(result.assessment.scoreTier, "medium");

    const history = await assessmentHistory(assessment.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].reason, "submitted");
  });

  it("keeps the questions that were asked inside the snapshot", async () => {
    const { org, assessment } = await world("snapshot");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: COMPLETE_DPIA,
      actor: ACTOR,
    });
    await submitAssessment({ assessmentId: assessment.id, organisationId: org.id, actor: ACTOR });

    const [rev] = await assessmentHistory(assessment.id);
    // transfers_abroad is false, so the destination question was not asked.
    assert.equal(rev.evaluation.questions.transfer_destinations.visible, false);
    assert.equal(rev.evaluation.questions.lia_reference.visible, true);
  });

  it("will not accept answers once submitted", async () => {
    const { org, assessment } = await world("locked");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: COMPLETE_DPIA,
      actor: ACTOR,
    });
    await submitAssessment({ assessmentId: assessment.id, organisationId: org.id, actor: ACTOR });

    await assert.rejects(
      saveAnswers({
        assessmentId: assessment.id,
        organisationId: org.id,
        answers: { activity_name: "Changed after the fact" },
        actor: ACTOR,
      }),
      (e) => e instanceof AssessmentNotEditable,
    );
  });

  it("reopens for editing when returned, and demands a reason", async () => {
    const { org, assessment } = await world("returned");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: COMPLETE_DPIA,
      actor: ACTOR,
    });
    await submitAssessment({ assessmentId: assessment.id, organisationId: org.id, actor: ACTOR });

    await assert.rejects(
      returnAssessment({
        assessmentId: assessment.id,
        organisationId: org.id,
        reason: "   ",
        actor: ACTOR,
      }),
      /reason is required/,
    );

    await returnAssessment({
      assessmentId: assessment.id,
      organisationId: org.id,
      reason: "Retention period needs a source.",
      actor: ACTOR,
    });
    const loaded = await loadAssessment(assessment.id, org.id);
    assert.equal(loaded!.assessment.status, "returned");

    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { retention: "Thirteen months, per the corporate retention schedule." },
      actor: ACTOR,
    });
  });

  it("cannot have its history rewritten", async () => {
    const { org, assessment } = await world("immutable");
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: COMPLETE_DPIA,
      actor: ACTOR,
    });
    await submitAssessment({ assessmentId: assessment.id, organisationId: org.id, actor: ACTOR });

    await assert.rejects(
      db.execute(
        sql`update assessment_revision set answers = '{}'::jsonb where assessment_id = ${assessment.id}`,
      ),
      (err) => /append-only/.test(messageChain(err)),
    );
  });
});

describe("contributor links", () => {
  it("grants access to one section and refuses the rest", async () => {
    const { org, assessment } = await world("scoped");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "Producer@Example.com",
      sectionKey: "data",
      actor: ACTOR,
    });

    const redeemed = await redeemContributorLink(issued.token);
    assert.equal(redeemed.ok, true);
    if (!redeemed.ok) return;
    assert.equal(redeemed.link.sectionKey, "data");
    assert.equal(redeemed.link.email, "producer@example.com");

    const actor = contributorActor(redeemed.link.email);

    // In scope: a question in the "data" section.
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { subject_groups: "Signed-in audience members." },
      allowedSection: redeemed.link.sectionKey,
      actor,
    });

    // Out of scope: a question in "description". The scope is enforced at the
    // write, not merely reflected in what the page chose to render.
    await assert.rejects(
      saveAnswers({
        assessmentId: assessment.id,
        organisationId: org.id,
        answers: { activity_name: "Renamed by an outsider" },
        allowedSection: redeemed.link.sectionKey,
        actor,
      }),
      /Outside the section you were asked about/,
    );
  });

  it("never stores the token itself", async () => {
    const { org, assessment } = await world("hashed");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      actor: ACTOR,
    });

    const rows = await db.execute<{ token_hash: string }>(
      sql`select token_hash from contributor_link where id = ${issued.id}`,
    );
    assert.notEqual(rows[0].token_hash, issued.token);
    assert.equal(rows[0].token_hash, await sha256Hex(issued.token));
  });

  it("refuses a revoked link", async () => {
    const { org, assessment } = await world("revoked");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      actor: ACTOR,
    });
    await revokeContributorLink({ linkId: issued.id, organisationId: org.id, actor: ACTOR });

    const redeemed = await redeemContributorLink(issued.token);
    assert.equal(redeemed.ok, false);
    assert.equal(redeemed.ok === false && redeemed.reason, "revoked");
  });

  it("refuses an expired link", async () => {
    const { org, assessment } = await world("expired");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      ttlDays: 1,
      actor: ACTOR,
    });
    await db.execute(
      sql`update contributor_link set expires_at = now() - interval '1 hour' where id = ${issued.id}`,
    );
    const redeemed = await redeemContributorLink(issued.token);
    assert.equal(redeemed.ok === false && redeemed.reason, "expired");
  });

  it("refuses a link once its contributor is finished", async () => {
    const { org, assessment } = await world("done");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      actor: ACTOR,
    });
    await completeContributorLink({ linkId: issued.id, organisationId: org.id, actor: ACTOR });
    const redeemed = await redeemContributorLink(issued.token);
    assert.equal(redeemed.ok === false && redeemed.reason, "completed");
  });

  it("refuses a made-up token", async () => {
    const redeemed = await redeemContributorLink("not-a-real-token");
    assert.equal(redeemed.ok === false && redeemed.reason, "not_found");
  });

  it("stops working once the assessment leaves editing", async () => {
    const { org, assessment } = await world("closed");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      actor: ACTOR,
    });
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: COMPLETE_DPIA,
      actor: ACTOR,
    });
    await submitAssessment({ assessmentId: assessment.id, organisationId: org.id, actor: ACTOR });

    const redeemed = await redeemContributorLink(issued.token);
    assert.equal(redeemed.ok === false && redeemed.reason, "assessment_closed");
  });

  it("survives being opened more than once, and counts each use", async () => {
    // A link that dies after one HTTP request cannot be used: loading the page
    // and saving are separate requests, and people come back to finish.
    const { org, assessment } = await world("reuse");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      actor: ACTOR,
    });

    for (let i = 0; i < 3; i++) {
      const r = await redeemContributorLink(issued.token);
      assert.equal(r.ok, true);
    }
    const rows = await db.execute<{ use_count: number | string }>(
      sql`select use_count from contributor_link where id = ${issued.id}`,
    );
    assert.equal(Number(rows[0].use_count), 3);
  });

  it("leaves an intact audit chain across the whole flow", async () => {
    const { org, assessment } = await world("audited");
    const issued = await issueContributorLink({
      organisationId: org.id,
      assessmentId: assessment.id,
      email: "producer@example.com",
      sectionKey: "data",
      actor: ACTOR,
    });
    const redeemed = await redeemContributorLink(issued.token);
    if (!redeemed.ok) throw new Error("expected redemption to succeed");

    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: org.id,
      answers: { subject_groups: "Audience members." },
      allowedSection: "data",
      actor: contributorActor(redeemed.link.email),
    });
    await completeContributorLink({
      linkId: issued.id,
      organisationId: org.id,
      actor: contributorActor(redeemed.link.email),
    });

    const result = await verifyAuditChain(org.id);
    assert.equal(result.ok, true);
  });
});
