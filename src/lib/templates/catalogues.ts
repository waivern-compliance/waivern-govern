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
