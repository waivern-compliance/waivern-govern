import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can, mayManageEntities } from "@/lib/rbac";
import { PRODUCT_NAME } from "@/lib/product";
import { getActiveSession } from "@/lib/session";
import { organisationDetail } from "@/services/access";
import { SCALES, type RiskScaleId } from "@/lib/risk/scale";
import { riskCount, riskScaleOf } from "@/services/risk-policy";
import { RenameForm } from "./RenameForm";
import { ScaleForm } from "./ScaleForm";
import { DomainsPanel } from "./DomainsPanel";
import { EntitiesPanel } from "./EntitiesPanel";
import { domainsFor } from "@/services/domains";
import { dpoPosition, entitiesOf } from "@/services/entities";
import { DpoPanel } from "./DpoPanel";
import { and, asc, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { memberships, users } from "@/db/schema";

export default async function OrganisationPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "org.manage")) {
    return (
      <NotPermitted
        what="Organisation settings"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = await organisationDetail(active.membership.organisationId);
  if (!org) redirect("/app");

  const [legalEntities, scale, risksHeld, domains, dpo, members] = await Promise.all([
    entitiesOf(org.id),
    riskScaleOf(org.id),
    riskCount(org.id),
    domainsFor(org.id),
    dpoPosition(org.id),
    scoped(org.id, () => db
      .select({ id: users.id, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organisationId, org.id), eq(memberships.isActive, true)))
      .orderBy(asc(users.email))),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/admin" className="text-xs text-ink-soft hover:text-brand">
          ← Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Organisation</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          How this organisation is named wherever {PRODUCT_NAME} refers to it.
        </p>
      </header>

      <HelpLink topic="organisation" />

      <RenameForm current={org.name} />

      <EntitiesPanel
        mayManage={mayManageEntities(active.membership.grants)}
        entities={legalEntities.map((e) => ({
          id: e.id,
          name: e.name,
          legalEntityRef: e.legalEntityRef,
          isDefault: e.isDefault,
          publicCommsProvider: e.publicCommsProvider,
          publicAuthority: e.publicAuthority,
        }))}
      />

      <DpoPanel
        mayManage={mayManageEntities(active.membership.grants)}
        position={dpo}
        members={members}
      />

      <ScaleForm
        current={scale}
        riskCount={risksHeld}
        scales={(Object.keys(SCALES) as RiskScaleId[]).map((id) => ({
          id,
          name: SCALES[id].name,
          description: SCALES[id].description,
          likelihood: SCALES[id].likelihood.map((p) => `${p.value} ${p.label}`),
          impact: SCALES[id].impact.map((p) => `${p.value} ${p.label}`),
        }))}
      />

      <DomainsPanel
        claims={domains.map((d) => ({
          id: d.id,
          domain: d.domain,
          verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString().slice(0, 10) : null,
          recordName: d.recordName,
          recordValue: d.recordValue,
        }))}
      />

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">What is not changed here</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          The short reference <code className="font-mono text-xs">{org.slug}</code>{" "}
          stays as it is. Scripts and anything an administrator has written down
          use it, and a display name should not break either. Renaming is
          recorded in the audit log, so an export taken under the old name is
          still explicable.
        </p>
      </section>

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">A separate organisation</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Legal entities share this organisation&rsquo;s people, templates, workflows and
          registers. A body that needs its own — its own account, kept apart from this one — is a
          separate organisation. Those are not made here: whoever will own it signs in and asks,
          and Waivern approves the request.
        </p>
      </section>
    </main>
  );
}
