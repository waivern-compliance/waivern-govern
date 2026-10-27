/**
 * Email domains an organisation can claim, and how a claim is proved.
 *
 * A verified claim lets people sign in to the organisation that owns their
 * email domain without being invited one by one. Proof is a DNS record only the
 * domain's owner can publish; the person signing in proves their own address
 * through Google, which has verified it.
 */

/**
 * Domains anybody can have an address at. Claiming one would let a stranger
 * into the organisation by opening a free mailbox, so none can be claimed.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
  "live.co.uk", "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com",
  "mac.com", "aol.com", "aol.co.uk", "proton.me", "protonmail.com", "pm.me", "gmx.com",
  "gmx.co.uk", "mail.com", "zoho.com", "yandex.com", "btinternet.com", "sky.com",
  "virginmedia.com", "talktalk.net", "fastmail.com", "hey.com", "tutanota.com",
]);

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A domain as somebody might type it — "@Example.gov.uk", a URL, a trailing
 * dot — reduced to the bare hostname, or null if it is not one.
 */
export function normaliseDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/^@/, "").replace(/^www\./, "");
  d = d.split(/[/?#:]/)[0].replace(/\.$/, "");
  return HOSTNAME.test(d) ? d : null;
}

export type ClaimRefusal = "not_a_domain" | "public_email";

export function claimRefusal(input: string): ClaimRefusal | null {
  const d = normaliseDomain(input);
  if (!d) return "not_a_domain";
  if (PUBLIC_EMAIL_DOMAINS.has(d)) return "public_email";
  return null;
}

/** The domain of an email address, lower-cased; null if it has none. */
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? normaliseDomain(email.slice(at + 1)) : null;
}

/** Where the proof goes: its own name, so it sits beside, not inside, the domain's other TXT records. */
export function verificationRecordName(domain: string): string {
  return `_govern-verification.${domain}`;
}

export function verificationRecordValue(token: string): string {
  return `govern-verification=${token}`;
}

/** Whether any published TXT record carries the token. A record may be split into several strings. */
export function recordsProve(records: string[][], token: string): boolean {
  const wanted = verificationRecordValue(token);
  return records.some((chunks) => chunks.join("").trim() === wanted);
}

/**
 * Whether to refuse a sign-in because its provider does not vouch for the
 * email address.
 *
 * Membership is matched by email, so an address the provider has not verified
 * could sign somebody in as whoever was invited at it. Google says, per
 * sign-in, whether it has verified the address, and an unverified one is
 * refused. Other providers keep working as they did — by invitation only —
 * and are never trusted for joining by domain.
 */
export function unverifiedEmail(provider: string, profile: Record<string, unknown> | undefined): boolean {
  return provider === "google" && profile?.email_verified !== true;
}

/**
 * Whether this sign-in may join an organisation through its email domain:
 * only where the provider has verified the person controls the address.
 * Microsoft Entra ID's email claim is set by the tenant, not proved by the
 * mailbox, so it is not enough.
 */
export function mayJoinByDomain(provider: string, profile: Record<string, unknown> | undefined): boolean {
  return provider === "google" && profile?.email_verified === true;
}

/**
 * Whether somebody who belongs nowhere may sign in to ask for an organisation:
 * a Google-verified address, or local development sign-in — which exists only
 * where ALLOW_DEV_SIGN_IN is set, and the production build refuses that.
 */
export function mayRequestOrganisation(provider: string, profile: Record<string, unknown> | undefined): boolean {
  return mayJoinByDomain(provider, profile) || provider === "credentials";
}
