import { z } from "zod";

/**
 * The wire contract, versioned from the first release.
 *
 * Producers are separate products on separate infrastructure, so the shape has
 * to be agreed rather than shared. Every record carries the producer's own
 * identifier in `externalRef`: that is what makes a re-push an update instead
 * of a duplicate, and it is the only reason a scanner can run nightly without
 * silting up the register.
 */

const externalRef = z.string().min(1).max(200);
const shortText = z.string().min(1).max(500);
const longText = z.string().max(20_000);

/** Every batch names the entity it belongs to, or accepts the connection's default. */
const envelope = {
  /** Legal entity name or id. Omitted means the connection's default entity. */
  entity: z.string().max(200).optional(),
};

export const processingActivityIn = z.object({
  ...envelope,
  externalRef,
  name: shortText,
  description: longText.optional(),
  purposes: z.array(shortText).max(50).default([]),
  lawfulBasis: z.string().max(100).optional(),
  dataCategories: z.array(z.string().max(100)).max(100).default([]),
  subjectCategories: z.array(z.string().max(100)).max(50).default([]),
  recipients: z.array(z.string().max(200)).max(100).default([]),
  systems: z.array(z.string().max(200)).max(100).default([]),
  transfers: z
    .array(z.object({ country: z.string().max(100), mechanism: z.string().max(100).optional() }))
    .max(50)
    .default([]),
  retention: z.string().max(2000).optional(),
  controllerRole: z.enum(["controller", "processor", "joint_controller"]).optional(),
  reviewDueAt: z.iso.datetime().optional(),
});

export const vendorIn = z.object({
  externalRef: externalRef.optional(),
  name: shortText,
  description: longText.optional(),
  categories: z.array(z.string().max(100)).max(50).default([]),
});

export const dpaIn = z.object({
  externalRef: externalRef.optional(),
  /** Matched to a supplier by canonical name; created if unknown. */
  vendorName: shortText,
  title: shortText,
  documentRef: z.string().max(500).optional(),
  signedAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().optional(),
  transferMechanism: z.string().max(200).optional(),
  subProcessors: z.array(z.string().max(200)).max(200).default([]),
  terms: z.record(z.string(), z.unknown()).default({}),
});

export const evidenceIn = z.object({
  ...envelope,
  externalRef,
  kind: z.enum(["document", "scan", "attestation", "link"]),
  title: shortText,
  description: longText.optional(),
  uri: z.string().url().max(2000).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  collectedAt: z.iso.datetime().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Attach to an existing record by its reference, e.g. "DPIA-2026-0001". */
  attachTo: z.string().max(100).optional(),
});

/**
 * One observation from a scan.
 *
 * `severity` is the scanner's own rating and stays that way — it is an input to
 * a human judgement, never a governance decision. `advisory` is explicitly
 * labelled as a suggestion for the same reason.
 */
export const scanFindingIn = z.object({
  externalRef,
  category: shortText,
  severity: z.enum(["info", "low", "medium", "high"]),
  title: shortText,
  detail: longText.optional(),
  url: z.string().max(2000).optional(),
  vendor: z.string().max(200).optional(),
  cookieName: z.string().max(200).optional(),
  setBeforeConsent: z.boolean().optional(),
  thirdCountry: z.string().max(100).optional(),
  advisory: z.record(z.string(), z.unknown()).default({}),
});

export const scanBatchIn = z.object({
  ...envelope,
  /** Identifies the run, so a re-scan can be compared with the last one. */
  scanRef: shortText,
  scannedUrl: z.string().max(2000).optional(),
  scannedAt: z.iso.datetime().optional(),
  /** Attach the run's evidence to an existing record, e.g. "DPIA-2026-0001". */
  attachTo: z.string().max(100).optional(),
  summary: z.record(z.string(), z.unknown()).default({}),
  findings: z.array(scanFindingIn).max(1000),
});

/** Batches are capped so one request cannot become an unbounded transaction. */
export const MAX_BATCH = 500;

export const processingActivityBatch = z.object({
  records: z.array(processingActivityIn).min(1).max(MAX_BATCH),
});
export const vendorBatch = z.object({
  records: z.array(vendorIn).min(1).max(MAX_BATCH),
});
export const dpaBatch = z.object({ records: z.array(dpaIn).min(1).max(MAX_BATCH) });
export const evidenceBatch = z.object({
  records: z.array(evidenceIn).min(1).max(MAX_BATCH),
});

export type ProcessingActivityIn = z.infer<typeof processingActivityIn>;
export type VendorIn = z.infer<typeof vendorIn>;
export type DpaIn = z.infer<typeof dpaIn>;
export type EvidenceIn = z.infer<typeof evidenceIn>;
export type ScanBatchIn = z.infer<typeof scanBatchIn>;

export type IngestOutcome = {
  received: number;
  created: number;
  updated: number;
  skipped: Array<{ externalRef: string; reason: string }>;
};
