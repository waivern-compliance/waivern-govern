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

export const RISK_WORDS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  unknown: "Not established",
};
