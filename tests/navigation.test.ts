import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, tasks, users } from "@/db/schema";
import { navFor } from "@/lib/nav";
import type { Grant } from "@/lib/rbac";
import { openTasks } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

const contributor: Grant[] = [{ role: "contributor", scope: "organisation" }];
const analyst: Grant[] = [{ role: "privacy_analyst", scope: "organisation" }];
const auditor: Grant[] = [{ role: "auditor", scope: "organisation" }];

after(async () => {
  await pg.end();
});

describe("what the navigation offers", () => {
  it("offers a contributor only what they can use", () => {
    const items = navFor(contributor).map((i) => i.href);
    // Their whole job is answering assigned questions. Offering them the risk
    // register and the template library produces a menu of pages that render
    // their heading and nothing else, which reads as a broken platform.
    assert.deepEqual(items, ["/app/tasks"]);
  });

  it("offers an analyst the working surfaces", () => {
    const items = navFor(analyst).map((i) => i.href);
    assert.ok(items.includes("/app/assessments"));
    assert.ok(items.includes("/app/risks"));
    assert.ok(items.includes("/app/dashboard"));
  });

  it("offers an auditor the read-only surfaces", () => {
    const items = navFor(auditor).map((i) => i.href);
    assert.ok(items.includes("/app/dashboard"));
    assert.ok(items.includes("/app/risks"));
  });

  it("always offers tasks, whatever else somebody holds", () => {
    // A task that names you is your business whether or not you may read the
    // register it came from.
    for (const grants of [contributor, analyst, auditor, [] as Grant[]]) {
      assert.ok(
        navFor(grants).some((i) => i.href === "/app/tasks"),
        "tasks must always be reachable",
      );
    }
  });
});

describe("which tasks reach a person", () => {
  async function world(label: string) {
    const [org] = await db
      .insert(organisations)
      .values({ name: `N ${label}`, slug: `nav-${label}-${crypto.randomUUID().slice(0, 8)}` })
      .returning();
    const [ps] = await db
      .insert(entities)
      .values({ organisationId: org.id, name: "Public Service", isDefault: true })
      .returning();
    const [studios] = await db
      .insert(entities)
      .values({ organisationId: org.id, name: "Studios" })
      .returning();
    const [person] = await db
      .insert(users)
      .values({ email: `p-${crypto.randomUUID().slice(0, 8)}@example.com` })
      .returning();
    return { org, ps, studios, person };
  }

  async function raise(
    organisationId: string,
    entityId: string,
    over: Partial<typeof tasks.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(tasks)
      .values({
        organisationId,
        entityId,
        type: "answer_section",
        title: "Answer something",
        subjectType: "assessment",
        subjectId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        ...over,
      })
      .returning();
    return row;
  }

  it("reaches a contributor who was named, with no read access at all", async () => {
    const w = await world("named");
    const mine = await raise(w.org.id, w.ps.id, { assigneeUserId: w.person.id });
    await raise(w.org.id, w.ps.id, { title: "Somebody else's" });

    // entityIds is empty: a contributor holds no record.read anywhere.
    const seen = await openTasks(w.org.id, {
      entityIds: [],
      userId: w.person.id,
      grants: [{ role: "contributor", scope: "organisation" }],
    });

    assert.deepEqual(seen.map((t) => t.id), [mine.id]);
  });

  it("reaches somebody through a role they hold in that entity", async () => {
    const w = await world("byrole");
    const studios = await raise(w.org.id, w.studios.id, { assigneeRole: "approver" });
    const elsewhere = await raise(w.org.id, w.ps.id, { assigneeRole: "approver" });

    const seen = await openTasks(w.org.id, {
      entityIds: [],
      userId: w.person.id,
      grants: [{ role: "approver", scope: "entity", entityId: w.studios.id }],
    });

    // An approver on one legal entity has no standing over another's queue.
    assert.deepEqual(seen.map((t) => t.id), [studios.id]);
    assert.ok(!seen.some((t) => t.id === elsewhere.id));
  });

  it("reaches an organisation-wide role holder in every entity", async () => {
    const w = await world("orgwide");
    await raise(w.org.id, w.ps.id, { assigneeRole: "privacy_admin" });
    await raise(w.org.id, w.studios.id, { assigneeRole: "privacy_admin" });

    const seen = await openTasks(w.org.id, {
      entityIds: [],
      userId: w.person.id,
      grants: [{ role: "privacy_admin", scope: "organisation" }],
    });
    assert.equal(seen.length, 2);
  });

  it("shows nothing to somebody nothing reaches", async () => {
    const w = await world("nothing");
    await raise(w.org.id, w.ps.id, { assigneeRole: "approver" });

    const seen = await openTasks(w.org.id, {
      entityIds: [],
      userId: w.person.id,
      grants: [{ role: "contributor", scope: "organisation" }],
    });
    // Not everything — nothing. An empty reach must not widen to the whole org.
    assert.deepEqual(seen, []);
  });

  it("does not duplicate a task that reaches somebody two ways", async () => {
    const w = await world("both");
    await raise(w.org.id, w.ps.id, {
      assigneeUserId: w.person.id,
      assigneeRole: "privacy_analyst",
    });

    const seen = await openTasks(w.org.id, {
      entityIds: null,
      userId: w.person.id,
      grants: [{ role: "privacy_analyst", scope: "organisation" }],
    });
    assert.equal(seen.length, 1);
  });
});
