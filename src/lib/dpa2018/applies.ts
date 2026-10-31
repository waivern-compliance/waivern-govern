/**
 * Which data protection law an entity is subject to.
 *
 * Part 2 of the Data Protection Act 2018 supplements the UK GDPR, so an entity
 * subject to the one is subject to the other, and to PECR and the Data (Use and
 * Access) Act 2025 amendments with them. An entity subject only to EU law — a
 * company established in an EU member State with no UK establishment and no
 * UK-targeted processing — is subject to none of them, and the questions,
 * decisions and flags that exist only because of the Act are not shown for it.
 *
 * Set per entity, because a group can have UK and EU companies. Pure.
 */

export type DataProtectionLaw = "uk" | "eu" | "uk_eu";

export const DATA_PROTECTION_LAWS: Record<DataProtectionLaw, string> = {
  uk: "UK law — the UK GDPR, the Data Protection Act 2018 and PECR",
  eu: "EU law only — the EU GDPR",
  uk_eu: "Both UK and EU law",
};

export function isDataProtectionLaw(v: unknown): v is DataProtectionLaw {
  return typeof v === "string" && v in DATA_PROTECTION_LAWS;
}

/** Whether the UK GDPR, the DPA 2018 and PECR apply to the entity. */
export function ukLawApplies(law: DataProtectionLaw | null | undefined): boolean {
  return law !== "eu";
}

/** The jurisdiction a request to the entity is handled under, where it is not stated. */
export function defaultRequestJurisdiction(law: DataProtectionLaw, organisationDefault: "uk" | "eu"): "uk" | "eu" {
  return law === "uk" ? "uk" : law === "eu" ? "eu" : organisationDefault;
}

/** Whether a request under this jurisdiction can be made to the entity at all. */
export function jurisdictionAllowed(law: DataProtectionLaw, jurisdiction: "uk" | "eu"): boolean {
  return law === "uk_eu" || law === jurisdiction;
}
