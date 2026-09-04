import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Retrieve a page the platform was pointed at by a document.
 *
 * The important thing about this function is whose idea the URL was. A
 * sub-processor list lives on the supplier's website, and the link to it comes
 * out of the supplier's own agreement — which is to say, out of a file
 * somebody else wrote. Fetching it is the platform making a request chosen by
 * a third party, from inside the customer's network.
 *
 * So: no private address space, no redirect off the safe path, a hard cap on
 * size and time, no credentials, and no cookies. A person still has to ask for
 * each fetch; nothing here runs on its own.
 */

export type Fetched = {
  url: string;
  status: number;
  contentType: string;
  body: string;
  sha256: string;
  fetchedAt: Date;
};

export class FetchRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchRefused";
  }
}

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export async function fetchPage(
  raw: string,
  options: { resolve?: (host: string) => Promise<string[]> } = {},
): Promise<Fetched> {
  let url = await vetted(raw, options.resolve);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let hop = 0; ; hop += 1) {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          // Said plainly, so a supplier seeing this in their logs knows what it is.
          "user-agent": "WaivernGovernanceTool/1.0 (+document sub-processor check)",
          accept: "text/html, text/plain;q=0.9, */*;q=0.1",
        },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) throw new FetchRefused("That address redirected too many times.");
        // Every hop is vetted again. A public URL redirecting inward is the
        // usual way this class of check gets walked past.
        url = await vetted(new URL(location, url).toString(), options.resolve);
        continue;
      }

      if (!response.ok) {
        throw new FetchRefused(`That address answered ${response.status}.`);
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
      if (contentType && !/^text\/|^application\/(xhtml\+xml|xml)$/.test(contentType)) {
        throw new FetchRefused(
          `That address returned ${contentType}, not a web page. If the list is a PDF, ` +
            `download it and attach it to the agreement instead.`,
        );
      }

      const body = await readCapped(response);
      return {
        url,
        status: response.status,
        contentType: contentType || "text/html",
        body,
        sha256: createHash("sha256").update(body).digest("hex"),
        fetchedAt: new Date(),
      };
    }
  } catch (error) {
    if (error instanceof FetchRefused) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FetchRefused("That address did not answer in time.");
    }
    throw new FetchRefused("That address could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new FetchRefused("That page is too large to read.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The address, if it is one we are willing to open.
 *
 * Rejecting private address space is what stops a link in a supplier's PDF
 * from being used to reach the customer's own internal services — a metadata
 * endpoint, an admin panel, a database on the same network. The platform can
 * reach those; the person reading the PDF cannot.
 */
export async function vetted(
  raw: string,
  resolve: (host: string) => Promise<string[]> = defaultResolve,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefused("That is not a valid web address.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new FetchRefused("Only http and https addresses can be opened.");
  }
  if (url.username || url.password) {
    throw new FetchRefused("That address carries credentials, which will not be sent.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (addresses.length === 0) throw new FetchRefused("That address could not be resolved.");
  for (const address of addresses) {
    if (isPrivate(address)) {
      throw new FetchRefused(
        "That address points inside a private network, so it will not be opened.",
      );
    }
  }
  return url.toString();
}

async function defaultResolve(host: string): Promise<string[]> {
  try {
    const found = await lookup(host, { all: true });
    return found.map((f) => f.address);
  } catch {
    throw new FetchRefused("That address could not be resolved.");
  }
}

/**
 * Is this address one the public internet cannot reach?
 *
 * Note the gap this cannot close: the name is resolved here and resolved again
 * by fetch, so a name that answers with a public address now and a private one
 * a moment later would slip past. Closing that needs the connection pinned to
 * the address checked, which Node's fetch does not expose. It is recorded here
 * rather than left for somebody to assume was handled.
 */
export function isPrivate(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // Link-local, including the cloud metadata address at 169.254.169.254.
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (kind === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (/^f[cd]/.test(lower)) return true; // unique local
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("ff")) return true; // multicast
    // IPv4 written as IPv6, which would otherwise walk straight past the above.
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivate(mapped[1]);
    return false;
  }
  return true;
}
