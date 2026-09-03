import { NextResponse } from "next/server";
import { PRODUCT_NAME } from "@/lib/product";
import { BOM, exportFilename, toCsv } from "@/lib/csv";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import {
  DATASET_LABEL,
  exportAiRegister,
  exportAssessments,
  exportAudit,
  exportCountries,
  exportRisks,
  exportRopa,
  exportThirdParties,
  exportTrends,
  exportBreaches,
  recordExport,
  verificationManifest,
  type Dataset,
} from "@/services/exports";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A spreadsheet, for a person who has been asked for one.
 *
 * Behind the session rather than the signed integration API, because the caller
 * is a human with a browser. Every export is scoped to what that person can
 * already see, and every export is recorded — taking the risk register out of
 * the building is an act worth knowing about, in a platform whose whole
 * argument is an unbroken record of who did what.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dataset: string }> },
) {
  const { dataset } = await params;
  const active = await getActiveSession();
  if (!active) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!(dataset in DATASET_LABEL)) {
    return NextResponse.json({ error: "No such export" }, { status: 404 });
  }
  const key = dataset as Dataset;

  const needed = key === "audit" ? "audit.export" : "record.read";
  if (!can(active.membership.grants, needed)) {
    return NextResponse.json(
      {
        error: `Exporting the ${DATASET_LABEL[key].toLowerCase()} is not part of your access`,
      },
      { status: 403 },
    );
  }

  const org = active.membership.organisationId;
  const entityIds = visibleEntityIds(active, needed);
  const actor = {
    actorKind: "user" as const,
    actorUserId: active.userId,
    actorLabel: active.email,
  };

  let body: string;
  let rows: number;
  let complete: boolean | undefined;

  if (key === "audit") {
    const result = await exportAudit(org, entityIds);
    rows = result.rows.length;
    complete = result.complete;
    // The manifest travels with the data. Tamper-evidence a recipient cannot
    // check without asking us is a claim, not evidence.
    const header = result.complete
      ? verificationManifest(active.membership.organisationName, rows)
      : `${PRODUCT_NAME} — audit log extract\n\n${result.caveat}`;
    // The mark leads the file, ahead of the commentary — it only works at byte
    // zero, and anywhere else it silently becomes part of the first column name.
    body =
      BOM +
      header
        .split("\n")
        .map((line) => `# ${line}`)
        .join("\n") +
      "\n\n" +
      toCsv(result.columns, result.rows, false);
  } else {
    const result =
      key === "risks"
        ? await exportRisks(org, entityIds)
        : key === "assessments"
          ? await exportAssessments(org, entityIds)
          : key === "ai-register"
            ? await exportAiRegister(org, entityIds)
            : key === "ropa"
              ? await exportRopa(org, entityIds)
              : key === "third-parties"
                ? await exportThirdParties(org)
                : key === "trends"
                  ? await exportTrends(org, entityIds)
                  : key === "breaches"
                    ? await exportBreaches(org, entityIds)
                    : await exportCountries(org);
    rows = result.rows.length;
    body = toCsv(result.columns, result.rows);
  }

  await recordExport({ organisationId: org, dataset: key, rows, complete, actor });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(
        key,
        active.membership.organisationName,
        new Date(),
      )}"`,
      "cache-control": "no-store",
    },
  });
}
