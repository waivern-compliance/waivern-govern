/**
 * Words and types for the country library, with no database behind them.
 *
 * Separate from the service on purpose. The review form is a client component,
 * and importing these from the service pulled the Postgres driver into the
 * browser bundle — which fails at build with an unresolvable `tls`. Display
 * constants belong somewhere a browser can safely reach.
 */

export type AdequacyStatus = "adequate" | "partial" | "not_adequate" | "under_review";
export type RiskLevel = "low" | "moderate" | "high" | "unknown";
export type Regime = "uk" | "eu";

export const ADEQUACY_WORDS: Record<AdequacyStatus, string> = {
  adequate: "Adequate",
  partial: "Adequate, conditionally",
  not_adequate: "No adequacy",
  under_review: "Adequacy under review",
};

/**
 * The UK side in the words the law now uses. Since 5 February 2026 a
 * destination is approved by regulations under UK GDPR Article 45A rather
 * than found adequate under Article 45, which is omitted. The stored values
 * stay as they were, so older records still read correctly; only the words
 * change. The EU side keeps the GDPR's own word, adequacy.
 */
export const UK_APPROVAL_WORDS: Record<AdequacyStatus, string> = {
  adequate: "Approved by UK regulations",
  partial: "Approved for some transfers",
  not_adequate: "Not approved",
  under_review: "Approval under review",
};

export const RISK_WORDS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  unknown: "Not established",
};
