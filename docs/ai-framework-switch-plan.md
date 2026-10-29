# Plan: choosing the AI governance framework (UK DSIT ↔ NIST AI RMF)

Status: Phases 0–3 built; Phase 4 proposed. Written 29 October 2026.

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

### Phase 1 — NIST reference library (built)

- `src/lib/ai-frameworks/nist-ai-rmf.ts` holds the 4 functions, 19 categories and 72
  subcategories in NIST's own words, extracted from NIST AI 100-1 Tables 1–4. It also
  holds the 7 trustworthiness characteristics, each with the MEASURE 2 subcategory
  that evaluates it.
- The reference library gains all 95 as codes `nist.airmf.govern`, `nist.airmf.govern.6`,
  `nist.airmf.measure.2.11` (regime "NIST AI RMF 1.0", jurisdiction "US", DOI link).
  They arrive with the existing `ensureLegalReferences`, the next time shipped
  templates are installed.
- `nist-playbook.json` and `nist-playbook.ts` hold the Playbook's 607 suggested actions
  and 294 documentation questions, per subcategory. They come from the Playbook PDF of
  2 August 2024. The PDF loses nested bullets, so an action ending in a colon
  introduces the ones after it. The "About" text and reading lists are left out.
- `crosswalk.ts` is Waivern's reading, since neither publisher offers a crosswalk:
  - DSIT category → characteristics and subcategories. Financial has no characteristic.
    Privacy sits under legal and regulatory.
  - Characteristic → one DSIT category, for moving back.
  - Govern's features → the subcategories they go towards: the AI register, intake,
    approval chains, board, lifecycle gates, training, suppliers, incidents and
    concerns, ATRS, EIA and DPIA.

### Phase 2 — the NIST pack (built)

- Migration 0057 adds `nist_ai_rmf` to the `ai_framework` enum. Nothing sets it yet;
  that is Phase 3.
- **The pack**, `src/lib/ai-frameworks/nist-pack.ts`:
  - **Categories:** the seven trustworthiness characteristics, plus *Financial* and
    *Legal and regulatory compliance*. Those two keep the UK values, so their risks
    stay put across a switch. Privacy has its own category here.
  - **Appetite guidance:** at the same four levels, Waivern-written for the seven,
    since NIST gives no examples. The UK wording is reused for the two kept categories.
  - **Treatments:** 34, condensed from Playbook suggested actions. Each one's `theme`
    is the subcategory it comes from.
- **Template:** "AI risk identification (NIST AI RMF)"
  (`templates/library/nist-ai-risk.ts`).
  - Sections: Map (context, categorisation and oversight, benefits and costs, third
    parties and law, impacts), then one section per characteristic, then monitoring,
    then a MANAGE 1.1 go/no-go determination.
  - Every key the register, workflows, ATRS and review sweep read keeps the DSIT
    template's options.
  - Score bands are DSIT's, scaled to the higher maximum score (158 vs 131).
  - UK legal questions (DPIA, Article 22, PSED, ATRS) stay.
- **Shipped by framework:** `SYSTEM_TEMPLATES` entries take an optional `aiFramework`.
  The DSIT and NIST identification templates are each offered only to organisations
  following their framework. Everything else goes to all.
- **Moved to Phase 3:** the NIST wording for approval-chain stages, lifecycle gates
  and training headings. These only change in wording, and only matter once an
  organisation can follow NIST.

### Phase 3 — the switch (built)

- **Page:** Settings → "AI governance framework" (`/app/admin/ai-framework`).
  - Radio buttons, then "See what would change", a preview, then "Switch to …".
  - After switching it says what changed.
  - Choosing needs `mayChooseAiFramework`: an organisation-wide owner, privacy admin
    or AI governance lead. Anyone else with `workflow.configure` sees the framework
    read-only.
- **Service:** `services/ai-framework-switch.ts`, with `previewAiFrameworkSwitch` and
  `switchAiFramework`. The switch runs in one transaction with the organisation row
  locked:
  - It sets `organisation.ai_framework`.
  - It re-files risks through `crosswalk.refileCategory`, recording a
    `risk.recategorised` audit event per risk.
  - For each new category that approved statements map into, it proposes the most
    cautious of them for an approver. It skips any category that already has an
    approved or pending statement.
  - It records `organisation.ai_framework_set`.
- **Templates:** the framework's templates are installed after the switch commits.
  Installing is idempotent, so a failure can be retried by installing missing
  templates.
- **Re-filing:** one target each way. UK *Transparency and explainability* →
  *Explainable and interpretable*. *Accountability* and *Contestability* both →
  *Accountable and transparent*, which comes back as *Accountability* on a return
  trip. Financial, Legal and the organisation's own categories stay.
- **Wording that follows the framework:**
  - each pack has `treatmentSource`, `categoriesName`, `appetiteIntro` and
    `identificationTemplate`
  - they're used by the appetite page, the risk treatment suggestions and their tag
    on a mitigation, the AI risk profile, and the template an AI system prefers
  - the training summary is now framework-neutral
  - stage names and lifecycle gates were already neutral
- **Help:** topic `ai-framework`.

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
