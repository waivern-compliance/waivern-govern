# Plan: the UK GDPR as amended by the Data (Use and Access) Act 2025

Status: decisions settled (30 October 2026); 1, 2, 5, 6 and 7 as recommended, 3 and 4 changed. Phases 0–1 built.

## What is asked for

Govern already reflects the DUAA's changes to PECR (`docs/pecr-plan.md`), to subject
access (`docs/data-subject-requests-plan.md`) and to complaints (`docs/complaints-plan.md`).
This plan covers the rest: the DUAA's changes to the UK GDPR itself, which Govern does
not yet know about. Some of them make Govern give a wrong answer today; the others are
things it cannot yet record.

UK law only. The EU GDPR templates (the EDPB transfer method, the CNIL PIA) are left as
they are.

## The law, as checked on legislation.gov.uk

The UK GDPR amendments below were made by DUAA Part 5, Chapter 1. Those checked are in
force in full from **5 February 2026** (S.I. 2026/82), some parts having commenced
earlier for limited purposes on 19 June 2025.

| Provision | What changed |
|---|---|
| Art 6(1)(ea), Annex 1 | **Recognised legitimate interests.** A new lawful basis with no balancing test, for the conditions in Annex 1: (1) disclosure on request to someone who needs it for a public task with a legal basis; (2) national security, public security or defence; (3) responding to an emergency; (5) detecting, investigating or preventing crime, or apprehending or prosecuting offenders; (6) safeguarding a vulnerable individual. Paragraphs 4, 7 and 8 define the terms. |
| Art 21(1) | The right to object now reaches processing based on point **(ea)** as well as (e) and (f) (s.70(5)). The controller may still continue on compelling legitimate grounds or for legal claims. |
| Art 8A, Annex 2 | **Further processing.** Compatibility is assessed against listed factors (link between purposes, context and relationship, nature of the data including special category, consequences, safeguards). It is **deemed compatible** where: (a) the person consents to the new, specified purpose; (b) it is research, archiving or statistics under Art 84B; (c) it ensures or demonstrates compliance with Art 5(1); (d) an **Annex 2** condition applies; or (e) it safeguards an Art 23(1)(c)–(j) objective and is authorised by law. Where consent was the original basis, only (a) or (c) apply, unless consent cannot reasonably be obtained. |
| Arts 22A–22D | **Automated decisions.** A decision is solely automated where there is no meaningful human involvement, and significant where it has a legal or similarly significant effect (22A). The blanket restriction is gone. It remains for **special category data** (allowed only with explicit consent, or where necessary for a contract or authorised by law and Art 9(2)(g) applies) and for processing relying wholly or partly on **Art 6(1)(ea)** (22B). Every significant solely automated decision needs **safeguards** (22C): tell the person about the decision, let them make representations, let them ask for human review, and let them contest it. |
| Art 46(1A), (6), (7); Arts 45A–45C | **The data protection test.** A transfer under appropriate safeguards is permitted only where the controller, **acting reasonably and proportionately**, considers that protection after transfer would **not be materially lower** than under the UK GDPR and DPA 2018. Reasonable and proportionate depends on all the circumstances, including the nature and volume of the data. The Secretary of State's approval of destinations (formerly adequacy regulations) is under Art 45A, applying the same test (45B). |
| Art 13(5)–(7) | No duty to give information about **further processing for research, archiving or statistics** under Art 84B where that is impossible or would involve disproportionate effort (judged by things like the number of people and the age of the data). The controller must take appropriate measures instead, including making the information **publicly available**. |
| Arts 84A–84D | **Research safeguards.** The Art 84B(2) safeguards are not met where the processing is likely to cause substantial damage or distress, or is for measures or decisions about a particular person (unless it is approved medical research). They must include measures for data minimisation, such as pseudonymisation (84C). |
| Art 25(1A), (1B) | **Children's higher protection matters.** A controller providing an information society service likely to be accessed by children must take them into account in choosing its technical and organisational measures: how children can best be protected and supported, and that they may be less aware of risks, consequences and rights, with needs that vary by age and development. |

Not checked on legislation.gov.uk for this draft, and to be confirmed before Phase 3:
- the wider definition of **scientific research**, said to include research carried out
  as a commercial activity;
- **consent to an area of scientific research** where the purposes cannot be fully
  identified when the data is collected ("broad consent");
- the illustrative **legitimate interests** in Art 6 (direct marketing, intra-group
  transmission for administrative purposes, network and information security). These
  still need the balancing test.

## Where Govern stands

- **Lawful basis on the ROPA** is free text (`processing_activity.lawful_basis`), with a
  hint listing the six original bases. It arrives the same way from the Portal
  (`POST /api/v1/ingest/processing-activities`, `lawfulBasis`).
- **Objections** (`lib/dsr/statutory.ts`, `objectionTest`) know only public task,
  legitimate interests and direct marketing. An objection to processing on recognised
  legitimate interests is wrongly reported as **not applying**. This is the one wrong
  answer today.
- **The LIA template** (`templates/library/lia.ts`) runs the three-part test and cites
  the EU GDPR (`eugdpr.art6.1f`, EDPB guidelines).
- **Automated decisions** are cited as `ukgdpr.art22` in the DPIA, the AI risk
  templates, the request register (`automated_decision` right) and guidance. The DPIA
  asks whether people are involved but not about the 22C safeguards, special category
  data or reliance on (ea).
- **Transfers.** `TRA_UK` frames the route as adequacy or Article 46 and follows the ICO
  TRA tool. It never asks the "not materially lower" question. The countries register
  speaks of adequacy regulations (`adequacy_status`).
- **Research and further processing**: nothing. A ROPA entry cannot say that it is
  research, that it is further processing, or on what ground it is compatible.
- **Children**: an example in the DPIA's "whose data" question only.
- **Legal references** cite `uk.duaa2025` for subject access and `uk.duaa2025.pecr`;
  there are none for the UK GDPR articles above.

## Decisions (settled 30 October 2026)

1. **How the lawful basis is recorded.** *Recommendation:* a structured list on the
   processing activity (one or more of the seven bases, now including recognised
   legitimate interests), with the Annex 1 condition when (ea) is chosen, and the
   existing text kept as a note. Existing text is matched to a basis where it is
   unambiguous and left as the note where it is not; nothing is guessed.
2. **The Portal contract.** *Recommendation:* `lawfulBasis` stays a string in Integration
   API v1 and Govern maps it as in decision 1. Add an optional `lawfulBases` array and
   `recognisedCondition` to the spec first (`docs/integration-api.md`), so the Portal can
   send structured values later without a breaking change.
3. **Where automated decisions are recorded.** *Settled (changed from the
   recommendation):* on the processing activity **or** on the AI use case, whichever
   the person is working in. Where an AI use case and a processing activity are linked
   and the automated-decision record is present on one side but not the other, Govern
   **prompts** the person to copy it across. It does not copy it silently: the two
   records can legitimately differ, and the person decides.
4. **Changing published templates.** *Settled (changed from the recommendation):* edit
   the published DPIA, LIA and UK TRA templates in place. There are no external clients
   on them yet, so there are no answered assessments whose version needs preserving.
5. **What "adequacy" is called.** *Recommendation:* keep the database values, change the
   words: "approved by UK regulations (Article 45A)" instead of "adequacy regulations" in
   the UK template and countries register, so old records still read correctly.
6. **Research as a register or a flag.** *Recommendation:* a flag and safeguards on the
   processing activity, not a separate register. Research is a purpose of processing,
   and the ROPA already holds the rest of what matters.
7. **Scope of the first version.** *Recommendation:* Phases 0–2 first (the wrong answer
   and the most-used areas), then 3–5.

## Data model

### `processing_activity` additions
- `lawful_bases`: an array of `lawful_basis` enum values (consent, contract,
  legal_obligation, vital_interests, public_task, recognised_legitimate_interests,
  legitimate_interests). The existing `lawful_basis` text becomes the note.
- `recognised_condition`: the Annex 1 paragraph, where recognised legitimate interests
  is chosen.
- `automated_decisions`: whether it makes significant decisions solely by automated
  means (yes / no / not yet known), and `adm_safeguards` (jsonb, the four 22C measures
  confirmed, with a note on each).

### `ai_use_case` additions
- The same `automated_decisions` and `adm_safeguards` fields (decision 3), so the record
  can start on either side.
- `further_processing`: whether the purpose is further processing of data collected for
  another purpose; `original_activity_id` (optional link); `compatibility_route` (consent
  | research | compliance | annex2 | article23 | assessed) and `compatibility_note`.
- `research`: whether it is research, archiving or statistics under Art 84B;
  `research_safeguards` (jsonb: no substantial damage or distress, no decisions about
  particular people, data minimisation measures); `art13_exemption` and
  `public_information_url` where Art 13(5) is relied on.
- `children_likely`: whether an information society service in it is likely to be
  accessed by children.

### `lib/gdpr/duaa.ts` (pure)
- `RECOGNISED_CONDITIONS` (Annex 1, with citations).
- `admRestriction({ specialCategory, bases, explicitConsent, contract, law })`: whether
  22B allows a solely automated significant decision, and why not.
- `compatibilityRoutes(originalBases)`: which Art 8A(3) routes are open, applying
  8A(4) where the original basis was consent.
- `processingGaps(activity)`: what the record does not yet show, most pressing first, in
  the shape the marketing and cookie registers already use.
- `admMismatch(useCase, activity)`: for a linked pair, whether one side has the
  automated-decision record and the other lacks it or disagrees, and which way the copy
  would go.

## Phases

### Phase 0: references and wording (built)
- **Legal references** for Art 6(1)(ea) and Annex 1, Art 8A and Annex 2, Art 13(5)–(7),
  Arts 22A–22D, Art 25(1A)–(1B), Arts 45A–45C, Art 46(1A) and Arts 84A–84D.
- **Fix the citations:** `ukgdpr.art22` becomes 22A–22C where they are what is meant (the
  request register's `automated_decision` right, guidance, help).
- **The ROPA hint** lists recognised legitimate interests.

Built as:
- Eighteen references, from `ukgdpr.art6.1ea` to `ukgdpr.art84d`, each checked to resolve
  on legislation.gov.uk. `ukgdpr.art22` is kept for older citations, titled as
  substituted. `ensureLegalReferences` adds new codes without retitling existing rows.
- Template questions cite 22A (solely automated, significant, meaningful human
  involvement), 22B (special category data and (ea)) or 22C (telling people, human
  review, contesting) according to what each asks. Organisations pick these up through
  the existing "shipped template is out of date" update.
- The request register's automated-decision right cites Article 22C; guidance, help and
  the AI incident schema comment cite 22A–22D or 22C.

### Phase 1: lawful basis and objections (built)
- The structured basis on the processing activity (decision 1), with the migration of
  existing text, the ROPA form and page, and the Portal mapping (decision 2).
- **Objections:** add recognised legitimate interests to `ProcessingBasis`;
  `objectionTest` reports Art 21(1) as applying and overridable, as for public task.
  Tests for the case that is wrong today.
- **LIA template, edited in place:** first asks whether an Annex 1 condition applies. If one
  does, it records the condition and why the processing is necessary for it, and skips
  the balancing test. UK references replace the EU ones.
- **Gaps:** recognised legitimate interests chosen with no condition.

Built as:
- `processing_activity.lawful_bases` (jsonb) and `recognised_condition`, with
  `lib/gdpr/lawful-basis.ts` naming the bases and Annex 1 conditions. Migration 0072
  chose a basis from existing text only where the whole text named exactly one; the
  text stays as the note. `basesFromText` (used on ingest) also reads lists where every
  part names exactly one basis.
- The ROPA form ticks bases and asks for the Annex 1 condition only when recognised
  legitimate interests is ticked. Gaps: "No lawful basis chosen" and "Recognised
  legitimate interests with no Annex 1 condition". Basis changes are kept in the audit
  chain, before and after.
- Integration API: optional `lawfulBases` and `recognisedCondition` on ingest and
  export. Structured bases win; text is read where unambiguous; a push with no clear
  basis leaves one chosen in Govern alone.
- Objections: `recognised_legitimate_interests` is a `ProcessingBasis`, and Article
  21(1) applies to it and is overridable. `basisSuggestedBy` reads the chosen bases
  first.
- LIA, edited in place and now UK: an Annex 1 question first. Where a condition
  applies, it asks why the processing is necessary, who asked (for paragraph 1), how
  objections are handled and whether any significant decision is solely automated
  (Article 22B), and hides the three-part test. UK GDPR and ICO references replace the
  EU ones; EDPB Guidelines 1/2024 stay as persuasive. The DPIA's lawful basis question
  offers recognised legitimate interests and asks for the condition.

### Phase 2: automated decisions (about 1.5 days)
- The ADM fields on the processing activity, `admRestriction`, and gaps:
  - a significant solely automated decision with any 22C safeguard unconfirmed;
  - one involving special category data without a 22B condition;
  - one relying on (ea), which 22B does not allow.
- **DPIA, edited in place:** the automated decisions section asks about meaningful human
  involvement (22A), special category data and (ea) (22B), and the four safeguards (22C).
- **Request register:** the `automated_decision` right is described as the 22C
  safeguards (representations, human review, contest), cited correctly.
- The same fields on AI use cases. On either page, where the linked record lacks the
  automated-decision answers or differs, a prompt offers to copy them across; copying is
  an audited write by the person who clicked it.

### Phase 3: further processing and research (about 1.5 days)
- Confirm the unchecked provisions above first.
- The further-processing and research fields, `compatibilityRoutes`, and the ROPA form
  sections for them. Choosing "assessed" asks for the Art 8A(2) factors.
- Gaps: further processing with no route; research without the 84C safeguards confirmed;
  Art 13(5) relied on with no public information link.

### Phase 4: the data protection test for transfers (about 1 day)
- **UK TRA template, edited in place:** the route is approved destination (Art 45A),
  appropriate safeguards (Art 46) or a derogation (Art 49). For Art 46, the conclusion
  asks whether protection would be **not materially lower**, and records the
  reasonable and proportionate steps taken given the nature and volume of the data.
- **Countries register** wording as in decision 5.

### Phase 5: children (about half a day)
- `children_likely` on the processing activity, and a DPIA question on the children's
  higher protection matters where it is set.
- Gap: likely accessed by children with no DPIA, or with the question unanswered.

## Rough size

| Phase | Estimate |
|---|---|
| Phase 0 | about half a day |
| Phase 1 | about 2 days |
| Phase 2 | about 2 days |
| Phase 3 | about 1.5 days |
| Phase 4 | about 1 day |
| Phase 5 | about half a day |

Phases 0–2 correct the wrong answer on objections and bring the most-used records
(the ROPA, the DPIA, the request register) up to date.

## Out of scope

- The EU GDPR templates and EU transfers.
- The DUAA's changes to law enforcement and intelligence processing (DPA 2018 Parts 3
  and 4), digital verification services and smart data.
- Deciding any basis, route or safeguard automatically. As elsewhere in Govern, the
  platform shows what the law asks and a named person records the decision and why.
- The Portal's own changes. Its side of decision 2 is a separate piece of work.
