/**
 * Row-level security, below the services.
 *
 * The isolation suite checks the services filter by organisation. This checks
 * what happens when a query does not: inside one organisation's scope, raw SQL
 * with no filter at all still sees and writes only that organisation's rows.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { db, sql as pg, withOrganisation } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { inviteMember } from "@/services/access";
import { addMitigation, createRisk } from "@/services/risks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "rls test" };

async function organisationWithRisk(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `RLS ${label}`, slug: `rls-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const risk = await createRisk({
    organisationId: org.id, entityId: entity.id, title: `${label}'s risk`, description: "x",
    likelihood: 2, impact: 2, actor: SYSTEM,
  });
  await addMitigation({ riskId: risk.id, organisationId: org.id, description: `${label}'s control`, actor: SYSTEM });
  return { org, entity, risk };
}

const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)) as unknown as Array<Record<string, unknown>>;

describe("row-level security", () => {
  after(() => pg.end());

  it("shows an organisation only its own rows, whatever the query forgets", async () => {
    const a = await organisationWithRisk("a");
    const b = await organisationWithRisk("b");
    await withOrganisation(a.org.id, async () => {
      const risks = await rows(sql`select id, organisation_id from risk`);
      assert.ok(risks.length > 0);
      assert.ok(risks.every((r) => r.organisation_id === a.org.id), "a risk of another organisation was visible");
      assert.ok(!risks.some((r) => r.id === b.risk.id));
      // A child reaches its organisation through its parent.
      const mitigations = await rows(sql`select m.id from mitigation m`);
      const theirs = await rows(sql`select id from mitigation where risk_id = ${b.risk.id}`);
      assert.ok(mitigations.length > 0);
      assert.equal(theirs.length, 0);
      const orgs = await rows(sql`select id from organisation`);
      assert.deepEqual(orgs.map((o) => o.id), [a.org.id]);
    });
  });

  it("will not write a row for another organisation, or change one", async () => {
    const a = await organisationWithRisk("aw");
    const b = await organisationWithRisk("bw");
    await assert.rejects(
      withOrganisation(a.org.id, () =>
        db.execute(sql`insert into entity (organisation_id, name) values (${b.org.id}, 'Planted')`),
      ),
      (e: Error & { cause?: Error }) => /row-level security/.test(`${e.message} ${e.cause?.message ?? ""}`),
    );
    const changed = await withOrganisation(a.org.id, async () =>
      rows(sql`update risk set title = 'taken' where id = ${b.risk.id} returning id`),
    );
    assert.equal(changed.length, 0);
    const [still] = await rows(sql`select title from risk where id = ${b.risk.id}`);
    assert.equal(still.title, "bw's risk");
  });

  it("shares the country library's common rows with everyone", async () => {
    const a = await organisationWithRisk("lib");
    const [shared] = await rows(sql`select count(*)::int as n from country_risk where organisation_id is null`);
    const visible = await withOrganisation(a.org.id, async () =>
      rows(sql`select count(*)::int as n from country_risk where organisation_id is null`),
    );
    assert.equal(visible[0].n, shared.n);
  });

  it("refuses to act for a second organisation inside the first's transaction", async () => {
    const a = await organisationWithRisk("na");
    const b = await organisationWithRisk("nb");
    await assert.rejects(
      withOrganisation(a.org.id, () => withOrganisation(b.org.id, async () => 1)),
      /tried to act for another/,
    );
  });

  it("runs scoped work as the restricted role, and only for its transaction", async () => {
    const a = await organisationWithRisk("role");
    const [inside] = await withOrganisation(a.org.id, () => rows(sql`select current_user as who`));
    assert.equal(inside.who, "govern_tenant");
    const [outside] = await rows(sql`select current_user as who, current_setting('app.organisation_id', true) as org`);
    assert.notEqual(outside.who, "govern_tenant");
    assert.ok(!outside.org, "the organisation outlived its transaction");
  });

  it("shows an organisation only its own people, and still lets it invite anyone", async () => {
    const a = await organisationWithRisk("pa");
    const b = await organisationWithRisk("pb");
    const theirs = await inviteMember({
      organisationId: b.org.id, email: `theirs-${crypto.randomUUID().slice(0, 6)}@example.test`,
      role: "contributor", actor: SYSTEM,
    });
    const [bPerson] = await rows(sql`select user_id from membership where id = ${theirs.membershipId}`);
    const seen = await withOrganisation(a.org.id, async () => rows(sql`select id from app_user`));
    assert.ok(!seen.some((u) => u.id === bPerson.user_id), "another organisation's person was visible");

    // Somebody already on the platform joins as the same person, not a copy.
    const [{ email }] = await rows(sql`select email from app_user where id = ${bPerson.user_id}`);
    await inviteMember({ organisationId: a.org.id, email: String(email).toUpperCase(), role: "contributor", actor: SYSTEM });
    const people = await rows(sql`select id from app_user where email = ${email}`);
    assert.equal(people.length, 1);
    const nowSeen = await withOrganisation(a.org.id, async () => rows(sql`select id from app_user where id = ${bPerson.user_id}`));
    assert.equal(nowSeen.length, 1, "a new member stayed invisible to the organisation that invited them");
  });

  it("refuses, in the database, a link to another organisation's record or person", async () => {
    const a = await organisationWithRisk("la");
    const b = await organisationWithRisk("lb");
    const [bEntity] = await rows(sql`select id from entity where organisation_id = ${b.org.id}`);
    const [aEntity] = await rows(sql`select id from entity where organisation_id = ${a.org.id}`);
    const cause = (e: Error) => `${e.message} ${(e as Error & { cause?: Error }).cause?.message ?? ""}`;
    // As the owner, outside any organisation's scope: only the constraint stands in the way.
    await assert.rejects(
      db.execute(sql`insert into risk (organisation_id, entity_id, reference, title, description, scale,
        inherent_likelihood, inherent_impact, inherent_score, inherent_tier, status)
        select organisation_id, ${bEntity.id}, 'X-1', title, description, scale,
          inherent_likelihood, inherent_impact, inherent_score, inherent_tier, status
        from risk where id = ${a.risk.id}`),
      (e: Error) => /risk_entity_id_same_org/.test(cause(e)),
    );
    const [stranger] = await rows(sql`insert into app_user (email) values (${`s-${crypto.randomUUID().slice(0, 6)}@example.test`}) returning id`);
    await assert.rejects(
      db.execute(sql`update risk set owner_id = ${stranger.id} where id = ${a.risk.id}`),
      (e: Error) => /risk_owner_id_member/.test(cause(e)),
    );
    assert.ok(aEntity.id);
  });

  it("protects every table that carries an organisation", async () => {
    const unprotected = await rows(sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and c.relname not in ('legal_reference')
      order by 1`);
    assert.deepEqual(unprotected.map((r) => r.relname), [], "tables without row-level security");
  });
});
