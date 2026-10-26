import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { exportRecord, loadRecord } from "@/services/atrs";

export const dynamic = "force-dynamic";

/** A transparency record, for DSIT's spreadsheet or for the Portal. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; recordId: string }> },
) {
  const { recordId } = await params;
  const active = await getActiveSession();
  if (!active) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const loaded = await loadRecord(recordId, active.membership.organisationId);
  if (!loaded) return NextResponse.json({ error: "No such record" }, { status: 404 });
  if (!can(active.membership.grants, "record.read", loaded.record.entityId)) {
    return NextResponse.json({ error: "Not part of your access" }, { status: 403 });
  }

  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "csv";
  const exported = await exportRecord({
    recordId,
    organisationId: active.membership.organisationId,
    format,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  if (!exported) return NextResponse.json({ error: "No such record" }, { status: 404 });

  return new NextResponse(exported.body, {
    status: 200,
    headers: {
      "content-type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exported.filename}"`,
      "cache-control": "no-store",
    },
  });
}
