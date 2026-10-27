/**
 * Waivern's own operators: the people who approve new organisations.
 *
 * Named by email in PLATFORM_ADMINS, comma-separated, and nowhere in the
 * database: platform authority belongs to whoever runs the deployment, not to
 * anybody an organisation can invite. Unset means nobody — and with nobody to
 * approve them, requests for new organisations are not offered at all.
 */
export function platformAdmins(): string[] {
  return (process.env.PLATFORM_ADMINS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  return Boolean(email) && platformAdmins().includes(email!.trim().toLowerCase());
}

/** Whether anybody can be asked for a new organisation. */
export function requestsOpen(): boolean {
  return platformAdmins().length > 0;
}
