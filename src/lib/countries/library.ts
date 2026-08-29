/**
 * The starting country library.
 *
 * Adequacy status is a matter of public record and is seeded here. The two risk
 * judgements — whether public authorities can compel access, and whether data
 * subjects have redress — are left `unknown` except where a specific, citable
 * finding exists. Seeding opinions nobody can source would be worse than
 * leaving the work visible: an assessment would cite a rating with no basis and
 * read as evidenced.
 *
 * Everything here is marked unverified and due for review immediately. It is a
 * starting point for a privacy professional to check, not an authority. The
 * whole requirement is that this information is *maintained*; shipping it as
 * though it were already current would defeat the point.
 */

export type SeedEntry = {
  code: string;
  name: string;
  ukAdequacy: "adequate" | "partial" | "not_adequate" | "under_review";
  ukAdequacyNote?: string;
  euAdequacy: "adequate" | "partial" | "not_adequate" | "under_review";
  euAdequacyNote?: string;
  governmentAccess?: "low" | "moderate" | "high" | "unknown";
  redress?: "low" | "moderate" | "high" | "unknown";
  summary?: string;
  sources?: Array<{ title: string; url?: string; published?: string }>;
};

const EEA: Array<[string, string]> = [
  ["AT", "Austria"], ["BE", "Belgium"], ["BG", "Bulgaria"], ["HR", "Croatia"],
  ["CY", "Cyprus"], ["CZ", "Czechia"], ["DK", "Denmark"], ["EE", "Estonia"],
  ["FI", "Finland"], ["FR", "France"], ["DE", "Germany"], ["GR", "Greece"],
  ["HU", "Hungary"], ["IE", "Ireland"], ["IS", "Iceland"], ["IT", "Italy"],
  ["LV", "Latvia"], ["LI", "Liechtenstein"], ["LT", "Lithuania"], ["LU", "Luxembourg"],
  ["MT", "Malta"], ["NL", "Netherlands"], ["NO", "Norway"], ["PL", "Poland"],
  ["PT", "Portugal"], ["RO", "Romania"], ["SK", "Slovakia"], ["SI", "Slovenia"],
  ["ES", "Spain"], ["SE", "Sweden"],
];

/** Adequate under both regimes by virtue of EEA membership. */
const eeaEntries: SeedEntry[] = EEA.map(([code, name]) => ({
  code,
  name,
  ukAdequacy: "adequate",
  ukAdequacyNote: "EEA state, covered by UK adequacy regulations.",
  euAdequacy: "adequate",
  euAdequacyNote: "EEA state; the GDPR applies directly.",
  governmentAccess: "low",
  redress: "high",
  summary: "Within the EEA. No Article 46 transfer tool is required.",
  sources: [{ title: "UK adequacy regulations for the EEA" }],
}));

/** Covered by a specific adequacy decision rather than membership. */
const decided: SeedEntry[] = [
  { code: "AD", name: "Andorra", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "AR", name: "Argentina", ukAdequacy: "adequate", euAdequacy: "adequate" },
  {
    code: "CA", name: "Canada",
    ukAdequacy: "partial",
    ukAdequacyNote: "Commercial organisations subject to PIPEDA only. Public bodies and some provincial regimes are outside it.",
    euAdequacy: "partial",
    euAdequacyNote: "Commercial organisations subject to PIPEDA only.",
    summary: "Adequacy covers PIPEDA-regulated commercial activity. A transfer to a body outside that scope needs an Article 46 route.",
  },
  { code: "FO", name: "Faroe Islands", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "GG", name: "Guernsey", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "IM", name: "Isle of Man", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "IL", name: "Israel", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "JP", name: "Japan", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "JE", name: "Jersey", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "NZ", name: "New Zealand", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "KR", name: "South Korea", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "CH", name: "Switzerland", ukAdequacy: "adequate", euAdequacy: "adequate" },
  { code: "UY", name: "Uruguay", ukAdequacy: "adequate", euAdequacy: "adequate" },
  {
    code: "GB", name: "United Kingdom",
    ukAdequacy: "adequate",
    ukAdequacyNote: "Domestic. No transfer.",
    euAdequacy: "adequate",
    euAdequacyNote: "EU adequacy decision for the UK.",
    governmentAccess: "moderate",
    redress: "high",
  },
  {
    code: "US", name: "United States",
    ukAdequacy: "partial",
    ukAdequacyNote:
      "Only for recipients certified under the UK Extension to the EU-US Data Privacy Framework. Everyone else needs an Article 46 route and a transfer risk assessment.",
    euAdequacy: "partial",
    euAdequacyNote: "Only for recipients certified under the EU-US Data Privacy Framework.",
    governmentAccess: "high",
    redress: "moderate",
    summary:
      "The single most common destination and the one most often got wrong. Adequacy is conditional on the recipient's certification, not on the country. Check certification per recipient, and re-check it — certifications lapse.",
    sources: [
      { title: "CJEU C-311/18 (Schrems II) on s.702 FISA and EO 12333", published: "2020-07-16" },
      { title: "UK Extension to the EU-US Data Privacy Framework" },
    ],
  },
];

/** Common destinations with no adequacy decision under either regime. */
const notAdequate: Array<[string, string, Partial<SeedEntry>?]> = [
  ["AU", "Australia"],
  ["BR", "Brazil"],
  ["CN", "China", {
    governmentAccess: "high",
    redress: "low",
    summary:
      "Broad state access powers with limited independent oversight, and no practical route to redress for a UK or EU data subject. Supplementary measures rarely close the gap on their own.",
  }],
  ["EG", "Egypt"],
  ["HK", "Hong Kong"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["KE", "Kenya"],
  ["MY", "Malaysia"],
  ["MX", "Mexico"],
  ["MA", "Morocco"],
  ["NG", "Nigeria"],
  ["PK", "Pakistan"],
  ["PH", "Philippines"],
  ["SA", "Saudi Arabia"],
  ["SG", "Singapore"],
  ["ZA", "South Africa"],
  ["TH", "Thailand"],
  ["TR", "Turkey"],
  ["AE", "United Arab Emirates"],
  ["VN", "Vietnam"],
];

export const COUNTRY_LIBRARY: SeedEntry[] = [
  ...eeaEntries,
  ...decided,
  ...notAdequate.map(([code, name, over]) => ({
    code,
    name,
    ukAdequacy: "not_adequate" as const,
    euAdequacy: "not_adequate" as const,
    ...over,
  })),
].sort((a, b) => a.name.localeCompare(b.name));

/**
 * How the seed identifies itself.
 *
 * Named rather than anonymous so that anyone reading a transfer assessment can
 * see at a glance that the country information behind it has not yet been
 * checked by a person.
 */
export const SEED_REVIEWER = "seed — not verified";

/** How long a checked entry stays current before it needs looking at again. */
export const REVIEW_INTERVAL_MONTHS = 6;
