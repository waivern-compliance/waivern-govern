import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, roleAssignments, users } from "@/db/schema";
import type { Grant } from "@/lib/rbac";

/**
 * Only providers with credentials configured are offered, so a deployment can
 * run Entra ID alone, Google alone, or both. Multi-factor authentication is
 * delegated to the identity provider rather than reimplemented here — the
 * buyer's own conditional access policy should govern it.
 */
function providers() {
  const list = [];
  if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    list.push(
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      }),
    );
  }
  if (process.env.AUTH_GOOGLE_ID) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    );
  }

  // Local development and demonstration only: sign in as any seeded user by
  // email, with no password. Two independent conditions must both hold, and the
  // production build refuses to start if the flag is set — a dev bypass that
  // can reach production is worse than no bypass at all.
  if (process.env.ALLOW_DEV_SIGN_IN === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ALLOW_DEV_SIGN_IN must never be set in production. Remove it from the environment.",
      );
    }
    // The Credentials provider hardcodes its own id and name, so it is always
    // addressed as "credentials" and identified in the UI by its type.
    list.push(
      Credentials({
        credentials: { email: { label: "Email", type: "email" } },
        async authorize(credentials) {
          const email = String(credentials?.email ?? "").toLowerCase();
          if (!email) return null;
          const row = await db.query.users.findFirst({ where: eq(users.email, email) });
          return row ? { id: row.id, email: row.email, name: row.name } : null;
        },
      }),
    );
  }

  return list;
}

export type SessionMembership = {
  organisationId: string;
  organisationName: string;
  grants: Grant[];
};

/**
 * Resolve an authenticated identity to what it may do.
 *
 * Sign-in is not membership: a valid Entra ID token proves who someone is, not
 * that they belong to a client organisation. Someone with no active membership
 * is refused rather than admitted to an empty account.
 *
 * The result is used to decide whether sign-in may proceed. It is deliberately
 * NOT cached into the session token — see `loadMemberships`.
 */
export class IdentityLookupFailed extends Error {
  constructor(cause: unknown) {
    super("Could not check membership", { cause });
  }
}

async function loadIdentity(email: string, ssoSubject: string, name?: string | null) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
  if (!existing) return null;

  await db
    .update(users)
    .set({ ssoSubject, lastSeenAt: new Date(), name: existing.name ?? name ?? null })
    .where(eq(users.id, existing.id));

  const rows = await db.query.memberships.findMany({
    where: and(eq(memberships.userId, existing.id), eq(memberships.isActive, true)),
    with: { organisation: true, roles: true },
  });

  const orgs: SessionMembership[] = rows.map((m) => ({
    organisationId: m.organisationId,
    organisationName: m.organisation.name,
    grants: m.roles.map((r) =>
      r.scope === "entity" && r.entityId
        ? { role: r.role, scope: "entity" as const, entityId: r.entityId }
        : { role: r.role, scope: "organisation" as const },
    ),
  }));

  return orgs.length > 0 ? { userId: existing.id, organisations: orgs } : null;
}

/**
 * Load an identity's current memberships and role grants.
 *
 * Called on every authenticated request rather than cached into the session
 * token. A JWT is valid until it expires and cannot be withdrawn, so grants
 * carried inside one stay live after they are revoked — on a twelve-hour token,
 * someone stripped of `risk.accept` would keep it for the rest of the day. One
 * indexed query per request is a cheap price for revocation taking effect when
 * it is made.
 */
export async function loadMemberships(userId: string): Promise<SessionMembership[]> {
  const rows = await db.query.memberships.findMany({
    where: and(eq(memberships.userId, userId), eq(memberships.isActive, true)),
    with: { organisation: true, roles: true },
  });

  return rows.map((m) => ({
    organisationId: m.organisationId,
    organisationName: m.organisation.name,
    grants: m.roles.map((r) =>
      r.scope === "entity" && r.entityId
        ? { role: r.role, scope: "entity" as const, entityId: r.entityId }
        : { role: r.role, scope: "organisation" as const },
    ),
  }));
}

export const authConfig: NextAuthConfig = {
  providers: providers(),
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || !account) return false;

      /**
       * A failed lookup is not a refusal.
       *
       * Returning false here would tell the person their account lacks a
       * membership, when in fact nothing was ever checked — the database was
       * unreachable, or the query failed. That message sends an administrator
       * hunting through user records while the real fault is infrastructure.
       * Let it throw instead, so it surfaces as a configuration error and the
       * cause is in the log.
       */
      let identity: Awaited<ReturnType<typeof loadIdentity>>;
      try {
        identity = await loadIdentity(
          user.email,
          `${account.provider}:${account.providerAccountId}`,
          user.name,
        );
      } catch (cause) {
        console.error(
          `[auth] could not check membership for ${user.email} — this is not an ` +
            `authorisation decision, the lookup itself failed:`,
          cause,
        );
        throw new IdentityLookupFailed(cause);
      }
      if (!identity) {
        // Logged, not shown and not put in the URL. An administrator needs to
        // know which address was refused — it is often a different account from
        // the one they granted — but an email in a query string ends up in
        // browser history, referrers and access logs.
        console.warn(
          `[auth] refused sign-in: no active membership for ${user.email} (via ${account.provider})`,
        );
        return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // The token carries identity only. Authorisation is resolved per request
      // so that revoking a role takes effect immediately rather than whenever
      // the token happens to expire.
      if (user?.email && account) {
        const identity = await loadIdentity(
          user.email,
          `${account.provider}:${account.providerAccountId}`,
          user.name,
        );
        if (identity) token.userId = identity.userId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

declare module "next-auth" {
  interface Session {
    user: { id: string } & import("next-auth").DefaultSession["user"];
  }
}
