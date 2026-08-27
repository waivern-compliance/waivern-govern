import { auth, loadMemberships, type SessionMembership } from "@/auth";
import { can, scopedEntityIds, type Capability } from "./rbac";

export class NotAuthenticated extends Error {
  constructor() {
    super("Not signed in");
  }
}

export class NotPermitted extends Error {
  constructor(capability: Capability, entityId?: string) {
    super(
      entityId
        ? `Missing ${capability} on entity ${entityId}`
        : `Missing ${capability}`,
    );
  }
}

export type ActiveSession = {
  userId: string;
  email: string;
  name: string | null;
  membership: SessionMembership;
};

/**
 * Resolve the caller and the organisation they are acting in.
 *
 * Most people belong to exactly one organisation; Waivern staff belong to
 * several, so the organisation is chosen explicitly rather than inferred from
 * whichever membership happens to come first.
 */
export async function getActiveSession(
  organisationId?: string,
): Promise<ActiveSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Grants come from the database, not the token — see `loadMemberships`. This
  // also means a session that outlives its organisation or membership resolves
  // to null and lands back at sign-in, rather than rendering a half-broken page
  // against records it can no longer reach.
  const memberships = await loadMemberships(session.user.id);
  const membership = organisationId
    ? memberships.find((m) => m.organisationId === organisationId)
    : memberships[0];
  if (!membership) return null;

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    membership,
  };
}

export async function requireSession(organisationId?: string): Promise<ActiveSession> {
  const active = await getActiveSession(organisationId);
  if (!active) throw new NotAuthenticated();
  return active;
}

/**
 * Assert a capability before a write, naming the entity the write lands in.
 *
 * Call this with the entity of the record being changed, not the entity the
 * user is currently browsing — those differ whenever a record is reached from a
 * cross-entity list, and conflating them is how scoped access quietly leaks.
 */
export async function requireCapability(
  capability: Capability,
  opts: { organisationId?: string; entityId?: string } = {},
): Promise<ActiveSession> {
  const active = await requireSession(opts.organisationId);
  if (!can(active.membership.grants, capability, opts.entityId)) {
    throw new NotPermitted(capability, opts.entityId);
  }
  return active;
}

/** Entities this caller may exercise a capability over; `null` means all. */
export function visibleEntityIds(
  active: ActiveSession,
  capability: Capability = "record.read",
): string[] | null {
  return scopedEntityIds(active.membership.grants, capability);
}
