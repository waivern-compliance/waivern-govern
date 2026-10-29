import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { exportNistProfile } from "@/services/ai-profile";

export const dynamic = "force-dynamic";

/** The NIST AI RMF profile as a spreadsheet, for a board pack or the Portal. */
export async function GET() {
  const active = await getActiveSession();
  if (!active) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(active.membership.grants, "record.read")) {
    return NextResponse.json({ error: "Not part of your access" }, { status: 403 });
  }

  const exported = await exportNistProfile({
    organisationId: active.membership.organisationId,
    organisationName: active.membership.organisationName,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  return new NextResponse(exported.body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exported.filename}"`,
      "cache-control": "no-store",
    },
  });
}
