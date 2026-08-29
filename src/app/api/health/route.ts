import { NextResponse } from "next/server";
import { LATEST_MIGRATION, schemaState } from "@/lib/schema-state";

export const dynamic = "force-dynamic";

/**
 * Is this deployment actually able to serve?
 *
 * Point the platform's health check here rather than at the port. A Next.js
 * process binds its port and reports ready before it has spoken to the database
 * once, so "the container is up" and "the application works" are different
 * claims — and the gap between them is where a deployment sits looking online
 * while every page fails.
 *
 * Unauthenticated on purpose: a health check that needs a credential is one the
 * platform cannot use. It returns no data, only whether the schema matches.
 */
export async function GET() {
  const state = await schemaState();

  if (state.ok) {
    return NextResponse.json(
      { status: "healthy", migrations: state.applied, expects: LATEST_MIGRATION },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      status: "unhealthy",
      reason: state.reason,
      detail: state.detail,
      migrations: state.applied ?? null,
      expects: LATEST_MIGRATION,
    },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
