import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, consentScans, entities, evidence, organisations } from "@/db/schema";
import {
  analyserSettings,
  checkPropertyScan,
  finishRunningScans,
  setAnalyserSettings,
  startPropertyScan,
  type ScanOptions,
} from "@/services/consent-analyser";
import { createProperty, loadProperty } from "@/services/storage-inventory";
import { sweepOrganisation } from "@/services/sweep";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "analyser test" };
const TOKEN = `wvn_${"a1".repeat(16)}`;
const BASE = "https://analyser.test";

after(() => pg.end());

const report = () => JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/consent-analyser-2.0.json"), "utf8"));

/**
 * A stand-in for the Consent Analyser. Each run is "running" until `finish`
 * is called; every request is recorded so tests can see what was sent.
 */
function fakeAnalyser(behaviour: { ukProbe?: boolean; credits?: boolean; badToken?: boolean } = {}) {
  const runs = new Map<string, { done: boolean; failed: boolean }>();
  const calls: Array<{ method: string; path: string; auth: string | null; body: string | null }> = [];
  let next = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const auth = headers.get("authorization");
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ method: init?.method ?? "GET", path: url.pathname, auth, body });
    const json = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (behaviour.badToken || auth !== `Bearer ${TOKEN}`) return json(401, { detail: "Invalid or revoked API token." });
    if (url.pathname === "/analyse/url") {
      const form = new URLSearchParams(body ?? "");
      if (form.get("region") === "uk" && !behaviour.ukProbe) {
        return json(400, { detail: "UK region scanning is not configured on this instance. Please select EU, or contact the administrator." });
      }
      if (behaviour.credits === false) return json(402, { detail: "No scan credits left for owner@example.com. Buy more at /billing." });
      const id = `run${String(++next).padStart(5, "0")}`;
      runs.set(id, { done: false, failed: false });
      return new Response(null, { status: 303, headers: { location: `/runs/${id}/progress` } });
    }
    const status = url.pathname.match(/^\/runs\/([^/]+)\/status$/);
    if (status) {
      const run = runs.get(status[1]);
      return json(200, run ? { done: run.done, failed: run.failed, step: run.done ? null : "Session B" } : { done: true, failed: true });
    }
    const rep = url.pathname.match(/^\/runs\/([^/]+)\/report\.json$/);
    if (rep && runs.get(rep[1])?.done) return json(200, { ...report(), run_id: rep[1] });
    return json(404, { detail: "Run not found." });
  }) as typeof fetch;
  const options: ScanOptions = { fetchImpl, resolve: async () => ["93.184.216.34"] };
  return {
    options,
    calls,
    finish: (failed = false) => runs.forEach((r) => Object.assign(r, { done: true, failed })),
  };
}

async function world(label: string, analyser = fakeAnalyser()) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Scan ${label}`, slug: `scan-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const property = await createProperty({
    organisationId: org.id, entityId: entity.id, name: "Main website", url: "https://www.example.co.uk", actor: SYSTEM,
  });
  return { org, entity, property, analyser };
}

const configure = (w: Awaited<ReturnType<typeof world>>) =>
  setAnalyserSettings({ organisationId: w.org.id, url: BASE, token: TOKEN, actor: SYSTEM }, w.analyser.options);

describe("the analyser settings", () => {
  it("checks the token with the analyser, seals it, and shows only its last four characters", async () => {
    const w = await world("settings");
    await assert.rejects(setAnalyserSettings({ organisationId: w.org.id, url: BASE, token: "not-a-token", actor: SYSTEM }, w.analyser.options), /wvn_/);
    await assert.rejects(setAnalyserSettings({ organisationId: w.org.id, url: "http://analyser.test", token: TOKEN, actor: SYSTEM }, w.analyser.options), /https/);
    await assert.rejects(
      setAnalyserSettings({ organisationId: w.org.id, url: BASE, token: TOKEN, actor: SYSTEM }, { ...w.analyser.options, resolve: async () => ["10.0.0.5"] }),
      /private network/,
    );
    const bad = fakeAnalyser({ badToken: true });
    await assert.rejects(setAnalyserSettings({ organisationId: w.org.id, url: BASE, token: TOKEN, actor: SYSTEM }, bad.options), /rejected the API token/);

    await configure(w);
    assert.deepEqual(await analyserSettings(w.org.id), { url: BASE, configured: true, hint: TOKEN.slice(-4) });
    const [row] = await db.select().from(organisations).where(eq(organisations.id, w.org.id));
    assert.ok(row.consentAnalyserTokenCiphertext && !JSON.stringify(row).includes(TOKEN), "the token is stored sealed");
    const audit = JSON.stringify(await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id)));
    assert.ok(!audit.includes(TOKEN) && audit.includes(`…${TOKEN.slice(-4)}`));

    await setAnalyserSettings({ organisationId: w.org.id, url: BASE, token: null, actor: SYSTEM }, w.analyser.options);
    assert.equal((await analyserSettings(w.org.id)).configured, false);
  });
});

describe("scanning from Govern", () => {
  it("needs a token, and scans websites only", async () => {
    const w = await world("needs");
    await assert.rejects(startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options), /No Consent Analyser token/);
    await configure(w);
    const app = await createProperty({ organisationId: w.org.id, entityId: w.entity.id, name: "App", url: "uk.co.example", kind: "app", actor: SYSTEM });
    await assert.rejects(startPropertyScan({ propertyId: app.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options), /scans websites/);
  });

  it("will not send the analyser a website that resolves inside a private network", async () => {
    const w = await world("private");
    await configure(w);
    await assert.rejects(
      startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, { ...w.analyser.options, resolve: async () => ["192.168.1.10"] }),
      /cannot be scanned/,
    );
    assert.equal(w.analyser.calls.filter((c) => c.path === "/analyse/url").length, 0);
  });

  it("starts a run with the token, falls back to the EU, and refuses a second while it runs", async () => {
    const w = await world("start");
    await configure(w);
    const scan = await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    assert.equal(scan.status, "running");
    assert.equal(scan.region, "eu");
    assert.match(scan.note ?? "", /no UK probe/);
    const kickoffs = w.analyser.calls.filter((c) => c.path === "/analyse/url");
    assert.deepEqual(kickoffs.map((c) => new URLSearchParams(c.body!).get("region")), ["uk", "eu"]);
    assert.equal(new URLSearchParams(kickoffs[1].body!).get("url"), "https://www.example.co.uk");
    assert.ok(w.analyser.calls.every((c) => c.auth === `Bearer ${TOKEN}`));
    await assert.rejects(startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options), /already running/);
  });

  it("uses the UK probe where the analyser has one, and says plainly when credits run out", async () => {
    const uk = await world("uk", fakeAnalyser({ ukProbe: true }));
    await configure(uk);
    assert.equal((await startPropertyScan({ propertyId: uk.property.id, organisationId: uk.org.id, actor: SYSTEM }, uk.analyser.options)).region, "uk");

    const broke = await world("broke", fakeAnalyser({ ukProbe: true, credits: false }));
    await configure(broke);
    await assert.rejects(
      startPropertyScan({ propertyId: broke.property.id, organisationId: broke.org.id, actor: SYSTEM }, broke.analyser.options),
      /No scan credits left.*owns the API token/,
    );
  });

  it("follows the run, then takes the report in exactly once", async () => {
    const w = await world("follow");
    await configure(w);
    const scan = await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    assert.deepEqual(await checkPropertyScan({ scanId: scan.id, organisationId: w.org.id }, w.analyser.options), { state: "running", step: "Session B" });

    w.analyser.finish();
    const [a, b] = await Promise.all([
      checkPropertyScan({ scanId: scan.id, organisationId: w.org.id }, w.analyser.options),
      checkPropertyScan({ scanId: scan.id, organisationId: w.org.id }, w.analyser.options),
    ]);
    const done = [a, b].find((p) => p.state === "done");
    assert.ok(done && done.state === "done" && done.proposedNew === 5, JSON.stringify([a, b]));

    const [row] = await db.select().from(consentScans).where(eq(consentScans.id, scan.id));
    assert.deepEqual([row.status, row.source, row.region, row.analyserRunId], ["done", "api", "eu", scan.analyserRunId]);
    const ev = await db.select().from(evidence).where(eq(evidence.organisationId, w.org.id));
    assert.equal(ev.length, 1, "taken in once, however many asked");
    assert.equal((await loadProperty(w.property.id, w.org.id))!.proposals.length, 5);
    assert.deepEqual(await checkPropertyScan({ scanId: scan.id, organisationId: w.org.id }, w.analyser.options), { state: "done", proposedNew: 0, proposedNotSeen: 0, findings: 0 });
  });

  it("records a failed run, a revoked token and a run that never finishes", async () => {
    const w = await world("fail");
    await configure(w);
    const first = await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    w.analyser.finish(true);
    const failed = await checkPropertyScan({ scanId: first.id, organisationId: w.org.id }, w.analyser.options);
    assert.deepEqual(failed, { state: "failed", reason: "The analyser reported that the scan failed." });

    const second = await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    const revoked = await checkPropertyScan({ scanId: second.id, organisationId: w.org.id }, fakeAnalyser({ badToken: true }).options);
    assert.equal(revoked.state, "failed");
    assert.match((revoked as { reason: string }).reason, /rejected the API token/);

    const third = await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    await db.update(consentScans).set({ startedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(consentScans.id, third.id));
    assert.match((await checkPropertyScan({ scanId: third.id, organisationId: w.org.id }, w.analyser.options) as { reason: string }).reason, /fifteen minutes/);

    const actions = (await db.select().from(auditEvents).where(and(eq(auditEvents.organisationId, w.org.id), eq(auditEvents.action, "pecr.scan_failed")))).length;
    assert.equal(actions, 3);
  });

  it("is finished by the sweep when nobody waits for it", async () => {
    const w = await world("sweep");
    await configure(w);
    await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    assert.equal(await finishRunningScans(w.org.id, w.analyser.options), 0, "still running");
    w.analyser.finish();
    assert.equal(await finishRunningScans(w.org.id, w.analyser.options), 1);
    // The real sweep has no fake analyser, and nothing is left running for it.
    assert.equal((await sweepOrganisation(w.org.id)).consentScansFinished, 0);
  });

  it("will not follow a scan from another website's page", async () => {
    const w = await world("wrong-page");
    await configure(w);
    const other = await createProperty({ organisationId: w.org.id, entityId: w.entity.id, name: "Other", url: "https://other.example.com", actor: SYSTEM });
    const scan = await startPropertyScan({ propertyId: w.property.id, organisationId: w.org.id, actor: SYSTEM }, w.analyser.options);
    await assert.rejects(checkPropertyScan({ scanId: scan.id, organisationId: w.org.id, propertyId: other.id }, w.analyser.options), /No such scan/);
  });
});
