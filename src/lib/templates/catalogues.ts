/**
 * Shared option lists for question types that are not enumerated in the
 * template itself.
 *
 * Templates say "ask for a country" or "ask which categories of personal data";
 * what the valid answers are is a platform concern, not a per-template one, so
 * a correction reaches every template at once.
 */

/** Categories only. Identities are deliberately out of scope. */
export const DATA_CATEGORIES = [
  { value: "contact_details", label: "Contact details" },
  { value: "account_identifiers", label: "Account identifiers" },
  { value: "device_identifiers", label: "Device and browser identifiers" },
  { value: "location", label: "Location data" },
  { value: "viewing_history", label: "Viewing, listening or browsing history" },
  { value: "financial", label: "Payment and financial details" },
  { value: "employment", label: "Employment and HR records" },
  { value: "contractual", label: "Contractual and contributor records" },
  { value: "correspondence", label: "Correspondence and complaints" },
  { value: "social_care", label: "Social care records and assessments of need" },
  { value: "education", label: "Education records: attainment, attendance, exclusions, special educational needs" },
  { value: "safeguarding", label: "Safeguarding concerns, referrals and child protection plans" },
  { value: "images_audio", label: "Images, audio and video of people" },
  { value: "health", label: "Health data" },
  { value: "racial_ethnic", label: "Racial or ethnic origin" },
  { value: "political", label: "Political opinions" },
  { value: "religious", label: "Religious or philosophical beliefs" },
  { value: "trade_union", label: "Trade union membership" },
  { value: "genetic_biometric", label: "Genetic or biometric data" },
  { value: "sex_life_orientation", label: "Sex life or sexual orientation" },
  { value: "criminal_offence", label: "Criminal offence data" },
  { value: "children", label: "Data about children" },
] as const;

/**
 * Categories of data subject (Article 30(1)(c)), including those public
 * services hold. The Part 3 ones are the categories section 38(3) asks a
 * competent authority to distinguish, where relevant and as far as possible.
 */
export const SUBJECT_CATEGORIES = [
  { value: "staff", label: "Staff, including former staff and applicants" },
  { value: "volunteers", label: "Volunteers and contractors" },
  { value: "customers", label: "Customers and service users" },
  { value: "patients", label: "Patients" },
  { value: "social_care_users", label: "People receiving social care, and their carers" },
  { value: "pupils", label: "Pupils and students" },
  { value: "parents_carers", label: "Parents, guardians and carers" },
  { value: "children", label: "Children" },
  { value: "residents", label: "Residents and members of the public" },
  { value: "complainants", label: "Complainants and enquirers" },
  { value: "suspects", label: "Suspects (Part 3, s.38(3))" },
  { value: "convicted", label: "People convicted of an offence (Part 3, s.38(3))" },
  { value: "victims", label: "Victims (Part 3, s.38(3))" },
  { value: "witnesses", label: "Witnesses (Part 3, s.38(3))" },
] as const;

/** Categories that engage Article 9 or the criminal-offence regime. */
export const SPECIAL_CATEGORY_VALUES = new Set([
  "health",
  "racial_ethnic",
  "political",
  "religious",
  "trade_union",
  "genetic_biometric",
  "sex_life_orientation",
  "criminal_offence",
]);

/**
 * Destinations, with the UK adequacy position as at seeding.
 *
 * This is a starting set, not the maintained country risk library — that lands
 * with its own review dates and sources, because "kept current" is an ongoing
 * editorial commitment rather than a one-off list.
 */
export const COUNTRIES = [
  { value: "GB", label: "United Kingdom", adequate: true },
  { value: "IE", label: "Ireland", adequate: true },
  { value: "FR", label: "France", adequate: true },
  { value: "DE", label: "Germany", adequate: true },
  { value: "NL", label: "Netherlands", adequate: true },
  { value: "ES", label: "Spain", adequate: true },
  { value: "IT", label: "Italy", adequate: true },
  { value: "PL", label: "Poland", adequate: true },
  { value: "NO", label: "Norway", adequate: true },
  { value: "CH", label: "Switzerland", adequate: true },
  { value: "JP", label: "Japan", adequate: true },
  { value: "KR", label: "South Korea", adequate: true },
  { value: "NZ", label: "New Zealand", adequate: true },
  { value: "CA", label: "Canada (commercial organisations)", adequate: true },
  { value: "IL", label: "Israel", adequate: true },
  { value: "AR", label: "Argentina", adequate: true },
  { value: "UY", label: "Uruguay", adequate: true },
  { value: "US", label: "United States", adequate: false },
  { value: "AU", label: "Australia", adequate: false },
  { value: "IN", label: "India", adequate: false },
  { value: "SG", label: "Singapore", adequate: false },
  { value: "BR", label: "Brazil", adequate: false },
  { value: "ZA", label: "South Africa", adequate: false },
  { value: "AE", label: "United Arab Emirates", adequate: false },
  { value: "CN", label: "China", adequate: false },
  { value: "PH", label: "Philippines", adequate: false },
  { value: "MX", label: "Mexico", adequate: false },
] as const;

export function optionsForType(type: string) {
  if (type === "data_category") return DATA_CATEGORIES.map(({ value, label }) => ({ value, label }));
  if (type === "country") return COUNTRIES.map(({ value, label }) => ({ value, label }));
  return null;
}
