import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { SERIOUS_SHARING_GAPS, sharingAgreementGaps, uncoveredControllers } from "@/lib/dpa2018/sharing";
import { createActivity, loadActivity, listActivities, updateActivity } from "@/services/ropa";
import {
  SharingRefused,
  addSharingParty,
  agreementsFor,
  createSharingAgreement,
  endSharingAgreement,
  loadSharingAgreement,
  recordSharingReview,
  sharingRegister,
  updateSharingAgreement,
  updateSharingParty,
} from "@/services/sharing-agreements";
import { createSupplier, loadSupplier, privacyStanding, updateSupplier } from "@/services/third-party";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "sharing test" };
const DAY = 86_400_000;

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Sharing ${label}`, slug: `sharing-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [council] = await db.insert(entities).values({ organisationId: org.id, name: "The Council", isDefault: true }).returning();
  const [other] = await db.insert(entities).values({ organisationId: org.id, name: "Council Trading Ltd" }).returning();
  const trust = await createSupplier({ organisationId: org.id, name: "Riverside NHS Trust", actor: SYSTEM });
  await updateSupplier({ supplierId: trust.id, organisationId: org.id, changes: { role: "controller" }, actor: SYSTEM });
  const payroll = await createSupplier({ organisationId: org.id, name: "Payroll Bureau", actor: SYSTEM });
  return { org, council, other, trust, payroll };
}

const CHANGES = {
  title: "Adult safeguarding information sharing",
  purpose: "Protect adults at risk of abuse or neglect",
  direction: "both",
  gatewayKind: "enactment",
  gateway: "Care Act 2014, s.45 (Safeguarding Adults Boards)",
  dataShared: "Contact details, health, social care records of adults at risk",
  lawfulBases: ["public_task"],
  schedule1Condition: "para18",
  art10Condition: null,
  ownerId: null,
  signedAt: new Date(Date.now() - 30 * DAY),
  reviewDueAt: new Date(Date.now() + 300 * DAY),
  activityIds: [] as string[],
};

describe("the rules", () => {
  const facts = {
    purpose: "p", gatewayKind: "enactment" as const, gateway: "g", dataShared: "d", lawfulBases: ["public_task" as const],
    schedule1Condition: null, art10Condition: null, ownerId: "u", signedAt: new Date(), reviewDueAt: new Date(Date.now() + DAY), endedAt: null,
  };

  it("names what an agreement does not yet show, and puts no party and an overdue review first", () => {
    assert.deepEqual(sharingAgreementGaps(facts, [{ lawfulBases: ["public_task"] }], { attachments: 1, activities: 1 }), []);
    assert.deepEqual(sharingAgreementGaps(facts, [], { attachments: 1, activities: 1 }), ["no_parties"]);
    assert.deepEqual(
      sharingAgreementGaps({ ...facts, reviewDueAt: new Date(Date.now() - DAY) }, [{ lawfulBases: [] }], { attachments: 0, activities: 0 }),
      ["party_no_basis", "review_overdue", "nothing_attached", "no_activities"],
    );
    assert.deepEqual(sharingAgreementGaps({ ...facts, gatewayKind: "not_public", gateway: null }, [{ lawfulBases: ["contract"] }], { attachments: 1, activities: 1 }), []);
    assert.ok(sharingAgreementGaps({ ...facts, gateway: null }, [{ lawfulBases: ["contract"] }], { attachments: 1, activities: 1 }).includes("no_gateway"));
    assert.deepEqual(sharingAgreementGaps({ ...facts, endedAt: new Date() }, [], { attachments: 0, activities: 0 }), [], "ended: nothing to chase");
    assert.deepEqual(SERIOUS_SHARING_GAPS, ["no_parties", "review_overdue"]);
  });

  it("finds recipients that are other controllers with no agreement for that activity", () => {
    const controllers = new Map([["riverside-nhs-trust", { id: "t", name: "Riverside NHS Trust" }]]);
    const key = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const activity = { id: "a", recipients: ["Riverside NHS Trust", "Payroll Bureau"] };
    assert.deepEqual(uncoveredControllers(activity, controllers, new Set(), key), [{ id: "t", name: "Riverside NHS Trust" }]);
    assert.deepEqual(uncoveredControllers(activity, controllers, new Set(["a:t"]), key), []);
  });
});

describe("the third-party register", () => {
  it("does not hold another controller to Article 28", async () => {
    const w = await world("role");
    const trust = (await loadSupplier(w.trust.id, w.org.id))!;
    assert.ok(!trust.gaps.includes("no_dpa"));
    assert.equal(trust.privacy, "controller");
    const payroll = (await loadSupplier(w.payroll.id, w.org.id))!;
    assert.ok(payroll.gaps.includes("no_dpa"), "a processor still is");
    await updateSupplier({ supplierId: w.trust.id, organisationId: w.org.id, changes: { role: "both" }, actor: SYSTEM });
    assert.ok((await loadSupplier(w.trust.id, w.org.id))!.gaps.includes("no_dpa"), "both: a processor too");
    assert.equal(privacyStanding([], "controller"), "controller");
    await assert.rejects(
      updateSupplier({ supplierId: w.trust.id, organisationId: w.org.id, changes: { role: "partner" as never }, actor: SYSTEM }),
      /processor, another controller, or both/,
    );
  });
});

describe("the register", () => {
  it("flags a recipient that is another controller until a current agreement covers that activity", async () => {
    const w = await world("cover");
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.council.id, name: "Adult safeguarding", actor: SYSTEM });
    await updateActivity({ activityId: activity.id, organisationId: w.org.id, changes: { recipients: ["Riverside NHS Trust", "Payroll Bureau"] }, actor: SYSTEM });
    const gaps = async () => (await loadActivity(activity.id, w.org.id))!.gaps;
    assert.ok((await gaps()).includes("controller_recipient_no_agreement"));
    assert.deepEqual((await sharingRegister(w.org.id, null)).uncovered.map((a) => a.controllers.map((c) => c.name)), [["Riverside NHS Trust"]]);

    const agreement = await createSharingAgreement({ organisationId: w.org.id, entityId: w.council.id, title: "Adults ISA", actor: SYSTEM });
    await addSharingParty({ agreementId: agreement.id, organisationId: w.org.id, supplierId: w.trust.id, actor: SYSTEM });
    assert.ok((await gaps()).includes("controller_recipient_no_agreement"), "not linked to the activity yet");
    await updateSharingAgreement({ id: agreement.id, organisationId: w.org.id, changes: { ...CHANGES, activityIds: [activity.id] }, actor: SYSTEM });
    assert.ok(!(await gaps()).includes("controller_recipient_no_agreement"));
    const listed = await listActivities(w.org.id, null);
    assert.ok(!listed.find((r) => r.activity.id === activity.id)!.gaps.includes("controller_recipient_no_agreement"));
    assert.deepEqual((await agreementsFor(w.org.id, { activityId: activity.id })).map((a) => a.id), [agreement.id]);
    assert.deepEqual((await agreementsFor(w.org.id, { supplierId: w.trust.id })).map((a) => a.id), [agreement.id]);

    await endSharingAgreement({ id: agreement.id, organisationId: w.org.id, reason: "Replaced", actor: SYSTEM });
    assert.ok((await gaps()).includes("controller_recipient_no_agreement"), "ended, it covers nothing");
  });

  it("records each party's basis, and refuses a processor as a party", async () => {
    const w = await world("parties");
    const agreement = await createSharingAgreement({ organisationId: w.org.id, entityId: w.council.id, title: "ISA", actor: SYSTEM });
    await assert.rejects(addSharingParty({ agreementId: agreement.id, organisationId: w.org.id, supplierId: w.payroll.id, actor: SYSTEM }), /recorded as a processor/);
    const party = await addSharingParty({ agreementId: agreement.id, organisationId: w.org.id, supplierId: w.trust.id, actor: SYSTEM });
    await assert.rejects(addSharingParty({ agreementId: agreement.id, organisationId: w.org.id, supplierId: w.trust.id, actor: SYSTEM }), /already a party/);
    assert.ok((await loadSharingAgreement(agreement.id, w.org.id))!.gaps.includes("party_no_basis"));
    await assert.rejects(
      updateSharingParty({ partyId: party.id, organisationId: w.org.id, basis: { lawfulBases: ["whim"], schedule1Condition: null, art10Condition: null }, note: null, actor: SYSTEM }),
      SharingRefused,
    );
    await updateSharingParty({
      partyId: party.id, organisationId: w.org.id, actor: SYSTEM, note: null,
      basis: { lawfulBases: ["public_task"], schedule1Condition: "para2", art10Condition: null },
    });
    const loaded = (await loadSharingAgreement(agreement.id, w.org.id))!;
    assert.ok(!loaded.gaps.includes("party_no_basis"));
    assert.equal(loaded.parties[0].party.schedule1Condition, "para2");
  });

  it("links only the party entity's activities, and records reviews forward", async () => {
    const w = await world("links");
    const elsewhere = await createActivity({ organisationId: w.org.id, entityId: w.other.id, name: "Trading", actor: SYSTEM });
    const agreement = await createSharingAgreement({ organisationId: w.org.id, entityId: w.council.id, title: "ISA", actor: SYSTEM });
    await assert.rejects(
      updateSharingAgreement({ id: agreement.id, organisationId: w.org.id, changes: { ...CHANGES, activityIds: [elsewhere.id] }, actor: SYSTEM }),
      /entity that is party/,
    );
    await assert.rejects(recordSharingReview({ id: agreement.id, organisationId: w.org.id, nextReviewDueAt: new Date(Date.now() - DAY), actor: SYSTEM }), /future/);
    const reviewed = await recordSharingReview({ id: agreement.id, organisationId: w.org.id, nextReviewDueAt: new Date(Date.now() + 365 * DAY), actor: SYSTEM });
    assert.ok(reviewed.lastReviewedAt);
    await endSharingAgreement({ id: agreement.id, organisationId: w.org.id, reason: "Sharing stopped", actor: SYSTEM });
    await assert.rejects(updateSharingAgreement({ id: agreement.id, organisationId: w.org.id, changes: CHANGES, actor: SYSTEM }), /ended/);
    await assert.rejects(endSharingAgreement({ id: agreement.id, organisationId: w.org.id, reason: "again", actor: SYSTEM }), /already ended/);
  });

  it("numbers agreements DSA-year-n", async () => {
    const w = await world("ref");
    const a = await createSharingAgreement({ organisationId: w.org.id, entityId: w.council.id, title: "One", actor: SYSTEM });
    const b = await createSharingAgreement({ organisationId: w.org.id, entityId: w.council.id, title: "Two", actor: SYSTEM });
    const year = new Date().getUTCFullYear();
    assert.equal(a.reference, `DSA-${year}-0001`);
    assert.equal(b.reference, `DSA-${year}-0002`);
  });
});
