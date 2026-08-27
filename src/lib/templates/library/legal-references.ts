/**
 * The reference library shown beside questions.
 *
 * `reviewedAt` is not decoration: guidance moves, and a citation nobody has
 * checked in two years is a liability in an assessment a regulator may read.
 * The review date is what makes staleness visible.
 */
export const LEGAL_REFERENCES = [
  { code: "ukgdpr.art5", regime: "UK GDPR", citation: "Article 5", title: "Principles relating to processing of personal data", jurisdiction: "UK" },
  { code: "ukgdpr.art6", regime: "UK GDPR", citation: "Article 6", title: "Lawfulness of processing", jurisdiction: "UK" },
  { code: "ukgdpr.art9", regime: "UK GDPR", citation: "Article 9", title: "Processing of special categories of personal data", jurisdiction: "UK" },
  { code: "ukgdpr.art22", regime: "UK GDPR", citation: "Article 22", title: "Automated individual decision-making, including profiling", jurisdiction: "UK" },
  { code: "ukgdpr.art25", regime: "UK GDPR", citation: "Article 25", title: "Data protection by design and by default", jurisdiction: "UK" },
  { code: "ukgdpr.art30", regime: "UK GDPR", citation: "Article 30", title: "Records of processing activities", jurisdiction: "UK" },
  { code: "ukgdpr.art32", regime: "UK GDPR", citation: "Article 32", title: "Security of processing", jurisdiction: "UK" },
  { code: "ukgdpr.art35", regime: "UK GDPR", citation: "Article 35", title: "Data protection impact assessment", jurisdiction: "UK" },
  { code: "ukgdpr.art35.7", regime: "UK GDPR", citation: "Article 35(7)", title: "Minimum content of a DPIA", jurisdiction: "UK" },
  { code: "ukgdpr.art36", regime: "UK GDPR", citation: "Article 36", title: "Prior consultation with the supervisory authority", jurisdiction: "UK" },
  { code: "ukgdpr.art44", regime: "UK GDPR", citation: "Article 44", title: "General principle for transfers", jurisdiction: "UK" },
  { code: "ukgdpr.art45", regime: "UK GDPR", citation: "Article 45", title: "Transfers on the basis of an adequacy decision", jurisdiction: "UK" },
  { code: "ukgdpr.art46", regime: "UK GDPR", citation: "Article 46", title: "Transfers subject to appropriate safeguards", jurisdiction: "UK" },
  { code: "ukgdpr.art49", regime: "UK GDPR", citation: "Article 49", title: "Derogations for specific situations", jurisdiction: "UK" },
  { code: "ico.dpia", regime: "ICO guidance", citation: "Data protection impact assessments", title: "ICO guidance on when and how to carry out a DPIA", jurisdiction: "UK" },
  { code: "ico.tra", regime: "ICO guidance", citation: "Transfer risk assessment tool", title: "ICO TRA tool and guidance on international transfers", jurisdiction: "UK" },
  { code: "ico.idta", regime: "ICO guidance", citation: "IDTA and Addendum", title: "International Data Transfer Agreement and UK Addendum", jurisdiction: "UK" },
  { code: "eugdpr.art46", regime: "EU GDPR", citation: "Article 46", title: "Transfers subject to appropriate safeguards", jurisdiction: "EU" },
  { code: "edpb.rec01-2020", regime: "EDPB", citation: "Recommendations 01/2020", title: "Supplementary measures to ensure compliance with the EU level of protection", jurisdiction: "EU" },
  { code: "cjeu.schrems2", regime: "CJEU", citation: "C-311/18 (Schrems II)", title: "Assessment of the law and practice of the destination country", jurisdiction: "EU" },
  { code: "euaiact.art6", regime: "EU AI Act", citation: "Article 6", title: "Classification rules for high-risk AI systems", jurisdiction: "EU" },
  { code: "euaiact.art9", regime: "EU AI Act", citation: "Article 9", title: "Risk management system", jurisdiction: "EU" },
  { code: "euaiact.art10", regime: "EU AI Act", citation: "Article 10", title: "Data and data governance", jurisdiction: "EU" },
  { code: "euaiact.art14", regime: "EU AI Act", citation: "Article 14", title: "Human oversight", jurisdiction: "EU" },
  { code: "euaiact.art50", regime: "EU AI Act", citation: "Article 50", title: "Transparency obligations for certain AI systems", jurisdiction: "EU" },
  { code: "iso42001", regime: "ISO/IEC 42001", citation: "ISO/IEC 42001:2023", title: "Artificial intelligence management system", jurisdiction: "International" },
] as const;
