import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  entities,
  organisations,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { acceptRisk, addMitigation, createRisk, setResidual } from "@/services/risks";
import { decideApproval, submitForApproval } from "@/services/workflow";

/**
 * A demonstration portfolio.
 *
 * A dashboard built and reviewed against a single record tells you nothing
 * about whether it works: every bar is full, nothing overflows, no label
 * collides. This creates a plausible spread — assessments at every stage, risks
 * that have and have not been treated, work that is late — so the charts are
 * exercised by something resembling real use.
 *
 * Run after `pnpm seed`.
 */

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "demo" };

const DPIA_BASE = {
  nature: "Collect and process personal data to deliver the service described.",
  purpose: "Deliver and improve the service.",
  lawful_basis: "public_task",
  subject_groups: "Audience members and staff, in the UK.",
  necessity: "The processing is required to deliver the stated purpose.",
  alternatives: "Less intrusive options were considered and documented.",
  transparency: "Covered by the privacy notice and an in-product explainer.",
  rights_support: "Handled through the existing rights workflow.",
  measures: "Access control, minimisation and a defined retention period.",
  residual_accepted: false,
};

type Spec = {
  kind: "dpia" | "tra" | "tia" | "ai_risk" | "screening";
  title: string;
  entity: "BBC Public Service" | "BBC Studios";
  answers: Record<string, unknown>;
  /** How far to take it: left in progress, submitted, or walked to approval. */
  advance: "drafting" | "submitted" | "approved" | "returned";
};

function dpia(over: Record<string, unknown>) {
  return {
    ...DPIA_BASE,
    data_categories: ["account_identifiers"],
    special_category: false,
    volume: 50000,
    retention: "Twenty-four months from last activity.",
    transfers_abroad: false,
    risk_description: "Exposure of personal data beyond what people expect.",
    likelihood: "unlikely",
    impact: "limited",
    ...over,
  };
}

const SPECS: Spec[] = [
  {
    kind: "dpia", entity: "BBC Public Service", advance: "approved",
    title: "Newsletter subscription management",
    answers: dpia({ activity_name: "Newsletter subscriptions", lawful_basis: "consent", likelihood: "remote", impact: "minimal", volume: 380000 }),
  },
  {
    kind: "dpia", entity: "BBC Public Service", advance: "approved",
    title: "Accessibility feedback survey",
    answers: dpia({ activity_name: "Accessibility survey", lawful_basis: "consent", likelihood: "remote", impact: "limited", volume: 4200 }),
  },
  {
    kind: "dpia", entity: "BBC Public Service", advance: "submitted",
    title: "Audience research panel recruitment",
    answers: dpia({ activity_name: "Research panel", likelihood: "possible", impact: "limited", volume: 15000 }),
  },
  {
    kind: "dpia", entity: "BBC Studios", advance: "submitted",
    title: "Contributor contract records",
    answers: dpia({
      activity_name: "Contributor records", data_categories: ["contractual", "financial"],
      likelihood: "possible", impact: "significant", volume: 9000,
      transfers_abroad: true, transfer_destinations: ["US"], tra_reference: "TRA-2026-0002",
    }),
  },
  {
    kind: "dpia", entity: "BBC Studios", advance: "submitted",
    title: "Casting and talent database",
    answers: dpia({
      activity_name: "Casting database",
      data_categories: ["images_audio", "contact_details", "racial_ethnic"],
      special_category: true, special_condition: "Article 9(2)(a) explicit consent for diversity monitoring.",
      likelihood: "likely", impact: "significant", volume: 26000,
    }),
  },
  {
    kind: "dpia", entity: "BBC Public Service", advance: "returned",
    title: "Live events ticketing ballot",
    answers: dpia({ activity_name: "Ticketing ballot", likelihood: "possible", impact: "limited", volume: 120000 }),
  },
  {
    kind: "dpia", entity: "BBC Public Service", advance: "drafting",
    title: "Complaints handling replatform",
    answers: { activity_name: "Complaints replatform", nature: "Migrate complaints records to a new system." },
  },
  {
    kind: "dpia", entity: "BBC Studios", advance: "drafting",
    title: "Production crew scheduling",
    answers: { activity_name: "Crew scheduling" },
  },
  {
    kind: "screening", entity: "BBC Public Service", advance: "approved",
    title: "Podcast listener metrics",
    answers: {
      activity_name: "Podcast metrics", summary: "Aggregate listening statistics for editorial planning.",
      owner_area: "Audio", criteria: ["none_apply"], ai_involved: false,
    },
  },
  {
    kind: "screening", entity: "BBC Studios", advance: "submitted",
    title: "Format rights analytics",
    answers: {
      activity_name: "Format analytics", summary: "Analyse performance of formats across markets.",
      owner_area: "Studios Distribution", criteria: ["data_matching"], ai_involved: false,
    },
  },
  {
    kind: "tra", entity: "BBC Studios", advance: "submitted",
    title: "Post-production vendor in the United States",
    answers: {
      transfer_name: "US post-production", importer: "Vendor Inc (processor)", destination: "US",
      data_categories: ["images_audio", "contractual"], special_category: false, frequency: "continuous",
      mechanism: "idta", mechanism_evidence: "Contract library ref CTR-4471",
      surveillance_regime: "broad", redress: "partial",
      supplementary: ["encryption_at_rest", "contractual"],
      likelihood: "possible", impact: "significant",
      conclusion: "Proceed with the supplementary measures recorded above.",
      review_trigger: "A change in sub-processors or in the destination's access regime.",
    },
  },
  {
    kind: "tia", entity: "BBC Studios", advance: "approved",
    title: "EU distribution partner reporting",
    answers: {
      transfer_name: "EU partner reporting", exporter_entity: "BBC Studios Distribution BV",
      importer: "Partner SA", destination: "SG", data_categories: ["contractual"],
      onward_transfers: false, mechanism: "sccs", sccs_modules: "m2",
      legislation_review: "Reviewed the destination's access legislation; narrow and overseen.",
      practice_evidence: "Importer transparency report and contractual attestations.",
      problematic: "no", likelihood: "unlikely", impact: "limited",
      decision: "proceed", rationale: "The transfer tool remains effective in practice.",
    },
  },
  {
    kind: "ai_risk", entity: "BBC Public Service", advance: "submitted",
    title: "Automated subtitle generation for archive",
    answers: {
      use_case_name: "Archive subtitling", purpose: "Generate subtitles for archive content.",
      ai_type: "generative", provenance: "third_party_api", lifecycle_stage: "production",
      affects_people: true, consequence: "influences", audience: ["public"],
      editorial_output: true, disclosure: "Labelled as machine-generated in the player.",
      personal_data: false, data_provenance: "vendor_asserted", sensitive_inputs: "no",
      bias_considered: "reviewed", affected_groups: "Speakers of regional accents and minority languages.",
      contestability: "informal", human_oversight: "post_hoc",
      monitoring: ["accuracy", "complaints"],
      kill_switch: "Editorial systems lead can disable the pipeline.", review_interval: "biannual",
    },
  },
  {
    kind: "ai_risk", entity: "BBC Studios", advance: "submitted",
    title: "Script development assistant",
    answers: {
      use_case_name: "Script assistant", purpose: "Draft and summarise script coverage for readers.",
      ai_type: "generative", provenance: "fine_tuned", lifecycle_stage: "pilot",
      affects_people: true, consequence: "recommends", audience: ["contributors"],
      editorial_output: false, personal_data: true, dpia_reference: "DPIA-2026-0004",
      data_provenance: "opaque", sensitive_inputs: "proxies_possible",
      bias_considered: "not_done", affected_groups: "Writers from under-represented backgrounds.",
      contestability: "none", human_oversight: "on_the_loop",
      monitoring: ["none"],
      kill_switch: "Product owner can withdraw access.", review_interval: "quarterly",
    },
  },
];

const RISKS: Array<{
  title: string; description: string; entity: string;
  l: number; i: number; residual?: [number, number];
  accept?: { rationale: string; days: number }; lapsed?: boolean; mitigation?: string;
}> = [
  {
    title: "Inference of sensitive interests from viewing behaviour",
    description: "Behavioural signal could reveal health, religious or political interests never disclosed.",
    entity: "BBC Public Service", l: 3, i: 3, residual: [2, 2],
    mitigation: "Exclude special-category topics from the interest taxonomy.",
    accept: { rationale: "Within appetite once the taxonomy exclusion is live.", days: 180 },
  },
  {
    title: "Casting database retains contributor images indefinitely",
    description: "No retention rule applied to historic casting material.",
    entity: "BBC Studios", l: 3, i: 3, residual: [3, 2],
    mitigation: "Apply a seven-year retention rule and purge historic records.",
  },
  {
    title: "US post-production vendor subject to broad access powers",
    description: "Destination law permits access with limited redress for UK data subjects.",
    entity: "BBC Studios", l: 2, i: 4, residual: [2, 3],
    mitigation: "Encryption at rest with keys held in the UK; contractual challenge obligation.",
  },
  {
    title: "Script assistant has no bias assessment",
    description: "A generative tool influencing commissioning decisions has not been assessed for bias.",
    entity: "BBC Studios", l: 3, i: 4,
  },
  {
    title: "Subtitle accuracy varies by accent",
    description: "Machine-generated subtitles are materially less accurate for some regional accents.",
    entity: "BBC Public Service", l: 4, i: 2, residual: [3, 2],
    mitigation: "Sample review by accent group; publish an accuracy statement.",
  },
  {
    title: "Complaints records migrated without a documented lawful basis",
    description: "The replatform is under way ahead of the DPIA being completed.",
    entity: "BBC Public Service", l: 3, i: 3,
  },
  {
    title: "Ticketing ballot collects more than it needs",
    description: "The ballot form asks for date of birth where an age band would do.",
    entity: "BBC Public Service", l: 2, i: 2, residual: [1, 2],
    mitigation: "Replace date of birth with an age band.",
    accept: { rationale: "Residual is low and the change ships next quarter.", days: -3 },
    lapsed: true,
  },
  {
    title: "Research panel incentives create a power imbalance",
    description: "Payment for participation may undermine the freeness of consent.",
    entity: "BBC Public Service", l: 2, i: 2, residual: [1, 1],
    mitigation: "Cap incentives and restate withdrawal rights at each wave.",
    accept: { rationale: "Mitigated to low; reviewed annually with the panel contract.", days: 300 },
  },
  {
    title: "Crew scheduling exports contain home addresses",
    description: "Scheduling exports shared with third-party locations include full home addresses.",
    entity: "BBC Studios", l: 4, i: 3,
  },
];

async function main() {
  const [org] = await db.select().from(organisations).where(eq(organisations.slug, "bbc-group"));
  if (!org) throw new Error("Run `pnpm seed` first.");

  const ents = await db.select().from(entities).where(eq(entities.organisationId, org.id));
  const entityByName = new Map(ents.map((e) => [e.name, e.id]));

  const versions = await db
    .select({ id: templateVersions.id, kind: templates.kind })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templates.organisationId, org.id));
  const versionByKind = new Map(versions.map((v) => [v.kind, v.id]));

  const people = await db.select().from(users);
  const byEmail = (e: string) => people.find((p) => p.email === e);
  const analyst = byEmail("privacy.analyst@example.bbc.co.uk")!;
  const dpo = byEmail("dpo@example.bbc.co.uk")!;
  const aiLead = byEmail("ai.governance@example.bbc.co.uk")!;
  const psApprover = byEmail("ps.approver@example.bbc.co.uk")!;
  const studiosApprover = byEmail("studios.approver@example.bbc.co.uk")!;

  const actorOf = (u: { id: string; email: string }) => ({
    actorKind: "user" as const,
    actorUserId: u.id,
    actorLabel: u.email,
  });
  const rolesOf = (u: { email: string }) =>
    u.email === analyst.email ? ["privacy_analyst"]
    : u.email === dpo.email ? ["privacy_admin"]
    : u.email === aiLead.email ? ["ai_governance"]
    : ["approver"];

  let created = 0;
  for (const spec of SPECS) {
    const templateVersionId = versionByKind.get(spec.kind);
    const entityId = entityByName.get(spec.entity);
    if (!templateVersionId || !entityId) continue;

    const a = await createAssessment({
      organisationId: org.id,
      entityId,
      templateVersionId,
      title: spec.title,
      ownerId: analyst.id,
      actor: SYSTEM,
    });
    await saveAnswers({
      assessmentId: a.id,
      organisationId: org.id,
      answers: spec.answers as never,
      actor: actorOf(analyst),
    });
    created += 1;
    if (spec.advance === "drafting") continue;

    const submitted = await submitForApproval({
      assessmentId: a.id,
      organisationId: org.id,
      actor: actorOf(analyst),
    });

    if (spec.advance === "submitted") continue;

    // Walk the gates. Each is decided by somebody who holds its role.
    let gates = submitted.approvals.filter((g) => g.status === "pending");
    if (spec.advance === "returned") {
      if (gates[0]) {
        await decideApproval({
          approvalId: gates[0].id,
          organisationId: org.id,
          decision: "returned",
          rationale: "Retention period needs a source in the corporate schedule.",
          callerRoles: rolesOf(analyst),
          actor: actorOf(analyst),
        });
      }
      continue;
    }

    for (const gate of gates) {
      const decider =
        gate.requiredRole === "privacy_analyst" ? analyst
        : gate.requiredRole === "privacy_admin" ? dpo
        : gate.requiredRole === "ai_governance" ? aiLead
        : spec.entity === "BBC Studios" ? studiosApprover : psApprover;
      await decideApproval({
        approvalId: gate.id,
        organisationId: org.id,
        decision: "approved",
        rationale: "Reviewed against the template and the supporting evidence.",
        callerRoles: rolesOf(decider),
        actor: actorOf(decider),
      });
    }
  }
  console.log(`Created ${created} assessments.`);

  let riskCount = 0;
  for (const r of RISKS) {
    const entityId = entityByName.get(r.entity);
    if (!entityId) continue;
    const risk = await createRisk({
      organisationId: org.id,
      entityId,
      title: r.title,
      description: r.description,
      likelihood: r.l,
      impact: r.i,
      ownerId: analyst.id,
      actor: actorOf(dpo),
    });
    riskCount += 1;

    if (r.mitigation) {
      await addMitigation({
        riskId: risk.id,
        organisationId: org.id,
        description: r.mitigation,
        ownerId: analyst.id,
        dueAt: new Date(Date.now() + 45 * 24 * 3600 * 1000),
        actor: actorOf(dpo),
      });
    }
    if (r.residual) {
      await setResidual({
        riskId: risk.id,
        organisationId: org.id,
        likelihood: r.residual[0],
        impact: r.residual[1],
        actor: actorOf(dpo),
      });
    }
    if (r.accept) {
      const approver = r.entity === "BBC Studios" ? studiosApprover : psApprover;
      if (r.lapsed) {
        // A decision taken months ago whose end date has passed. Inserted
        // directly because the service — correctly — refuses to record an
        // acceptance that has already expired.
        await db.execute(sql`
          insert into risk_acceptance
            (risk_id, accepted_by_user_id, accepted_by_label, rationale,
             residual_score_at_acceptance, residual_tier_at_acceptance, expires_at, created_at)
          values (${risk.id}, ${approver.id}, ${approver.email}, ${r.accept.rationale},
                  ${r.residual![0] * r.residual![1]}, 'low',
                  now() - interval '3 days', now() - interval '190 days')
        `);
        await db.execute(sql`update risk set status = 'accepted' where id = ${risk.id}`);
      } else {
        await acceptRisk({
          riskId: risk.id,
          organisationId: org.id,
          rationale: r.accept.rationale,
          expiresAt: new Date(Date.now() + r.accept.days * 24 * 3600 * 1000),
          actor: actorOf(approver),
        });
      }
    }
  }
  console.log(`Created ${riskCount} risks.`);

  // Make some approval tasks late, so the service-level view has something to say.
  await db.execute(sql`
    update task set due_at = now() - interval '4 days'
    where organisation_id = ${org.id} and status = 'open'
      and id in (select id from task where organisation_id = ${org.id} and status = 'open' limit 3)
  `);
  console.log("Backdated 3 open tasks so the service-level view is exercised.");

  await pg.end();
}

main().catch(async (err) => {
  console.error(err);
  await pg.end();
  process.exit(1);
});
