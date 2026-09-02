import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { PRODUCT_NAME } from "@/lib/product";
import { getActiveSession } from "@/lib/session";
import { organisationDetail } from "@/services/access";
import { RenameForm } from "./RenameForm";

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

  const legalEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.organisationId, org.id));

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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Legal entities ({legalEntities.length})
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {legalEntities.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 text-sm">
              <span className="font-medium">{e.name}</span>
              <span className="font-mono text-[11px] text-ink-soft">
                {e.legalEntityRef ?? "no reference"}
                {e.isDefault ? " · default" : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="max-w-prose text-xs text-ink-soft">
          Entities scope access and reporting. Adding or renaming one is not yet
          possible here — it is done at seeding.
        </p>
      </section>
    </main>
  );
}
