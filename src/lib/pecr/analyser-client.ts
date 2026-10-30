/**
 * Talking to the Waivern Consent Analyser.
 *
 * A scan is asynchronous: start it, ask after it, fetch the report. The
 * synchronous endpoint holds the connection for minutes and is cut by proxies,
 * so it is not used. Every call carries the organisation's API token, which
 * makes the run private to the token's owner and charges their credits; since
 * the analyser's schema 2.1 release an invalid token is a 401 rather than a
 * silent anonymous run.
 *
 * Errors are worded for the person who pressed the button. Nothing here
 * touches the database.
 */

export type Transport = { fetchImpl?: typeof fetch };

export class AnalyserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyserError";
  }
}

const CALL_TIMEOUT_MS = 30_000;
/** Reports with their screenshots are a few megabytes; anything far beyond that is not a report. */
const MAX_REPORT_BYTES = 40_000_000;

export const TOKEN_PATTERN = /^wvn_[0-9a-f]{32}$/;

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

async function call(transport: Transport, url: string, init: RequestInit & { token: string }): Promise<Response> {
  const { token, ...rest } = init;
  try {
    return await (transport.fetchImpl ?? fetch)(url, {
      ...rest,
      redirect: "manual",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: {
        ...(rest.headers ?? {}),
        authorization: `Bearer ${token}`,
        "user-agent": "WaivernGovernanceTool/1.0 (+consent scan)",
      },
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new AnalyserError("The Consent Analyser did not answer in time. Try again in a few minutes.");
    }
    throw new AnalyserError("The Consent Analyser could not be reached. Check its address in the settings.");
  }
}

async function detail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

async function refusal(response: Response): Promise<AnalyserError> {
  if (response.status === 401) {
    return new AnalyserError("The Consent Analyser rejected the API token. It may have been revoked: create a new one at /account/tokens on the analyser and save it in the settings.");
  }
  if (response.status === 402) {
    return new AnalyserError(`${(await detail(response)) ?? "The token's owner has no scan credits left."} Scans are charged to whoever owns the API token.`);
  }
  const said = await detail(response);
  return new AnalyserError(`The Consent Analyser answered ${response.status}${said ? `: ${said}` : "."}`);
}

/**
 * Is this token one the analyser accepts?
 *
 * Asks after a run that does not exist: a valid token gets the ordinary
 * not-done answer, an invalid one a 401. Nothing is scanned or charged.
 */
export async function checkToken(base: string, token: string, transport: Transport = {}): Promise<void> {
  const response = await call(transport, endpoint(base, "/runs/govern-check/status"), { method: "GET", token });
  if (response.status === 401) throw await refusal(response);
  if (!response.ok) throw new AnalyserError(`The Consent Analyser answered ${response.status}. Check its address in the settings.`);
}

export type Started = { runId: string; region: "uk" | "eu"; note: string | null };

/**
 * Start a scan of `url`, in UK-law terms where the analyser can probe from the
 * UK, otherwise from the EU. Returns the analyser's run id.
 */
export async function startScan(base: string, token: string, url: string, transport: Transport = {}): Promise<Started> {
  const attempt = async (region: "uk" | "eu") =>
    call(transport, endpoint(base, "/analyse/url"), {
      method: "POST",
      token,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url, mode: "gdpr", region, ai_mode: "ai" }).toString(),
    });

  let region: "uk" | "eu" = "uk";
  let note: string | null = null;
  let response = await attempt(region);
  if (response.status === 400) {
    const said = await detail(response.clone());
    if (said && /region/i.test(said)) {
      // The analyser checks the region before charging, so trying again costs nothing.
      region = "eu";
      note = "The analyser has no UK probe configured, so it scanned from the EU.";
      response = await attempt(region);
    }
  }

  const location = response.headers.get("location") ?? "";
  if (response.status === 303) {
    const match = location.match(/\/runs\/([^/]+)\/progress/);
    if (match) return { runId: match[1], region, note };
    if (/billing/.test(location)) {
      throw new AnalyserError("The Consent Analyser asked for payment: the token's owner has no scan credits left.");
    }
  }
  if (response.status === 400 && !(await detail(response.clone()))) {
    throw new AnalyserError("The Consent Analyser will not scan that address. Check the website's address is public.");
  }
  throw await refusal(response);
}

export type RunStatus = { done: boolean; failed: boolean; cancelled: boolean; step: string | null };

export async function runStatus(base: string, token: string, runId: string, transport: Transport = {}): Promise<RunStatus> {
  const response = await call(transport, endpoint(base, `/runs/${encodeURIComponent(runId)}/status`), { method: "GET", token });
  if (!response.ok) throw await refusal(response);
  const body = (await response.json()) as Record<string, unknown>;
  return {
    done: body.done === true,
    failed: body.failed === true,
    cancelled: body.cancelled === true,
    step: typeof body.step === "string" ? body.step : null,
  };
}

export async function fetchReport(base: string, token: string, runId: string, transport: Transport = {}): Promise<unknown> {
  const response = await call(transport, endpoint(base, `/runs/${encodeURIComponent(runId)}/report.json`), { method: "GET", token });
  if (response.status === 404) {
    throw new AnalyserError("The Consent Analyser has no report for that run under this token. The run may have expired, or the token changed since it started.");
  }
  if (!response.ok) throw await refusal(response);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_REPORT_BYTES) throw new AnalyserError("The report is too large to read.");
  const text = await response.text();
  if (text.length > MAX_REPORT_BYTES) throw new AnalyserError("The report is too large to read.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AnalyserError("The Consent Analyser's report was not valid JSON.");
  }
}
