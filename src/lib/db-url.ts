/**
 * Reject a connection string that cannot work here, with the reason.
 *
 * Both failures below surface as something misleading — a password rejection
 * or a DNS error — which points at the database rather than at the string. The
 * remedy differs completely, so naming which one it is saves the wrong fix.
 *
 * Shared by the application and the migration script so a URL that is refused
 * in one is refused in the other.
 */

/**
 * Documentation abbreviates credentials — `postgres:AMdWY…@host` — and that
 * gets copied verbatim into a terminal.
 */
/** Anything env-shaped: `process.env`, or a plain object in a test. */
type Env = Record<string, string | undefined>;

const PLACEHOLDER = /[…]|<[^>]*>|xxx+|your[-_]?(password|db|database)/i;

/** `postgres.railway.internal` resolves only on Railway's private network. */
const PRIVATE_HOST = /@[^@/]*\.railway\.internal[:/]/i;

export function insideRailway(env: Env = process.env): boolean {
  return Boolean(
    env.RAILWAY_ENVIRONMENT_NAME ?? env.RAILWAY_SERVICE_NAME ?? env.RAILWAY_PROJECT_ID,
  );
}

/** The reason this string cannot be used, or null if it can. */
export function whyUnusable(
  connectionString: string,
  env: Env = process.env,
): string | null {
  if (PLACEHOLDER.test(connectionString)) {
    const shown = connectionString.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
    return (
      `DATABASE_URL still contains a placeholder, so it was probably copied from ` +
      `documentation rather than from the database itself.\n\n  ${shown}\n\n` +
      `An ellipsis (…) usually means a password was abbreviated for display. ` +
      `Take the full string from your database provider.`
    );
  }

  if (PRIVATE_HOST.test(connectionString) && !insideRailway(env)) {
    return (
      "DATABASE_URL points at a private Railway hostname (.railway.internal), " +
      "which only resolves inside Railway. This process is not running there.\n\n" +
      "  To run a one-off command against the deployed database:\n" +
      "    railway ssh -- pnpm <script>\n\n" +
      "  That runs inside the service, where the private address works and " +
      "DATABASE_URL is already set — so there is nothing to copy or paste."
    );
  }

  return null;
}

/** Throw unless the string can be used from here. */
export function assertUsable(
  connectionString: string,
  env: Env = process.env,
): void {
  const why = whyUnusable(connectionString, env);
  if (why) throw new Error(why);
}
