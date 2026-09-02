import { NextResponse } from "next/server";
import { sweepAll } from "@/services/sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The hourly tick.
 *
 * For a scheduler that can only make an HTTP request. A job runner that can
 * execute a command should run `pnpm sweep:prod` instead and skip the network
 * entirely.
 *
 * The check is deliberately not "is this request from a particular platform" —
 * anything reachable on the internet must assume it will be found — so an
 * unauthenticated call is refused outright, and a deployment with no secret
 * configured refuses everything rather than defaulting open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; refusing to run" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const results = await sweepAll();
  return NextResponse.json({ sweptAt: new Date().toISOString(), results });
}
