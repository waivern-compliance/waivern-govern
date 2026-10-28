# Plan: choosing the AI governance framework (UK DSIT ↔ NIST AI RMF)

Status: Phase 0 built (branch `feat/ai-framework-pack`); later phases proposed. Written 29 October 2026.

## What is asked for

An owner, privacy administrator or AI governance lead chooses, with radio buttons,
which AI governance framework the organisation's AI defaults follow — today's UK
set (DSIT AI Risk Management Toolkit, the AI Playbook, PPN 02/24), or NIST AI RMF
1.0 with its Playbook — and every AI element follows that choice.

## Where Govern stands

Nothing references NIST. The UK framework is not a setting; it is the code:

| Element | Today (UK) | Where |
|---|---|---|
| AI risk categories (9) | DSIT toolkit | `src/lib/risk/categories.ts` → register, appetite, raise-risk form, AI risk profile |
| Risk identification template | DSIT toolkit Appendix 1 | `templates/library/dsit-ai-risk.ts` |
| Suggested treatments | DSIT toolkit Appendix 4 | `src/lib/risk/treatment-library.ts` |
| AI risk approval chain, board | AI Playbook | `src/lib/workflow/defaults.ts` |
| Lifecycle gates | DSIT reassessment points, Playbook testing | `src/lib/ai/lifecycle.ts` |
| Training | Playbook principle 9 | `src/lib/ai/training.ts` |
| Intake prioritisation | Playbook | `src/lib/ai/intake.ts` |
| AI supplier assessment | PPN 02/24, CCS | `templates/library/ai-supplier.ts` |

Things the plan relies on that already exist:

- **Templates of one kind can sit side by side.** The French CNIL PIA ships beside the
  UK DPIA, each with a `jurisdiction`. Assessments keep the template version they
  started on, so installing NIST templates never disturbs work in flight.
- **`risk.category` and `risk_appetite.category` are free text**, keyed on the
  category value. A NIST category is just a new value; nothing needs an enum migration.
- **The legal reference library** (`legal_reference`: code, regime, citation, title,
  url, jurisdiction, reviewedAt) can hold the 72 NIST subcategories as citable codes.
- **A precedent for an organisation-wide choice:** `organisation.risk_scale` is a
  column, not a JSON setting, because "it governs how every risk is checked and has to
  be impossible to change by accident". The framework is the same kind of choice.
- **NIST text is US government work and in the public domain**, so we can ship it.

Things that stay whichever framework is chosen: equality impact assessments
(Equality Act s.149), ATRS records (mandatory for public bodies in scope) and the
privacy templates. They are law or mandates, not a choice of framework.

## Decisions for you before building

1. **Either/or, or primary-plus-crosswalk?** I recommend that the radio buttons
   set the *primary* framework, and that every AI record also shows the other
   framework's references through the crosswalk. UK public bodies are increasingly
   asked to show alignment with more than one framework, and the crosswalk is
   needed anyway to re-file existing risks.
2. **NIST's categories.** NIST's seven trustworthiness characteristics are not a
   full risk taxonomy. Financial risk and legal/regulatory risk have no home in
   them. I recommend the seven characteristics plus *Financial* and *Legal and
   regulatory compliance*, kept as organisational categories. Otherwise the
   crosswalk has to drop those risks into "uncategorised".
3. **Appetite on a switch.** Appetite statements are signed off by an approver, so a
   switch cannot create approved ones. I recommend that the switch **proposes** a
   NIST statement per category, pre-filled with the most cautious of the UK
   statements that map into it, for the approver to decide. Until those are
   approved, risks fall back to the default statement. The preview says so plainly.
4. **Who may switch.** Owner, privacy admin and AI governance lead are exactly the
   holders of `workflow.configure` on the `ai_risk` kind. I recommend gating on
   `canForKind(grants, "workflow.configure", "ai_risk")`, with no new capability.

## Phases

Each phase is one PR and is shippable alone. Phases 1–2 change nothing anyone sees
until phase 3 lets someone choose.

### Phase 0 — a framework pack, with today's behaviour as "UK" (built: no visible change)

- `src/lib/ai-frameworks/`: an `AiFrameworkPack` (`id`, `label`, `summary`, `categories`,
  `appetiteGuidance`, `treatments`), the UK pack `UK_DSIT` built from the existing
  constants, and the registry `AI_FRAMEWORKS`.
- Migration 0056: enum `ai_framework` (`uk_dsit` only for now) and the column
  `organisation.ai_framework`, defaulting to `uk_dsit`.
- `services/ai-framework.ts`: `aiFrameworkOf` and `aiFrameworkPackOf`.
- **What the organisation is offered** follows its pack: categories when a risk is
  raised, appetite scopes and guidance, treatment suggestions, and the AI risk
  profile's grouping. **What it already holds** is read across every pack: category
  labels, chosen treatments, and approved appetite statements. That way a switch
  never leaves a risk unreadable, or judged against nothing.
- The pack is narrower than first sketched. Lifecycle gates and intake
  prioritisation are Govern's own rules, and UK spend controls apply whichever
  framework is followed. Training and the approval chains keep their shape too. For
  all of these only the wording and citations change under NIST, which is Phase 2.

### Phase 1 — NIST reference library

- `legal-references.ts` gains the 4 functions, 19 categories and 72 subcategories as
  codes `nist.airmf.govern.1.1` … (regime "NIST AI RMF 1.0", jurisdiction "US", URL to
  the AIRC page). They are installed through the existing `ensureLegalReferences`.
- `src/lib/ai-frameworks/nist-playbook.ts` holds the Playbook's suggested actions and its
  transparency and documentation questions, per subcategory. These are too long for
  `legal_reference`, so they live as data that templates and treatments draw from.
  Source: the AI RMF Playbook PDF. Record its date, because NIST updates the Playbook
  online.
- `crosswalk.ts` holds DSIT category ↔ NIST characteristic, plus UK element ↔ NIST
  subcategory, for example: board stage ↔ GOVERN 2.3, training ↔ GOVERN 2.2, supplier
  ↔ GOVERN 6.1–6.2 and MANAGE 3.1–3.2, EIA ↔ MEASURE 2.11.
- Tests: subcategory counts (6/5/4/4 categories; 19/18/22/13 subcategories), and every
  crosswalk code resolves.

### Phase 2 — the NIST pack

- **Categories:** decision 2.
- **Identification template**, "AI risk assessment (NIST AI RMF)": sections following
  MAP 1–5 (context, categorisation, capabilities and costs, third-party risks, impacts)
  and MEASURE 2 (each trustworthiness characteristic). Each section cites its
  subcategory codes. Shipped beside the DSIT one, with `jurisdiction: "US"`.
- **Treatments:** drawn from MANAGE 1–4, plus the Playbook's suggested actions, in the
  same shape as `treatment-library.ts`.
- **Workflow defaults:** the same chain shape and triggers as today, because the stages
  are Govern's own. The stage labels and help cite GOVERN 2.1/2.3 instead of the
  Playbook.
- **Lifecycle:** keep the `ai_lifecycle_stage` enum. Map NIST's lifecycle (plan and
  design → collect and process data → build and use model → verify and validate →
  deploy and use → operate and monitor) onto its gates, and re-express each gate's
  conditions as MEASURE and MANAGE subcategories.
- **Training:** headings from GOVERN 2.2 and 4.1. **Intake:** MAP 1.1, 1.4, 3.1–3.2
  (purpose, benefits and costs).
- **Supplier:** the PPN 02/24 questions stay, because they are a UK procurement mandate.
  Add GOVERN 6 and MANAGE 3 sections when NIST is primary.

### Phase 3 — the switch

- A section "AI governance framework" on the Organisation page (or Templates, if you
  prefer it near workflows), with two radio buttons and a description of each.
- **Preview before confirming**, computed and not written:
  - templates to be installed, and which become the default for new AI assessments
  - default AI workflows to be replaced. Workflows the organisation has customised are
    listed and left alone.
  - risks to be re-filed, per old category → new category, using the crosswalk
  - appetite statements to be proposed for approval (decision 3)
  - assessments in flight, which are unaffected
- **Confirm:** one transaction. Set `organisation.ai_framework`, install the pack's
  templates through `installShippedTemplates`, swap uncustomised workflows, re-file
  risk categories (keeping the old value in the audit `before`), and propose the
  appetite statements. Audit event `organisation.ai_framework_set`, with the whole
  preview as `after`.
- **Switching back** is the same operation the other way round. Nothing is deleted, so
  it is lossless apart from the appetite approvals.
- Tests: the switch and switch-back round trip, customised workflows untouched, the
  appetite fallback, permissions (lead yes, analyst no, entity-confined owner per
  `canForKind`), and tenant isolation (add to the attack suite or `NOT_TENANT_SCOPED`).
- Help topic "AI governance framework", then `pnpm help:md`.

### Phase 4 — NIST profile (current vs target)

This is the biggest gap and is what NIST users will expect. Govern has no coverage
concept today.

- Tables `framework_profile` (organisation, framework, name, e.g. "Current" or "Target
  2027") and `framework_profile_item` (subcategory code, status: not started / partial /
  achieved / not applicable, owner, notes, linked records: assessments, risks, policies,
  evidence from the Portal).
- A view grouped by function and category, with gaps (target ≠ current), exportable.
  It is also a natural Integration API export for the Portal to generate an "AI RMF
  profile" document from. That keeps the split: Govern records, the Portal writes.
- It could later serve ISO 42001 Annex A the same way. That is a reason to build it
  generically, not NIST-only.

## Rough size

| Phase | Size | Risk |
|---|---|---|
| 0 | Medium: touches every AI consumer, mechanical | Behaviour drift; covered by keeping the existing tests unchanged |
| 1 | Medium: mostly data entry from the PDFs | Transcription accuracy; spot-check against source |
| 2 | Large: content design | Quality of templates; needs your review as subject expert |
| 3 | Medium | Appetite and workflow edge cases |
| 4 | Large | Scope creep; ship a read-only profile first |

Recommended order: 0 → 1 → 3 with a minimal NIST pack (categories, crosswalk,
identification template) → 2 in full → 4.
