# Waivern Governance Tool — help

Every help topic the application carries, in the order it presents them.

> Generated from `src/lib/help/topics.ts` by `pnpm help:md`.
> Edit the topics file, not this one.

## Contents

**Getting your bearings**

- [What this is, and what it is not](#what-this-is-and-what-it-is-not) — A workflow tool for privacy and AI governance: it routes work, records decisions, and keeps an audit trail nobody can quietly edit.
- [The step-by-step guide on your home page](#the-step-by-step-guide-on-your-home-page) — An ordered route through the work for anybody who has not done this before, measured against what your registers actually hold.
- [Why your screens look different from a colleague's](#why-your-screens-look-different-from-a-colleagues) — A persona changes what you are shown first and in whose words. It never changes what you are allowed to see or do.
- [Roles, and why you cannot see something](#roles-and-why-you-cannot-see-something) — Access is granted per role, and can be scoped to a single entity. Two powers are deliberately held apart from the rest.
- [Tasks, and being mentioned](#tasks-and-being-mentioned) — Everything waiting on you, whether it names you directly or waits on a role you hold.

**Doing the work**

- [Assessments: DPIAs, transfer risk, AI risk, screening](#assessments-dpias-transfer-risk-ai-risk-screening) — Answer a template, submit it, and it routes to whoever must approve — with the gates chosen by what your answers said.
- [Approving, returning and rejecting](#approving-returning-and-rejecting) — Gates are chosen by the assessment's own answers, and only an approver can decide one.
- [Asking somebody without an account](#asking-somebody-without-an-account) — A single-use link that lets a named person answer specific questions without signing in or seeing anything else.
- [The risk register](#the-risk-register) — Rate a risk, treat it, then rate what remains. Accepting one is a decision with a name and an expiry date on it.
- [Risk appetite](#risk-appetite) — How much risk of each kind the organisation will carry, signed off, and what every risk is judged against.
- [Discussion and mentions](#discussion-and-mentions) — Ask a question beside the record it is about, and name the person who can answer.
- [AI learning](#ai-learning) — What each person needs to know about AI for what they do, recorded as they complete it, and when it is due again.

**The registers**

- [The processing register (Article 30)](#the-processing-register-article-30) — Every processing activity, checked against what Article 30 actually requires rather than against whether the form was filled in.
- [Appropriate policy documents (Schedule 1)](#appropriate-policy-documents-schedule-1) — Which Schedule 1 conditions each appropriate policy document covers, and which processing relies on a condition no current document covers.
- [Third parties and processor agreements (Article 28)](#third-parties-and-processor-agreements-article-28) — Every processor you rely on, whether or not anybody procured it, and whether a contract actually covers them.
- [Data sharing agreements](#data-sharing-agreements) — Sharing personal data with other controllers: who with, on what basis and gateway, and which sharing no agreement covers.
- [Personal data breaches](#personal-data-breaches) — Record every breach, decide the two statutory questions separately, and keep the reasoning for both.
- [Data subject requests](#data-subject-requests) — Record every request from a person exercising their rights, run the month to answer it, and keep the reasoning for each decision.
- [Data protection complaints](#data-protection-complaints) — Record each complaint a person makes to you about how their data was handled, acknowledge it within 30 days, and keep what you looked into and what you told them.
- [Cookies and similar technologies](#cookies-and-similar-technologies) — Inventory every cookie, pixel and stored item on your websites and apps, from Consent Analyser reports or by hand, and record the basis each relies on under UK PECR.
- [Electronic marketing](#electronic-marketing) — Every campaign that markets by email, text or phone, and the basis it relies on under UK PECR, from consent to the soft opt-in.
- [The AI register](#the-ai-register) — Every AI system the organisation is accountable for, including the ones nobody has assessed.
- [Proposals to use AI](#proposals-to-use-ai) — Ideas for using AI, captured before anything is built or bought, scored on value and feasibility, and decided with a reason.
- [The AI assurance chain](#the-ai-assurance-chain) — Each AI system drawn through to what was done about it — and, more usefully, where that chain stops.
- [AI incidents and concerns](#ai-incidents-and-concerns) — Reports about AI systems — failures, harm, challenges to outcomes and concerns — each handled by a named person.
- [NIST AI RMF profile](#nist-ai-rmf-profile) — Where the organisation stands against each of NIST AI RMF's 72 subcategories, where it means to be, and the gap between.
- [Algorithmic transparency records](#algorithmic-transparency-records) — The public record of how an AI system is used, in the Algorithmic Transparency Recording Standard's own fields.
- [Countries, UK approval and transfers](#countries-uk-approval-and-transfers) — One shared library of destinations, with UK approval, EU adequacy and transfer risk, and a date showing when each was last checked by a person.
- [Scan findings](#scan-findings) — Observations pushed in by scanning tools, waiting for a person to decide whether each is a risk.

**Seeing where you stand**

- [The governance overview](#the-governance-overview) — Posture now: what needs attention, risk before and after treatment, the assessment pipeline and service levels.
- [Trends](#trends) — Twelve months of posture, reconstructed from when each record was raised, decided and closed.
- [Reviews that come round again](#reviews-that-come-round-again) — Approved assessments carry a review date, and both the owner and the people who approved it are reminded.
- [Service levels and things that come round again](#service-levels-and-things-that-come-round-again) — Due dates, breaches, and the hourly sweep that raises recurring work.
- [Exports](#exports) — Spreadsheets of anything you can see, scoped to your access, and recorded when taken.
- [The audit trail](#the-audit-trail) — An append-only record of who did what, hash-linked so an altered entry breaks everything after it.

**Setting it up**

- [Assessment templates](#assessment-templates) — The question sets, versioned, so an assessment always shows the questions it was actually answered against.
- [Who approves what, and changing it](#who-approves-what-and-changing-it) — Approvers are named by role rather than by person, so a departure is handled by moving the role — and both are managed on one screen.
- [AI governance framework](#ai-governance-framework) — Whether AI risk follows the UK framework or NIST AI RMF, and what changes when the organisation moves from one to the other.
- [Connected tools](#connected-tools) — Signed endpoints that let the Compliance Portal and scanning tools push records in and pull current state out.
- [The organisation and its legal entities](#the-organisation-and-its-legal-entities) — What this organisation is called, the legal entities within it, and who may add them.
- [Giving somebody access](#giving-somebody-access) — Grant a role, confine it to one entity, suspend or reinstate. Every change is written to the audit log.
- [The assistant, and what it may not do](#the-assistant-and-what-it-may-not-do) — Optional help from a model your organisation chooses and controls. It drafts and explains; it never decides.

---

# Getting your bearings

## What this is, and what it is not

*A workflow tool for privacy and AI governance: it routes work, records decisions, and keeps an audit trail nobody can quietly edit.*

### Starting a new organisation

Somebody who signs in and belongs to no organisation here can ask Waivern for one: its name, its legal entity, and anything Waivern should know. Waivern sets each one up by hand. Once it is approved, the person who asked is its owner and signing in takes them straight to it, with the shipped templates and approval workflows already in place.

Joining an organisation that already exists is different: ask its administrator for an invitation, or sign in with an address at a domain it has verified.

### What it does

It holds the registers an organisation is accountable for — processing activities, AI systems, third parties, risks — and moves work between the people who have to act on them. Assessments get started, answered, reviewed and approved. Risks get rated, treated or accepted. Reviews come round again on schedule.

Every decision is written to an append-only audit log, hash-linked so that altering an earlier entry breaks every entry after it. That is what lets an export be handed to a regulator as evidence rather than as an assertion.

### What it deliberately does not do

It does not decide anything. Nothing here rates a risk as tolerable, approves an assessment, or classifies a system on your behalf. Where the platform has an opinion it raises a task and names a person.

It does not generate formatted documents. A rendered DPIA comes from the Waivern Compliance Portal, which builds it from the facts recorded here. Two document generators would eventually disagree, and then neither could be trusted.

### If you only read one thing

Start at Tasks. It is the only page that shows you what is actually waiting on you, and it is open to everybody — a task that names you is your business whether or not you can read anything else.

**See also:** Tasks, and being mentioned · Roles, and why you cannot see something · Why your screens look different from a colleague's

<sub>Also searchable as: overview, introduction, waivern govern, purpose</sub>

## The step-by-step guide on your home page

*An ordered route through the work for anybody who has not done this before, measured against what your registers actually hold.*

**Screen:** `/app`

### What it is for

The rest of this platform assumes a privacy professional — it names Article 30 and expects you to know why that matters. Plenty of the people who have to use it are a founder, an office manager, or the engineer who drew the short straw. The guide is for them.

Each step says what to do in ordinary words first, why the law cares second, and how you will know it is finished third. Some carry a 'watch out' where people reliably get it wrong in a way that costs them later.

### Two stages

'Setting it up' is the one-off work of getting what your organisation actually does into the tool: entities, people, templates, your processing activities, your third parties, your AI, your first assessments, and the review dates that bring them back.

'Keeping it current' is the work that recurs: clearing tasks, reassessing what is due, renewing agreements before they lapse, keeping the record true when something changes, and knowing what to do about a breach before you need to.

You are put in a stage based on what your registers hold, and you can switch. Switching changes what is explained, never what you may reach.

### Progress is measured, not remembered

A step is ticked because something exists, not because somebody clicked it. Beside each step is the count it was judged on — '3 activities recorded', '2 third parties without an agreement' — so you can check the judgement rather than trust it.

Four steps are never ticked: treating risks, breach readiness, knowing how to handle a request, and taking an export. Those are ongoing judgements rather than tasks you finish, and a tick beside them would say otherwise.

### What it will not do

It does not tell you whether your processing is lawful, whether you need a DPIA, or what your lawful basis is. Every step ends at a screen where a named person makes that call and attests to it. A guide that answered those questions would be doing the one thing this platform refuses to do.

### Turning it off

Hide it from the bottom of the panel; a single line stays on your home page to bring it back. The setting is yours alone and is held per organisation, so the same person can be finding their feet in one and running another by heart.

When you bring it back, the stage is worked out from your registers again rather than from what you last chose.

**See also:** What this is, and what it is not · The processing register (Article 30) · Third parties and processor agreements (Article 28) · Assessments: DPIAs, transfer risk, AI risk, screening

<sub>Also searchable as: guide, onboarding, getting started, setup, first steps, new, beginner, no legal training, checklist, maturity, stages</sub>

## Why your screens look different from a colleague's

*A persona changes what you are shown first and in whose words. It never changes what you are allowed to see or do.*

**Screen:** `/app`

### The four arrangements

Everybody gets the same platform arranged four ways, depending on the persona recorded against your membership.

- Privacy governance — the full register view: assessments, risks, RoPA, transfers.
- AI governance — the AI register and the assurance chain lead.
- Engineering — what has been asked of you, in plain terms, with the jargon translated.
- Product — what is blocking a launch, and what you need to answer to unblock it.

### Persona is not permission

This distinction matters enough that the codebase enforces it with tests. Your persona decides presentation. Your roles decide authority. Somebody set to the engineering persona who holds an approver role can still approve; somebody set to privacy governance who holds no roles still cannot read a record.

So if a colleague can see something you cannot, that is a roles question, not a persona one.

### More than one organisation

If you belong to more than one organisation, the header shows which one you are working in and lets you switch. Everything you see and do is in that organisation alone: its records, its people, your roles there, and your persona there.

Switching takes you to the home page, because whatever you had open belongs to the organisation you left. Your choice is remembered on this browser until you switch again or sign out; without one, you start in the first of your organisations by name.

**See also:** Roles, and why you cannot see something · What this is, and what it is not

<sub>Also searchable as: persona, home, privacy, ai governance, engineering, product manager</sub>

## Roles, and why you cannot see something

*Access is granted per role, and can be scoped to a single entity. Two powers are deliberately held apart from the rest.*

### The roles

Each role carries a set of capabilities. They add up: holding two roles gives you both.

- Owner — everything, including managing people.
- Privacy admin — the registers, templates and workflow configuration.
- Privacy analyst — day-to-day assessment and risk work.
- AI governance — the AI register and assessments over it.
- AI governance lead — everything AI governance does, and also authors, publishes and routes the AI risk, supplier and equality impact templates. Organisation-wide settings, people and the other kinds stay with privacy administrators and owners. A lead counts as AI governance wherever a stage or task names that role.
- Approver — decides approval gates and accepts risk.
- Contributor — answers what is asked of them.
- Auditor — reads everything, changes nothing, exports the audit log.

### Two powers kept separate

Accepting a risk and deciding an approval sit only with the approver role, and are not implied by any amount of administrative access. Somebody who can edit a record cannot also wave it through; that separation is the point of having gates at all.

### Scoped to an entity

A grant can cover the whole organisation or one entity within it. If a page tells you a record belongs to another part of the organisation, your grant is scoped and that record sits outside it. An owner or privacy admin can widen it.

**See also:** Why your screens look different from a colleague's · Approving, returning and rejecting

<sub>Also searchable as: permission, access, rbac, role, denied, capability, entity</sub>

## Tasks, and being mentioned

*Everything waiting on you, whether it names you directly or waits on a role you hold.*

**Screen:** `/app/tasks`

### How work reaches you

A task finds you three ways, and the page shows yours first.

- It names you personally.
- It waits on a role you hold in that part of the organisation.
- It sits in an entity you can read, so you can see it even though it is not yours.

### Somebody asked you

Comments that mention you appear above the task list. That is where a direct question lands — being named by a person is more immediate than a queue item waiting on a role.

### Dates and service levels

A due date comes from the service level attached to that kind of work. Missing one records a breach against the organisation, not against you — the figure exists to show where the process is under-resourced, and hiding it would defeat that.

**See also:** Discussion and mentions · Assessments: DPIAs, transfer risk, AI risk, screening · Service levels and things that come round again

<sub>Also searchable as: todo, queue, assigned, inbox, mention, notification, due, overdue</sub>

---

# Doing the work

## Assessments: DPIAs, transfer risk, AI risk, screening

*Answer a template, submit it, and it routes to whoever must approve — with the gates chosen by what your answers said.*

**Screen:** `/app/assessments`

### Starting one

Pick a template and the entity it concerns. You can attach it to a subject — a processing activity, an AI system — and doing so is worth the extra click: it is what connects the assessment to the thing it assesses on the registers and in the assurance chain.

Answers save as you go. A draft is private working material and routes to nobody.

### Submitting, and what happens then

Submitting closes the draft and works out which approvals are needed. Those gates are decided by your answers, not by a fixed list — an assessment describing a transfer to a country without adequacy picks up a gate that an internal-only one does not.

This is also why answering carelessly is not a shortcut. Understating the processing does not make the work smaller; it produces an approval record that does not match what actually happens.

### Returned to you

An approver can return an assessment rather than reject it. That is a request for more, not a refusal: reopen it, answer what was asked, and submit again. The earlier version stays readable in the history.

**See also:** Approving, returning and rejecting · Asking somebody without an account · The risk register · Assessment templates

<sub>Also searchable as: dpia, questionnaire, screening, template, submit, draft, review, article 35</sub>

## Approving, returning and rejecting

*Gates are chosen by the assessment's own answers, and only an approver can decide one.*

### Deciding

Each gate names the role that must decide it. Approve, return for more, or reject. A rationale is recorded either way and forms part of the audit trail — the sentence you write is what a regulator reads years later when asking why this was thought acceptable.

### Why you have a gate a colleague does not

Gates are added by routing rules that read the answers. A transfer outside the UK, a high inherent rating, an AI system that decides without human review — each pulls in the approval it warrants. Where a rule cannot answer a question, it escalates rather than passing: an unanswerable question is not a 'no'.

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · Roles, and why you cannot see something · Countries, UK approval and transfers

<sub>Also searchable as: gate, sign off, decision, reject, return, approver, threshold</sub>

## Asking somebody without an account

*A single-use link that lets a named person answer specific questions without signing in or seeing anything else.*

### What the link does

It opens the questions you nominated and nothing else. No register, no other assessment, no navigation. The person is named on the link, so their answers are attributed to them in the audit trail rather than to whoever forwarded it.

It expires. If somebody needs longer, issue another rather than extending indefinitely — a link that never expires is a credential.

### When to use it

For the engineer who knows what the system actually stores, or the supplier who knows where their data centres are. Giving that person an account and a role, so they can answer one question, is worse for them and for you.

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · Roles, and why you cannot see something

<sub>Also searchable as: external, no account, invite, supplier, share, token, vendor</sub>

## The risk register

*Rate a risk, treat it, then rate what remains. Accepting one is a decision with a name and an expiry date on it.*

**Screen:** `/app/risks`

### Inherent, then residual

Rate likelihood and impact as things stand, before any treatment. That is the inherent rating. Add mitigations, and when they are actually in place, rate what is left — the residual.

Residual is a judgement somebody makes, never a calculation the platform performs. Nothing here decides that your controls worked.

### A planned mitigation is not treatment

Work that has not started reduces nothing. A mitigation counts once it is in progress, implemented or verified — the registers and the AI assurance chain all take that view, so a risk covered only by plans still reads as untreated.

### Suggested treatments

Under the mitigation form, the treatments DSIT's AI Risk Management Toolkit suggests in its Appendix 4 are listed, those for the risk's category first. Use this copies one into the form; nothing is added until you press Add, and you should reword it to what you will actually do.

A mitigation that started from a suggestion is marked as coming from the toolkit, even after rewording, so you can see later where the idea came from.

### Accepting a risk

Only an approver can accept, and only after a residual rating exists — there is nothing to accept until somebody has judged what remains. An acceptance carries a rationale and an expiry date.

When it expires the risk is not quietly re-accepted. The hourly sweep raises a task, and until somebody acts the risk reads as running unaccepted, whatever its status column says.

### Categories, and raising a risk from an assessment

AI risks are filed under the nine categories of DSIT's AI Risk Management Toolkit — financial, legal, transparency, fairness, accountability, contestability, robustness, security, and environment and people. Other risks can carry no category.

Raise a risk from the assessment that found it, using the form at the foot of the assessment. That ties the risk to the assessment, so the AI assurance chain can draw the line from the system to what was done about it. Where the assessment named categories that carry risk, they are offered first, and any not yet raised are listed.

**See also:** Approving, returning and rejecting · Scan findings · The AI assurance chain

<sub>Also searchable as: risk, mitigation, residual, inherent, accept, tier, likelihood, impact, treatment, suggestion</sub>

## Risk appetite

*How much risk of each kind the organisation will carry, signed off, and what every risk is judged against.*

**Screen:** `/app/risks/appetite`

### One appetite per category

DSIT's AI Risk Management Toolkit asks for appetite to be set for each risk category at organisational level and signed off by the board. Each category can have its own statement, at one of four levels — averse, minimal, cautious or open — and an organisation default covers any category without one.

A statement says in words what the organisation will and will not take on, and names the highest residual tier still within appetite. The tier is what the register checks; the words are what a reader holds the decision to.

### Proposing and signing off

Anyone with an organisation-wide role that manages risk can propose an appetite. It changes nothing until an approver with an organisation-wide role signs it off, naming where it was agreed — and the person who proposed it cannot be the one who signs it off.

A signed-off statement replaces the one before it, which stays on the record. Each carries a review date; when it passes, the privacy administrators are given a task to confirm or replace it.

### What "within appetite" means on the register

A risk is judged against its category's appetite, else the organisation default, else the platform's own assumption that residual high or critical is outside appetite. The risk page says which it was judged against.

A risk with no residual rating counts as not within appetite — nobody has measured it. A risk outside appetite can still be accepted by an approver; the acceptance records that it was outside appetite at the time.

### The risk scale

Risks are rated on four by four by default, or on the five by five Orange Book scale that DSIT's toolkit uses — chosen on the organisation settings page. The scale can only be changed while the register is empty, so every risk on it is rated the same way.

**See also:** The risk register · The organisation and its legal entities · The AI register · AI governance framework

<sub>Also searchable as: appetite, tolerance, orange book, dsit, board, averse, cautious, open, within appetite</sub>

## Discussion and mentions

*Ask a question beside the record it is about, and name the person who can answer.*

### Who can comment

Anybody who can read the record. Asking a question about something is not changing it, so this needs read access rather than write — which matters, because the people most likely to have a question are often the ones who cannot edit.

### Mentioning somebody

Type @ and their address, or just the first part of it. A short form resolves only when one colleague matches; where two people share it, nobody is notified rather than the wrong one. An @ that matches nobody is left as written.

Mentions appear at the top of that person's Tasks page.

### Not a decision surface

A comment cannot approve anything, accept a risk, or change a status. Those live in the audit chain where they are attributable. Agreement in a comment thread is not a sign-off, and should not be treated as one.

You can withdraw your own comment. The fact of it remains, so the thread still reads in order.

**See also:** Tasks, and being mentioned · The audit trail

<sub>Also searchable as: comment, mention, @, question, collaborate, thread, reply</sub>

## AI learning

*What each person needs to know about AI for what they do, recorded as they complete it, and when it is due again.*

**Screen:** `/app/training`

### Who needs what

The AI Playbook asks that everybody working with AI has the skills it needs. Everyone here needs the fundamentals. Approvers, owners and AI governance leads need AI for decision makers; approvers and both AI governance roles need AI risk management; both AI governance roles and the privacy roles need data protection and AI; both AI governance roles and privacy administrators need ethics.

Owning a system on the AI register adds AI for decision makers and AI risk management, because the Playbook names senior responsible owners as people who must understand AI's risks. A system whose owner's learning is not current shows that on the register.

### Recording it

Record what you completed, with the date and, if you have one, a link to the certificate. Somebody who manages people can record it for others. Records are kept as written: a mistake is corrected by recording again, not by editing.

Learning goes stale. Most courses count for two years; using generative AI tools counts for one, because the tools change fastest. Anything else you have done can be recorded too, though it does not count towards a requirement.

**See also:** The AI register · Giving somebody access

<sub>Also searchable as: training, learning, skills, course, competence, civil service learning, attestation</sub>

---

# The registers

## The processing register (Article 30)

*Every processing activity, checked against what Article 30 actually requires rather than against whether the form was filled in.*

**Screen:** `/app/ropa`

### Recording one

It asks four things to start: what the processing is called, why you do it, your role, and which entity. The rest lives on the record itself. A thin record that names its own gaps beats processing nobody wrote down.

### What the flags mean

Red items are unqualified Article 30 requirements — purposes, categories of data subject and of personal data, recipients, transfer safeguards, and the controller's identity where you act as processor. Missing any of those is a compliance failure, not untidiness. Red is also used where the record describes processing the law does not allow: a solely automated significant decision relying on recognised legitimate interests, or on special category data with no Article 22B condition, and further processing on a route Article 8A(4) closes for data collected on consent.

Amber items are reported without being called a breach. Retention and security measures are qualified in the Regulation by 'where possible', so their absence is worth knowing and is not the same thing.

### Lawful basis

Tick each Article 6(1) basis the processing relies on. Recognised legitimate interests, which the Data (Use and Access) Act 2025 added, covers only the five conditions in Annex 1 — disclosure for another's public task, national security, emergencies, crime and safeguarding — and asks which one. It needs no balancing test, but people can still object to it, and a significant decision may not rest solely on automated processing under it. A public authority may not rely on it, or on ordinary legitimate interests, for its tasks.

The text field beside it is a note. Where a record's basis used to be written as text and named one basis plainly, that basis was ticked for you; anything less clear was left for you to choose, and shows as 'No lawful basis chosen' until you do.

### Special category and criminal offence data

Tick the categories of data subject and of personal data that apply, and add any others in your own words. The lists include the categories public services hold: patients, people receiving social care, pupils, parents and carers, social care and education records, and safeguarding concerns. Suspects, convicted people, victims and witnesses are the categories a competent authority must distinguish under Part 3 of the Data Protection Act 2018.

Then say whether the processing involves special category data (UK GDPR Article 9) or criminal offence data (Article 10), and choose the condition. For special category data that is the Article 9(2) point and, where that point needs one, the Data Protection Act 2018 Schedule 1 condition: employment, health or social care, public health and research add the Part 1 condition for you, and substantial public interest asks which Part 2 condition — statutory and government purposes, preventing or investigating unlawful acts, safeguarding, and the rest. Criminal offence data asks for its own condition: official authority, or a condition in Part 1, 2 or 3 of Schedule 1.

A record with special category or criminal offence data and no condition is red, because Articles 9 and 10 forbid the processing without one. So is one relying on a Schedule 1 condition that needs an appropriate policy document when no current document covers it; for paragraphs 10, 13 and 27, which have exceptions, it is amber. Where a document is needed, the record also asks whether retention and erasure followed its policy, and why not if they did not, because Schedule 1 paragraph 41 says the record must.

### Law enforcement processing (Part 3)

On an entity that is a competent authority, a record can be kept under Part 3 of the Data Protection Act 2018 instead of the UK GDPR, for processing for the law enforcement purposes. The UK GDPR's questions — lawful basis, Articles 9 and 10, children, further processing — give way to Part 3's, and automated decisions are asked under Part 3's own sections.

It asks how section 35(2) is met (a task carried out for a law enforcement purpose, or consent). Where there is sensitive processing it asks the route: consent, or strictly necessary with a Schedule 8 condition. Either way an appropriate policy document must be in place (s.42): the policy document register covers Part 3 grounds as well as Schedule 1 conditions, and the record asks whether retention followed it. A record with no route, no condition or no document covering it is red.

It also asks whether fact is distinguished from personal assessment (s.38(2)), and flags categories of data subject that do not distinguish suspects, the convicted, victims and witnesses (s.38(3)), both so far as possible. And for each system the record names, what it logs (s.62): the six operations, whether the consultation and disclosure logs show who did it and to whom, who reviews them and when they were last checked. Since 19 August 2025 the logs need not record why data was consulted or disclosed. Govern records the statement, never the logs.

Requests and breaches about Part 3 processing are handled under Part 3 too: see the requests and breaches help. So are automated decisions (below) and transfers, which have their own assessment template, and further processing and research (s.36 and s.41, below).

### Further processing and research

Say whether the activity reuses data first collected for something else. If it does, the new purpose has to be compatible with the old one (UK GDPR Article 8A). Choose the activity the data came from, if it is on the register, and the ground: fresh consent, research, demonstrating compliance, an Annex 2 condition, an Article 23 objective authorised by law, or your own assessment against the five Article 8A(2) factors, which it then asks you to write up.

Where the data was first collected on consent, Article 8A(4) narrows the choice: research cannot make the new purpose compatible, and Annex 2 or Article 23 only where consent cannot reasonably be sought. Those routes are shown closed, with the reason, and a record that relies on one anyway is flagged.

Separately, say whether the activity is for research, archiving in the public interest or statistics. Research includes commercial research. It then asks for the Article 84C safeguards: no substantial damage or distress, no decisions about a particular person (unless it is approved medical research) and data minimisation. Where it is further processing for research and telling people would be impossible or disproportionate, Article 13(5) lifts the duty, and the record asks where you have published the information instead.

On a record under Part 3 of the Data Protection Act 2018 the questions are Part 3's. There is no compatibility test and no list of deemed cases: data collected for one law enforcement purpose may be processed for another, by you or another controller, only if the law authorises you to and it is necessary and proportionate to the new purpose (s.36(3)). The record asks for the authorising law and the confirmation; without the law, or with the processing recorded as not necessary and proportionate, it is red. Research, archiving and statistics for a law enforcement purpose are not permitted if they are for measures or decisions about a particular person, or likely to cause substantial damage or distress (s.41(2)); the record asks you to confirm both.

Data collected for a law enforcement purpose may be processed for any other purpose only where that is authorised by law (s.36(4)). So where a UK GDPR record's data comes from an activity under Part 3 — vetting staff from custody records, say — it also asks which law authorises that, and is red until it says.

### Children

Say whether an online service in the processing is likely to be accessed by children, whether or not it is aimed at them; preventive and counselling services are not included. Where it is, UK GDPR Article 25(1A) requires the measures to take the children's higher protection matters into account: how children can best be protected and supported, and that they may understand less of the risks, consequences and their rights, with needs that differ by age and development.

The DPIA is where that is shown. The record is flagged until a DPIA of the activity exists, and again until that DPIA says how the higher protection matters shaped the measures. The ICO's Children's code sets out what this looks like in practice.

### Automated decisions

Say whether the processing takes significant decisions about people solely by automated means — decisions with a legal or similarly significant effect, with no person meaningfully involved (UK GDPR Article 22A). Answer 'not yet known' rather than guess; nothing is flagged until you say yes.

Where you say yes, it asks whether special category data is behind the decisions and, if so, which Article 22B condition allows it, and which of the four Article 22C safeguards are in place: telling people, hearing their representations, human intervention, and a way to contest. Each missing piece shows as a flag, and a red notice says when the record as written is not permitted — special category data with no condition, or processing that relies on recognised legitimate interests.

The same questions sit on each AI use case. Link a use case to the processing activities it is used in from the AI use case's page. Where one side has the record and the other lacks it or disagrees, both pages say so and offer to copy it across. Nothing is copied unless you click, because a system can automate part of what an activity does and the two may rightly differ; the copy is logged against you.

On a record under Part 3 of the Data Protection Act 2018, the same questions cite ss.50A–50C. Sensitive processing may be behind the decisions only where they rest entirely on data given with explicit consent, or are required or authorised by law (s.50B); a contract is not enough, and there is no recognised legitimate interests bar. One more question is asked: whether some decisions may be taken without the safeguards. Section 50C(3) allows that only where it is required for one of five reasons — an inquiry, crime work, public security, national security or others' rights — and each such decision is reconsidered as soon as reasonably practicable with a person meaningfully involved, which the record asks you to describe.

An AI use case is read under Part 3 when every processing activity it is linked to is; otherwise under the UK GDPR. A copy between the two is checked against the regime of the record it lands on, so a Part 3 condition or set-aside is refused on a UK GDPR record, and a contract condition on a Part 3 one.

### Transfers

Each transfer needs a destination and, where that destination is not covered by adequacy, a safeguard. The check reads the country library. If the library is empty it escalates rather than clearing everything — an unanswerable question is never answered 'no'.

A competent authority's law enforcement transfers are assessed with the 'Transfer assessment (law enforcement, Part 3)' template (Data Protection Act 2018 ss.73–78). It asks the three conditions of s.73 — necessary for a law enforcement purpose; approved by regulations (s.74AA), subject to appropriate safeguards (s.75) or based on special circumstances (s.76); and to a relevant authority, an international organisation, a processor under a s.59 contract, or another recipient on the four s.77 conditions — and whether a member State must authorise it. Then the data protection test where safeguards are relied on, the documentation and what the Information Commission must be told, onward transfers (s.78), and whether the national security exemption (s.78A) is relied on.

**See also:** Countries, UK approval and transfers · Third parties and processor agreements (Article 28) · Exports · Appropriate policy documents (Schedule 1)

<sub>Also searchable as: ropa, article 30, record of processing, purposes, lawful basis, retention, recipients</sub>

## Appropriate policy documents (Schedule 1)

*Which Schedule 1 conditions each appropriate policy document covers, and which processing relies on a condition no current document covers.*

**Screen:** `/app/policy-documents`

### Why it matters

Most Data Protection Act 2018 Schedule 1 conditions — employment (paragraph 1), every substantial public interest condition in Part 2, and paragraph 35 — are met only while the controller has an appropriate policy document in place. Without one the condition is not met, and the processing has no lawful condition for special category or criminal offence data. Paragraphs 10, 13 and 27 do not need one in the particular cases they describe.

The document explains how the controller meets the Article 5 principles for that processing, and its policies on retention and erasure, with an indication of how long the data is likely to be kept (paragraph 39). It must be kept, reviewed and updated from time to time, and given to the Information Commission on request, from when the controller starts relying on the condition until six months after it stops (paragraph 40).

### Recording one

Part 3 asks the same of a competent authority's sensitive processing for law enforcement (s.42), so a document can also cover sensitive processing on consent or on a Schedule 8 condition.

Govern does not write the document. Add each one with the conditions it covers, whom it is for (one entity, or every entity in the organisation), an owner and when it was last reviewed, then attach the document itself.

The register flags a document never reviewed, or not reviewed in twelve months, one with nothing attached, and one with no owner. It also lists each processing activity relying on a condition that no current document covers; the same shows red on the activity's record.

### Withdrawing and deleting

When a document is no longer in force, withdraw it. It stops covering anything at once, so processing that still relies on its conditions shows as uncovered. It can be deleted six months after it was withdrawn, and not before; deleting it removes its attached files too.

**See also:** The processing register (Article 30) · The organisation and its legal entities

<sub>Also searchable as: appropriate policy document, apd, schedule 1, special category, criminal offence, article 9, article 10, substantial public interest</sub>

## Third parties and processor agreements (Article 28)

*Every processor you rely on, whether or not anybody procured it, and whether a contract actually covers them.*

**Screen:** `/app/third-parties`

### Where these come from

Some you record. Others arrive from a connected scanner, because a tracker seen on a page is a third party whether or not procurement knew about it.

A scanner cannot tell whether that party processes personal data on your behalf, is a recipient in its own right, or was a false positive. So a supplier it reported carries 'nobody has confirmed this is a processor' until a person presses the button saying they have looked. That button records that somebody looked; it does not assert that an agreement exists.

### Processor or another controller

Say what each third party is to you: a processor, which processes data for you on your instructions; another controller, with whom you share data and who decides for itself what to do with it; or both, for different data. Article 28 reaches processors only, so a third party recorded as another controller is not flagged for having no processor agreement. Sharing with it is recorded on the data sharing agreement register instead, and its page lists the agreements that name it.

### What counts as covered

Article 28(3) requires processing to be governed by a contract. No agreement, an unsigned agreement and an expired agreement are reported as the same failure, because in substance they are.

Sub-processors and transfer mechanism are reported when missing but not called breaches — an empty sub-processor list may honestly mean none.

### Attaching the agreement itself

Each agreement takes files, and several at once — a master agreement, a processing schedule and a sub-processor annexe are three documents describing one arrangement, and uploading them one at a time is how two of the three go missing.

There is a separate place on the third party for anything not tied to one agreement: due diligence, certifications, an audit report.

A hash is recorded when a file is uploaded and checked when it is read back, so the platform can say the agreement it hands you is the one it was given. Downloads are recorded, because taking a signed contract out of the building is worth knowing about.

### Which agreement a document belongs to

Every file carries a 'belongs to' selector listing the third party and each of its agreements, so a contract uploaded in the wrong place can be moved onto the agreement it governs. The bytes and the hash do not change, so verification still passes; the move is recorded against both records, because the one it left should not simply show a file disappearing.

Files held against the third party rather than a specific agreement are still read when a model is asked to find transfers and sub-processors — a sub-processor annexe is as often filed there as against the contract. The reading panel names every file it will be given, so what it saw is never a guess.

### Correcting and retiring an agreement

A recorded agreement can be edited in place — title, dates, document reference, transfer mechanism, sub-processors. Every field's previous value is written to the audit trail, because 'the expiry date was changed' is a different fact from 'the expiry date is this', and a register has to answer both.

Archiving is for an agreement that has ended for a reason its expiry date does not describe: terminated, superseded, the supplier dropped, or recorded in error. It stops the renewal reminders and takes the agreement out of the in-force calculation, but the row stays, because the register must be able to say what governed processing in a past year. A reason is required.

Archiving never hides a gap. Archive the only agreement a processor has and that processor immediately reports as uncovered, which is the truth rather than an oversight. It is also reversible.

The thing to avoid is the workaround this replaces: editing an expiry date to yesterday so an ended agreement stops counting. That puts a date in the record that never appeared in the contract.

### Having a model read the agreement

Where an organisation has configured its own model and switched on 'reading an uploaded agreement', each agreement offers a button that reads the files attached to it — and those attached to the third party, since a sub-processor annexe is as often filed there as against the contract.

What comes back is a set of proposals, never a register entry. Each one carries the sentence it was taken from and the file that sentence is in, so checking it is faster than reading the contract. Accepting a proposal is what writes it to the agreement, and it is recorded as your act, with the quote and the source hash carried into the audit trail.

A proposal you reject is kept. That a person looked at a claim and disagreed with it is evidence of review, and keeping only the accepted ones would leave a trail showing agreement that never happened.

### Sub-processor lists held on a web page

Most agreements do not list sub-processors. They say the current list is maintained at an address, or in an annexe. Where the model finds such an address it is reported rather than followed, and the platform will not open it until somebody asks.

That is deliberate. The address was written by the supplier, not by you, and fetching it is the platform making a request chosen by an outside party from inside your network. Private and internal addresses are refused outright, as are redirects into them.

A page that is fetched is recorded with its hash and the moment it was retrieved. A sub-processor list is a page that changes, so 'these were the names on that date' is the only claim worth keeping.

### What it can and cannot read

PDFs, .docx, .xlsx, plain text and CSV. A scanned agreement is a picture of words and has no text to read; the platform says so by name rather than returning a thin answer, and OCR is not something it does.

Files that could not be read are listed with the reason, so a gap in what was proposed can be explained rather than guessed at.

### Expiry is watched

The agreement in force is the unexpired one, and among those the most recently signed. An agreement with no end date is perpetual rather than incomplete.

Anything within six months of lapsing raises a monthly task. Six months because that is renewal lead time — a warning at ninety days arrives after the window to renegotiate has closed.

### Suppliers that use or supply AI

Say on the supplier whether it uses AI in delivering the service or supplies an AI product — the distinction PPN 02/24 draws. Using AI is not a reason to exclude a supplier; it is a reason to ask more.

Then assess it from the supplier's page with the AI supplier assessment, which follows PPN 02/24, the Crown Commercial Service's data ethics requirements and the AI Playbook's advice on buying AI. Once it is approved, the register reads back whether the supplier trains on your data and which of the expected contract terms are missing — use disclosure, no training without agreement, notice of model changes, incident reporting, and return or deletion of data at the end.

A supplier named by a system on the AI register is asked about even if nobody has said it uses AI.

### Privacy and AI standings

Every supplier shows two standings, side by side and never combined, because they are judged by different people against different rules and a supplier can pass one and fail the other.

Privacy comes from Article 28: not met when there is no agreement or it is unsigned or expired, met with gaps when something else is missing, met otherwise. There is no privacy sign-off of a supplier as such; the contract either governs the processing or it does not.

AI comes from the AI supplier assessment: not assessed, in progress, or — once approved — its recommendation: proceed, proceed with conditions, or do not proceed. The conditions are shown on the supplier's page. A do-not-proceed is also flagged on every AI system that supplier supplies.

Only an AI supplier assessment counts for the AI standing. It is recognised by the questions it asks, so your own copy of the template counts, and a privacy or security assessment of the same supplier does not.

**See also:** The processing register (Article 30) · Countries, UK approval and transfers · Scan findings · The AI register

<sub>Also searchable as: supplier, vendor, dpa, article 28, processor, sub-processor, contract, expiry, extract, read the agreement, transfer mechanism, provenance, sub-processor list</sub>

## Data sharing agreements

*Sharing personal data with other controllers: who with, on what basis and gateway, and which sharing no agreement covers.*

**Screen:** `/app/sharing-agreements`

### What it is for

A processor is governed by an Article 28 contract. Another controller is not: a council sharing with a health trust, a school with children's services, a safeguarding partnership. The UK GDPR does not require an agreement for that sharing, but the Information Commission's data sharing code of practice expects one for routine sharing, and it is where each party's basis is written down.

Each agreement names our party (one of your entities) and the other controllers, which come from the third-party register recorded as another controller. It records the purpose, which way the data goes, what is shared, each controller's own Article 6 basis — and where special category or criminal offence data is shared, its Schedule 1 or Article 10 condition — and the processing activities it covers.

### The legal gateway

A public body can share only within its powers, so as well as an Article 6 basis it needs a gateway: an enactment that allows or requires the sharing, such as the Digital Economy Act 2017 section 35 for public service delivery, or its own powers and functions. Say which, and name it. A party that is not a public body needs none; say so.

### What is flagged

An agreement with no other party, or past its review date, is shown first. Also flagged: a party with no lawful basis, ours not recorded, no purpose, no gateway, nothing said about what is shared, not signed, no review date, nothing attached, no linked activity and no owner. None is called a breach.

On the processing register, an activity whose recipients include a third party recorded as another controller, with no current agreement covering that activity and that party, shows an amber gap; the register lists them all. Recipients are matched to the third-party register by name, as the request register does.

Record a review with the date the next is due. When the sharing stops or the agreement is replaced, end it with a reason: it is kept, and from then covers nothing.

**See also:** Third parties and processor agreements (Article 28) · The processing register (Article 30) · Appropriate policy documents (Schedule 1)

<sub>Also searchable as: data sharing agreement, information sharing agreement, isa, dsa, controller to controller, gateway, legal gateway, digital economy act, safeguarding partnership, multi-agency, data sharing code</sub>

## Personal data breaches

*Record every breach, decide the two statutory questions separately, and keep the reasoning for both.*

**Screen:** `/app/breaches`

### Record it before you assess it

The seventy-two hours runs from when the organisation became aware, not from when the breach happened, and not from when somebody finished deciding what it amounted to. So the form asks for four facts and the time you became aware, and the assessment comes afterwards.

Every breach goes on the register, including the ones you decide not to report. Article 33(5) requires all of them to be documented, and an absence of notification with nothing written down is indistinguishable from an oversight.

### Two questions, not one

Article 33 asks whether the breach is likely to result in a risk to people's rights and freedoms. If it is, the supervisory authority must be told within seventy-two hours. In the UK that is the Information Commission, which replaced the Information Commissioner on 30 September 2026 and still publishes its guidance as the ICO.

Article 34 asks whether that risk is high. If it is, the people affected must be told without undue delay — a different test, a different deadline, and a breach can be notifiable without being communicable.

- Article 34(3)(a) — the data was unintelligible, through encryption or effective pseudonymisation.
- Article 34(3)(b) — subsequent measures mean the high risk is no longer likely to materialise.
- Article 34(3)(c) — individual communication would take disproportionate effort, so a public communication is made instead. This substitutes a communication; it does not remove one.

### Assessing severity: template or free text

Either works. A breach settled in an afternoon can be judged in the decision itself, in your own words — requiring a structured assessment would push people to record breaches later, and the seventy-two hours runs from when you became aware whatever anybody is doing about it.

The structured option works through the ICO's factors: the type of breach, the nature and sensitivity and volume of the data, how easily people can be identified, the severity of the consequences, whether any of them are children or otherwise vulnerable, and how many are affected. It proposes an answer to both statutory questions.

It proposes. The decisions remain acts a named person records with their reasoning, and the band appears beside them rather than in place of them.

### If you are the processor

Your obligation under Article 33(2) is to tell the controller without undue delay. You do not notify the authority in your own right, and no seventy-two hour clock is shown — setting your role correctly is what makes the platform stop offering you the wrong deadline.

### If you are a telecoms or internet provider

A provider of a public electronic communications service has its own breach duty under PECR regulation 5A. Mark the legal entity as a public communications provider on the Organisation page, and each of its breaches asks whether it arose in providing the service.

Where it did, or until that is answered, a second seventy-two hours runs beside Article 33's. It has no risk test: the Information Commission is told of every such breach. The subscribers or users affected are told without undue delay where it is likely to adversely affect their personal data or privacy, unless the Commission has accepted the data was unintelligible.

Article 95 of the UK GDPR means Article 33 does not add a second duty where reg 5A applies. If that is your position, record the Article 33 decision as not required and cite Article 95.

### Decisions, including the ones nobody required

Contacting an insurer, calling the police, telling a partner organisation, offering credit monitoring — none of it is required by the Regulation, and all of it is worth an audit trail. Each is recorded the same way, and what separates them is the provision relied on: an Article reference where the law compelled it, blank where you chose to act.

Every decision needs its reasoning, including "not required". That sentence is what a regulator would ask about.

Decisions are appended, never edited. Changing your mind is a second decision, and the sequence shows how the judgement developed.

### What the platform will not do

It will not decide whether a breach is notifiable, and it will not notify anybody. It works out which obligations are engaged, tracks the seventy-two hours, and says which parts of Article 33(3) are not yet recorded. A person makes each call.

A missed deadline does not remove the obligation. Article 33(1) still requires notification, accompanied by the reasons for the delay, and the platform says so rather than turning the task green.

### Breaches of law enforcement processing (Part 3)

Where the entity is a competent authority, a breach of its law enforcement processing is notified under ss.67–68 of the Data Protection Act 2018 rather than Articles 33–34. Choose the regime on the breach; it starts as the entity's new records do. The thresholds and the seventy-two hours are the same, and the decisions cite the sections.

There is one difference. Telling the people affected may be restricted, wholly or partly, as far and as long as is necessary and proportionate, on the same four grounds as a request (s.68(7)): to avoid obstructing an inquiry, to avoid prejudicing crime work, to protect public security, or to protect others' rights. Where it is, the Information Commission cannot require you to tell them (s.68(8)). Record it as a decision not to tell them, citing the ground, and when it will be looked at again.

Where exemption is required to safeguard national security, s.78A lifts both duties — notifying the Commission and telling the people affected. Cite it on the decision instead.

**See also:** The risk register · Service levels and things that come round again · The audit trail · The processing register (Article 30)

<sub>Also searchable as: breach, incident, 72 hours, seventy-two, article 33, article 34, notify, ico, information commission, supervisory authority, data subjects, ransomware, leak, pecr, reg 5a, telecoms, communications provider, part 3, law enforcement, section 67, section 68</sub>

## Data subject requests

*Record every request from a person exercising their rights, run the month to answer it, and keep the reasoning for each decision.*

**Screen:** `/app/requests`

### Record it the day it arrives

A request can come by any route — email, a letter, a phone call, a message on social media, a comment to a member of staff — and need not name the law or the right. The month runs from when it arrived, not from when it reached the right person, so record it as soon as anybody recognises it.

Record only what you need: who is asking, how to reach them, and what they asked for. The register is restricted to the people who handle requests, because each entry is the requester's own personal data.

### A public form, if you want one

On the requests page, an owner or privacy administrator can create a web form for an entity and publish its address in the privacy notice. People can then make a request without an account. Each submission is recorded here as arriving by web form, the month starts at once, and a task goes to the privacy team.

The form shows nothing back except a reference and the deadline, so nobody can use it to find out about anybody's request. It takes no identity documents: if you reasonably doubt who is asking, ask afterwards, as for any request. It limits how often one address can submit, keeping only a scrambled form of the address for a day.

It is one route among many. The form says so, and so must you: a request by email, by post or in person counts the same. Withdraw a form and its address says it is no longer taking requests.

Each form also takes complaints about how personal data was handled (DPA 2018 s.164A) unless you switch that off for it. Those go to the complaints register.

### How the month is counted

From the day the clock starts to the same date next month. Where next month has no such date, the last day of the month. Where that falls on a weekend or a bank holiday, the next working day. That is how the ICO counts it, and the deadline shown is worked out that way.

The clock starts on receipt, unless you had reasonable doubt about who was asking and asked for proof. Then it starts when the proof arrives. Record how identity was checked, never a copy of the document.

- Extension: up to two more months, for complexity or number of requests, decided and explained to the person within the first month. Only once.
- Pausing for clarification: UK only, for requests received from 5 February 2026, when the Data (Use and Access) Act 2025's changes to the time limits came into force. Where you hold a lot about somebody and genuinely need to know what they want, the month stops until they answer. The EU GDPR has no such pause, and a request recorded under EU law is not paused.
- Each request keeps the law it was recorded under. Changing the organisation's default never moves a deadline already running.

### Where to look

Say who the requester is to you — customer, employee, applicant — and the request lists, from the ROPA, the processing activities about people like them, the systems those activities run on, and the suppliers and other recipients they disclose to. A recipient with the same name as a supplier on the register is listed as that supplier.

Record what each search found: nothing held, found, found and acted on, or found and deliberately not acted on — which needs a reason. Add anywhere the ROPA does not mention, and consider whether the ROPA should. Under UK law the search need only be reasonable and proportionate; this list is how you show it was.

### Telling recipients

Once data has been rectified, erased or restricted, Article 19 requires each recipient that holds it to be told, unless that proves impossible or involves disproportionate effort. Record each one as told, or why not. A recipient found not to hold this person's data needs nothing.

The platform will not close a request while a recipient is still to be recorded. If the person asks, tell them who the recipients are.

### When you are the processor

A processor does not answer the person. Pass the request to the controller without delay and help them answer it, as Article 28(3)(e) and your data processing agreement require. Record who it went to, when, and what help was given; the request can then be closed.

### Objections

An objection to direct marketing is absolute: the processing stops, and there are no grounds on which to refuse. The platform will not record one as overridden.

Where the marketing is by email, text or phone, stopping it also meets the opt-out rules in PECR (regulations 21 and 22), or for an EU request the national law implementing the ePrivacy Directive. Keep the person on a suppression list rather than deleting them, even if they also asked for erasure, so they are not marketed to again. The platform records the objection; the marketing consents themselves are outside it.

An objection to processing on public task, legitimate interests or recognised legitimate interests can be overridden only on compelling legitimate grounds that outweigh the person's interests, or for legal claims — and the burden is yours. Record the grounds in the decision. Consider restricting the processing while you decide.

Processing on any other basis is not open to objection under Article 21. Processing on consent stops when consent is withdrawn; anything else may be an erasure or restriction request in different words.

Decide an objection once for each processing activity it is about. The form offers the activities found in where to look, and suggests the basis from the ROPA; if the ROPA is wrong, correct it there.

While you weigh an objection to public task or either kind of legitimate interests, the person may have the processing restricted (Article 18(1)(d)). If they asked, the platform will not record the restriction as refused until the objection is decided.

An upheld objection means the processing stops for this person. The request will not close until that activity is recorded as acted on in where to look.

### Requests about law enforcement processing (Part 3)

Where the entity is a competent authority, a request about its law enforcement processing is recorded under Part 3 of the Data Protection Act 2018. It starts there when the entity's new records do and every right asked for is one Part 3 gives; otherwise it starts under the UK GDPR, and can be moved. Part 3 gives access (s.45), rectification (s.46), erasure or restriction (s.47) and the automated decision safeguards (s.50C); there is no right to object or to portability, and a Part 3 request cannot include them.

The month is counted as under the UK GDPR (s.54): one month, extendable by two with notice and reasons inside the first, and paused while a reasonably needed clarification of an access request is awaited. The search need only be reasonable and proportionate (s.45(2A)).

In place of the Schedule 2 and 3 exemptions, Part 3 lets the information you give (s.44(4)), access (s.45(4)) and the reasons for refusing rectification or erasure (s.48(3)) be restricted, wholly or partly, as far and as long as is necessary and proportionate: to avoid obstructing an inquiry or investigation, to avoid prejudicing crime work, to protect public security, or to protect others' rights. National security was taken out of those grounds on 5 September 2025; it is now the s.78A exemption. Privileged information is exempt under s.45A.

Record each restriction as its own decision, with the reasons. The person is told of it and why, with their rights to ask the Information Commission to check (s.51), to complain to you and to the Commission, and to go to court — unless telling them would undermine the restriction, which the decision asks you to explain. The reasons are kept either way, because the Commission can ask for them.

Where national security is the reason, choose the s.78A exemption instead. It applies only where exemption is required to safeguard national security, which the decision asks you to confirm, and records any Minister's certificate under s.79 — conclusive evidence that it is required, unless the Tribunal quashes it.

### Exemptions

On a request under UK law, record each exemption as its own decision and choose the paragraph of the Data Protection Act 2018 relied on, from Schedule 2 (crime and tax, immigration, regulatory functions, other people's information, legal privilege, references, exams, journalism, research and archiving) or Schedule 3 (health, social work and education data, and child abuse data). The form shows the test the paragraph sets, and refuses a paragraph that does not reach the right decided: most of Schedule 2 Part 4 and the serious harm exemptions restrict only the right of access. An exemption applies only as far as its test is met, to the specific information, never to a whole request because part of it is caught.

The immigration exemption (Schedule 2 paragraphs 4 to 4B) is for the Secretary of State only, and is decided for each right separately and afresh each time. The decision records how the person's vulnerability and rights were weighed, confirms a substantial risk of prejudice that outweighs the risk to them and is necessary and proportionate, and says whether the person was told — and if not, why telling them would prejudice immigration control.

Withholding health data because access would be likely to cause serious harm (Schedule 3 paragraph 5) needs, unless you are a health professional yourself, the opinion of the appropriate health professional: the one responsible for the person's care, or the best placed of several, or a qualified one where none is available. Record the opinion on the request first. It counts only if given in the six months ending on the day you rely on it, and only if it would not be reasonable to consult them again; the decision asks why not.

The same opinion, that the serious harm test is not met, is needed before a controller that is not a health professional discloses health data the person has not already seen (paragraph 6). Access requests remind you of it.

The expectations-and-wishes exemptions for health and social work data, and child abuse data, apply only to a request made by a parent with parental responsibility, or by a person a court appointed to manage the person's affairs; the decision asks which. Child abuse data does not apply in Scotland.

### When people keep objecting

Each objection upheld or overridden counts against its activity, one per request, over twelve months. The count shows on the activity's ROPA record — numbers only, never who objected.

Past the organisation's threshold — three by default, set on the requests page — the scheduler sends the activity's legitimate interests assessment back to its owner for review. Where there is no LIA, the task asks for one. A run of objections is evidence the people affected do not expect the processing, which is what the balancing test is meant to weigh.

### Responding

Write the response in whatever you normally use for letters. Record here what was sent, when and how, and link to it if it is kept somewhere linkable.

Anything short of doing everything asked — a refusal, an exemption, part of the data withheld — must tell the person why, and that they may complain to the supervisory authority and seek a judicial remedy. The platform will not record such a response without that.

A late response is still owed, and is recorded with the reason it was late.

### How well you are answering

The requests page shows the last twelve months: how many requests arrived, of which rights, how many were answered on time and how many late, and the median days to respond. A request invoking several rights counts under each.

Exports has the register as a spreadsheet, for anybody who handles requests: rights, dates, the deadline, each decision with its reasoning, and whether it was answered on time. Who asked and what they wrote stay in Govern. The monthly trends export carries the counts too.

The Waivern Compliance Portal can read the same counts — never the requests — so its data subject rights procedure can state real response times.

### Deadlines and tasks

A week before a request falls due, and again once it is overdue, the scheduler raises a task for whoever is handling it, or for the privacy administrators if nobody is. The task is due on the statutory date, not on a service level.

### What the platform will not do

It will not answer the request, search your systems, or redact anything. It counts the month, lists where to look, refuses what the law does not allow, and keeps the record of who looked where, who decided what, and why.

**See also:** Data protection complaints · Personal data breaches · The processing register (Article 30) · Tasks, and being mentioned · The audit trail

<sub>Also searchable as: dsar, sar, subject access, access request, article 15, erasure, right to be forgotten, article 17, objection, object, article 21, rectification, portability, restriction, one month, extension, article 12, direct marketing, rights request, article 19, recipients, search, reasonable and proportionate, processor, article 28, article 18(1)(d), lia, legitimate interests assessment, balancing test, timeliness, on time, response times, export, metrics, web form, intake, public form, privacy notice, exemption, schedule 2, schedule 3, serious harm, health professional, immigration exemption, social work, education records, child abuse data, part 3, law enforcement, restriction, section 45</sub>

## Data protection complaints

*Record each complaint a person makes to you about how their data was handled, acknowledge it within 30 days, and keep what you looked into and what you told them.*

**Screen:** `/app/complaints`

### What the law requires

Section 164A of the Data Protection Act 2018, inserted by the Data (Use and Access) Act 2025 and in force from 19 June 2026, lets a person complain to you if they think their personal data has been handled in breach of the UK GDPR. You must make complaining easy, acknowledge each complaint within 30 days of receiving it, take appropriate steps to respond without undue delay, and tell them the outcome.

Appropriate steps include making enquiries into what they complained about, as far as is appropriate, and keeping them informed of progress. The register keeps a dated record of both.

The EU GDPR has no equivalent duty. A complaint recorded under EU law shows no statutory period, but the register still holds it and measures it against your own targets.

### Record it the day it arrives

A complaint can come by any route, and need not use the word. It often arrives inside a reply about a request: if the person is unhappy with how you handled it, that is a complaint as well as part of the request. Record it separately, linked to the request, because the 30 days to acknowledge it run on their own.

Record only what you need: who is complaining, how to reach them, what it is about and what they said. The register is restricted to the people who handle requests, for the same reason.

The right is the data subject's own. Somebody acting for them is recorded as their representative, with whether their authority was checked.

### Taking complaints online

The Act gives a complaint form that can be completed electronically as its example of making complaining easy. The public request form does this: unless you switch it off for a form, it asks people whether they are making a request or a complaint. A complaint sent through it is recorded here as received by web form, the 30 days start at once, and a task goes to the privacy team.

As for requests, the form shows nothing back except a reference and the date it must be acknowledged by, takes no identity documents, and limits how often one address can submit — requests and complaints counted together. If the person gives the reference of an earlier request, it is kept with what they wrote; link the complaint to the request yourself once you have checked it is theirs.

Forms are created, switched and withdrawn on the requests page, by an owner or privacy administrator.

### How the 30 days are counted

The Act says the period begins when the complaint is received, so the day it arrives is the first day. A complaint received on 1 July must be acknowledged by the end of 30 July. These are calendar days: unlike the month for a request, nothing moves off a weekend or a bank holiday.

An acknowledgement after the 30 days is still recorded, with the reason it was late. Sending the outcome within the 30 days counts as the acknowledgement if nothing else did.

### Your own targets

The Act sets no figure for "without undue delay" or for how often to update the complainant. On the complaints page an owner or privacy administrator sets the organisation's own: by default an outcome within 30 days of acknowledging, and an update at least every 30 days while it is open. The register measures against these and says they are yours, not the law's.

Telling the complainant the outcome after your target needs a reason. That reason is how the record shows the delay was not undue.

### The outcome

Write the letter in whatever you normally use. Record here whether the complaint was upheld, partly upheld or not upheld, what they were told, anything you are changing because of it, and where the letter is kept.

The Act does not require you to tell them they may complain to the Information Commission, but the Commission will expect it, and the form asks.

A complaint cannot be closed without an outcome unless the complainant withdrew it.

### Deadlines and tasks

The scheduler raises a task for whoever is handling a complaint — or the privacy administrators, if nobody is — a week before the acknowledgement is due and again once it is overdue. It does the same for your outcome target and your update interval, saying that those are your own targets rather than the Act's. Each task is due on the date itself, not on a service level.

The dashboard shows complaints to acknowledge this week, and any past the 30 days, to the people who handle them.

### How well you are handling them

The complaints page shows the last twelve months: how many arrived and about what, how many were acknowledged within the 30 days and how many late, how many outcomes were sent and how they came out, and the median days to the outcome. In time and late count only complaints s.164A applies to; outcomes are measured against your own target.

The Waivern Compliance Portal can read the same counts — never the complaints — so a procedure it writes can state real figures. They are also what a return under section 164B would ask for, if one is ever required.

### When you are the processor

The duty is the controller's. As the processor, pass the complaint to the controller without delay, as your data processing agreement requires, and record that as the outcome. A joint controller can do the same for a part another controller is responsible for.

### What the platform will not do

It will not decide whether a complaint is justified, write to the complainant, or report to the Commission. Regulations could one day require controllers to report how many complaints they receive (section 164B); none have been made, and the counts above are what would be needed.

**See also:** Data subject requests · Personal data breaches · The audit trail

<sub>Also searchable as: complaint, complaints, 164a, section 164a, dpa 2018, data use and access act, duaa, acknowledge, acknowledgement, 30 days, thirty days, undue delay, outcome, grievance, information commission, ico, regulator, progress update, deadline, task, timeliness, metrics, 164b, return, counts, web form, public form, complaint form, online, intake</sub>

## Cookies and similar technologies

*Inventory every cookie, pixel and stored item on your websites and apps, from Consent Analyser reports or by hand, and record the basis each relies on under UK PECR.*

**Screen:** `/app/cookies`

### What the law requires

PECR regulation 6 restricts storing information on a person's device, or reading what is stored there. The Data (Use and Access) Act 2025 rewrote the exceptions into Schedule A1, in force from 5 February 2026. Something may be stored or read if one of these applies:

- Consent, after clear and comprehensive information about the purpose (para 2).
- Solely to carry a communication over a network (para 3).
- Strictly necessary for a service the person asked for — security, fraud prevention, fault detection, authentication, remembering what they entered (para 4).
- Statistics: collected by the provider, solely to improve the service, shared only with someone helping to do that, with clear information and a simple, free way to object (para 5).
- Appearance and function: solely to adapt how a website or app looks or works to the person's preferences, with clear information and a simple, free way to object (para 6).
- Emergency assistance: solely to locate somebody who asked for help (para 7).

### Websites and apps

Add each website and app the organisation runs. Record, once for each, where people are told about cookies — the cookie notice — and how they object to statistics and preference cookies. Every statistics and appearance decision on that site is checked against both.

This register covers UK law. The EU ePrivacy Directive has no statistics or appearance exception, so an EU site's analytics still need consent.

### Uploading a Consent Analyser report

Download a run's report as JSON from the Waivern Consent Analyser and upload it on the website's page. Govern keeps the report as evidence, without its screenshots or any cookie values, and reads what the scan saw: each cookie, whether it was set before consent, and whether it was still collecting after Reject All.

Nothing is added to the inventory automatically. New items, and items a previous scan found but this one did not, wait for somebody to accept or reject them. Rejecting needs a reason; something rejected that the next scan still finds is proposed again.

Checks that failed become findings, as from any scanner. The analyser's checks predate the DUAA: it reports analytics before consent as a failure even where Schedule A1 para 5 may allow it. The finding says so — check the inventory before treating it as a breach.

A report that was blocked by the site's bot protection is refused: it saw a block page, not the site. A report for another address is refused unless you confirm it belongs here.

### Scanning from here

An owner or privacy administrator can save a Consent Analyser API token on the cookies page. The analyser checks it before it is saved; it is stored encrypted, and only its last four characters are ever shown. Each scan is charged to whoever owns the token on the analyser, and is private to them there.

With a token set, each website's page has a Scan now button. It runs the analyser from the UK where the analyser can, otherwise from the EU, in GDPR mode with AI classification, and usually takes one to five minutes. The page follows the scan while it is open; if you leave, the hourly scheduler finishes it. The report is then taken in exactly as an uploaded one would be.

A scan that fails, is cancelled, or has not finished after fifteen minutes is recorded as failed with the reason, and nothing changes in the inventory. One scan runs at a time for each website.

### Recording the basis

For each item, choose the basis it relies on and say why. The form shows what that paragraph needs, and you confirm each condition. The scanner's category is shown as a suggestion only: the analyser's own rules put Google Analytics under advertising, and a cookie called analytics that is shared with an advertiser is not statistics.

Decisions are kept, never overwritten. Changing your mind is a second decision.

What is still missing shows as a gap: an unconfirmed condition, no information or objection route for the site, a third-party statistics cookie with no supplier recorded, or a cookie that relies on consent but was seen before consent was given.

### Keeping it current

Sites change without anyone telling the privacy team: a new tag in the tag manager, a plug-in update. So each website or app has a rescan interval — every three months unless you change it, or no reminders at all. A fortnight before a scan is due, a task goes to whoever is responsible for the site, or to privacy administrators if nobody is. Taking in the next report closes it, and the next due date counts from that scan.

When a scan finds something the inventory does not reflect — new items, items no longer seen, or an item already on the inventory that is now set before consent — one task says what it found. Something newly set before consent needs a basis that allows it, or it must wait for consent.

The website's page, the cookies register and the governance overview count the gaps by kind — for example "3 items with no basis, 1 statistics or appearance item with no objection route" — most pressing first: what may be unlawful now, then what is unrecorded.

### What the platform will not do

It will not decide a basis from a scan, change the website or its consent banner, or tell you a cookie is lawful. It holds the inventory, the reasoning, and what is still to be shown.

**See also:** Scan findings · Third parties and processor agreements (Article 28) · Exports

<sub>Also searchable as: cookie, cookies, pecr, regulation 6, schedule a1, storage, access, terminal equipment, analytics, statistics, preferences, functional, strictly necessary, consent, opt out, object, duaa, data use and access act, consent analyser, scan, pixel, local storage, sdk, cookie notice, rescan, reminder, gaps, scan now, api token, credits</sub>

## Electronic marketing

*Every campaign that markets by email, text or phone, and the basis it relies on under UK PECR, from consent to the soft opt-in.*

**Screen:** `/app/marketing`

### What the law requires

PECR sets its own rules for direct marketing by electronic means, on top of UK GDPR. Which rule applies depends on the channel:

- Email and text to individuals, sole traders and ordinary partnerships need consent, or the soft opt-in: details got in a sale or negotiations for one, marketing only the organisation's own similar products, with a simple free way to refuse when the details were collected and in every message (reg 22(3)).
- Since 5 February 2026 a registered charity may use a charity soft opt-in: solely to further its charitable purposes, to people who expressed interest in or offered or gave support, with the same chance to refuse (reg 22(3A), added by the Data (Use and Access) Act 2025).
- Email and text to companies, LLPs and public bodies are outside regulation 22, but every marketing message must say who it is from and give a valid address to opt out (reg 23). A named employee's address is still personal data.
- Live calls must not go to anyone who has told you not to call, or to a number on the TPS or CTPS unless they have said they do not mind (reg 21). Calls about claims management or pensions need consent (regs 21A, 21B).
- Automated calls need consent (reg 19).

### Recording an activity

Add each campaign or channel: the monthly newsletter, a promotional text campaign, an outbound call programme. Say how it reaches people and who — individuals, or only companies and public bodies — because that decides which bases are open to it.

Link it to its processing activity in the ROPA. Objections to direct marketing upheld in the request register are then counted against it; an objection overridden shows in red, because UK GDPR article 21(3) makes it absolute.

Who is on each list, and who has opted out, stays in your marketing tool. This records what the sending relies on.

### Recording the basis

Choose the basis and say why. Only the bases the channel can use are offered, and you confirm each condition the regulation sets. Decisions are kept, never overwritten: changing your mind is a second decision.

What is still missing shows as a gap, most pressing first: an objection overridden, no basis, a basis the channel cannot use, a call list not screened against the TPS in the last 28 days, a charity soft opt-in with no registration number, an unconfirmed condition, or no link to the ROPA.

### TPS screening

For live calls that rely on screening, record each time the list is screened against the TPS and CTPS. A screening holds for 28 days. Three days before it runs out, or straight away if it never happened, a task goes to whoever is responsible for the activity, or to privacy administrators. Recording the next screening closes it.

### What the platform will not do

It will not hold your mailing lists or suppression lists, send anything, or tell you a campaign is lawful. It holds what each activity relies on, the reasoning, and what is still to be shown.

**See also:** Data subject requests · The processing register (Article 30) · Cookies and similar technologies

<sub>Also searchable as: marketing, direct marketing, email, newsletter, sms, text, phone, calls, pecr, regulation 21, regulation 22, soft opt-in, charity, tps, ctps, telephone preference service, opt out, unsubscribe, objection, duaa, consent</sub>

## The AI register

*Every AI system the organisation is accountable for, including the ones nobody has assessed.*

**Screen:** `/app/ai`

### Record it before you assess it

The register deliberately accepts a system with almost nothing filled in, and does not require an owner. A register that only holds assessed systems cannot tell you what is running unexamined, which is the question worth asking.

That includes AI inside a product bought for something else. Those are the hardest to find and the least likely to have been assessed.

### What the flags mean

Red flags mean a system is running unexamined: never assessed, live with nothing monitoring it, or deciding without human oversight. Amber flags are gaps worth closing but not alarming on their own.

Retired systems are history and are counted separately, so they cannot pad the number of systems you are covering.

### Who answers for it, and when it comes back

Each system can name two people. The senior responsible owner answers for the system. The AI governance officer runs its risk management day to day, as the DSIT AI Risk Management Toolkit describes. One person may hold both, and a leaver's handover moves both.

How it is deployed — a public app, AI inside bought software, a provider's API, a model you host or train — follows the UK government AI Playbook's security guidance, because each carries different exposure.

Approving an assessment of a system sets its next review from the assessment's cycle, sooner if the assessor asked for it. When that date passes, AI governance is given a task to look at it again.

### Moving it through its lifecycle

A system can be added at whatever stage it is really at. Moving it live afterwards — into pilot, or from pilot to production — is checked: it needs a named owner and an approved AI assessment that is not past its review and was approved after the last change to the model, data or use.

If the system's approved DPIA says high risk remains after mitigation, it also needs the Information Commission's advice recorded on that DPIA: Article 36 requires prior consultation before the processing starts.

Where those are missing, somebody who decides approvals can let it go ahead with a reason. The move is recorded with what was missing and why, so the history shows a system that went live without an assessment did.

Record any change to the model, its data or its use. A model change needs how it was validated and how it would be rolled back. Every change brings the system's review forward, and it shows as changed since assessed until it is assessed again.

### Risk profile and the AI risk log

Each system's risk profile shows every risk raised from its assessments or tied to it by an incident, grouped by DSIT's nine categories, with the worst inherent and residual rating in each, how many sit outside appetite, and what is being done about each.

The AI risk log export lists every AI risk across every system in one file — the central log DSIT's toolkit asks departments to keep and share with GDS and DSIT.

### Testing and assurance

Record evaluations, red-team, bias and security tests, user research, and model and data cards against each system. A test lists what it measured and the limit each measure was held to; it cannot be recorded as passed while one of its own measures missed its limit.

Say whether the people who ran it were independent of the team that built the system — DSIT's toolkit asks for that for bias testing and red-teaming. Live systems never tested, systems rated high or critical with no independent test, and systems whose latest test failed all show on the register. The latest evaluation also starts the model performance section of an ATRS record.

### Bought-in systems and their suppliers

A system called over a provider's API, used as their web app, or switched on inside their product is only as well governed as its supplier. Name the supplier from the third-party register; until you do, the system shows as bought in with no supplier recorded, and once you do, it shows until the supplier's AI supply has an approved assessment.

Start assessments from the system's own page, so they are tied to it and the register reads what they conclude.

**See also:** The AI assurance chain · Assessments: DPIAs, transfer risk, AI risk, screening · The risk register · Third parties and processor agreements (Article 28)

<sub>Also searchable as: ai, model, llm, machine learning, shadow ai, lifecycle, oversight</sub>

## Proposals to use AI

*Ideas for using AI, captured before anything is built or bought, scored on value and feasibility, and decided with a reason.*

**Screen:** `/app/ai/intake`

### Proposing

Anyone in the organisation can propose a use of AI. Four things are required, because the AI Playbook says they decide whether AI is the right tool at all: the need it meets, why AI rather than something simpler, what it should achieve, and its environmental impact. User research, data, skills and a stakeholder plan can be added as they become known.

Say if members of the public would use it, if it would inform decisions about people's health, safety, rights or entitlements, and roughly what it would cost. Those raise cautions for whoever decides: the Playbook's advice against AI making significant decisions on its own, and the spend control thresholds — £100,000 for anything public-facing, £1 million otherwise.

### Scoring and deciding

Whoever manages the register scores value and feasibility from 1 to 5. Four or more on both is pursue now; high value but hard is worth investing in; easy but modest is just that; neither is not now. The list puts unscored proposals first, then the rest by priority.

Accepting needs a score and a reason, and puts the system on the AI register at the proposed stage, carrying the need and benefits with it. Declining and deferring need a reason too. A deferred proposal can be decided again; accepted and declined are final, and what was proposed is never rewritten.

**See also:** The AI register · AI incidents and concerns

<sub>Also searchable as: intake, proposal, idea, use case, business case, prioritise, value, feasibility, environmental, pipeline</sub>

## The AI assurance chain

*Each AI system drawn through to what was done about it — and, more usefully, where that chain stops.*

**Screen:** `/app/ai/graph`

### Reading it

Four columns: the system, what assessed it, the risks that raised, and what treated them. A dashed box is where the chain stops.

It is drawn from how records actually connect — an assessment names its subject, a risk names the assessment that raised it — so attaching an assessment to its subject when you start it is what makes a system appear here properly.

### Why some gaps are red and others are not

A gap counts as serious once the system is running. A proposal nobody has assessed is a queue; the same gap on something in production is not, and colouring them identically would bury the second in the first.

An untreated risk is serious when its residual rating is high or critical. An expired acceptance is always serious — it means a risk is running unaccepted while the status column still says otherwise.

**See also:** The AI register · The risk register · Assessments: DPIAs, transfer risk, AI risk, screening

<sub>Also searchable as: graph, assurance, coverage, chain, orphan, unassessed, visualisation</sub>

## AI incidents and concerns

*Reports about AI systems — failures, harm, challenges to outcomes and concerns — each handled by a named person.*

**Screen:** `/app/ai/incidents`

### Reporting

Anyone in the organisation can report something about an AI system, whatever their role: an incident where it failed or misbehaved, harm to someone, a challenge to an outcome from somebody affected, or a concern. If you are not sure which system it is, say so — whoever triages it will work it out.

Tick confidential to keep your name from everyone but the person handling it, the privacy administrators and the organisation's owners. The report itself is still visible, without the name, and the audit log does not name you either.

### Handling

A report goes to the system's AI governance officer, else its owner, else to AI governance, with a task due within two days. They triage it — how serious, whether harm is actual, who handles it, and the risk it belongs to — then take it through investigation to resolution. Every step needs a note, and the timeline cannot be edited.

Resolving needs an outcome. For a challenge, that is the decision a person reached and what was put right — the human review UK GDPR Article 22C and the AI Playbook ask for. A system with actual harm reported and not yet resolved shows as a serious gap on the register.

**See also:** The AI register · The risk register

<sub>Also searchable as: incident, harm, complaint, challenge, appeal, redress, whistleblowing, concern, contest</sub>

## NIST AI RMF profile

*Where the organisation stands against each of NIST AI RMF's 72 subcategories, where it means to be, and the gap between.*

**Screen:** `/app/ai/profile`

### Current and target

NIST describes an organisation's position as a current profile and a target profile. Here they sit side by side: for each subcategory, where the organisation is now and where it means to be, each as not started, partly, achieved or not applicable.

A subcategory is short of target when the target is partly or achieved and the organisation is not there yet. Not assessed counts as not started, because nobody can show it is met.

### Evidence in Govern

Under each subcategory are the parts of Govern that go towards it, with how many records each holds: the AI register towards GOVERN 1.6, approved equality impact assessments towards MEASURE 2.11, and so on.

They are counted, not judged. Holding records shows the means are in place; whether the outcome is met is for whoever sets the status to say, and the profile records who did.

### The Playbook

Each subcategory carries the NIST AI RMF Playbook's suggested actions and the questions it suggests documenting, as a starting point for deciding what achieved means here. The Playbook is voluntary; borrow what fits.

### Who sets it, and who sees it

AI governance, the AI governance lead, privacy administrators and owners, holding their role across the whole organisation, set statuses and notes. Every change is in the audit log. Anyone who can read records can see the profile and download it as a spreadsheet.

The profile is there whichever framework the organisation follows, so an organisation on the UK framework can still show where it stands against NIST.

**See also:** AI governance framework · The AI register · Exports

<sub>Also searchable as: nist, ai rmf, profile, current, target, gap, subcategory, govern, map, measure, manage, playbook</sub>

## Algorithmic transparency records

*The public record of how an AI system is used, in the Algorithmic Transparency Recording Standard's own fields.*

**Screen:** `/app/ai`

### When one is needed

Central government departments, and arm's length bodies in scope, must publish a record for algorithmic tools that significantly influence decisions affecting the public or interact with the public directly. Other public bodies are encouraged to. Each AI system on the register says whether a record is required, voluntary or not in scope.

A live system whose record is required and has none shows a gap on the register. A draft does not close it — it is not public yet.

### Writing it

A record starts from what is already known: the register entry, the system's approved assessments, and the risks raised from them with their mitigations. Every field follows the template's own numbering. Read each one — once approved it is a public statement.

The model and development data sections may be left blank for an off-the-shelf model you did not train, tune or test, as the template allows. Everything else the template needs must be filled in before approval.

### Approval and publication

Somebody with the approver role, other than the person who started the draft, approves it. The approved content is then frozen. Export it in the template's layout, send it to DSIT, and once it appears in the repository record where.

To change a record, start a new version. It begins from the one in force, and approving it supersedes the old version, which stays on the record.

**See also:** The AI register · Exports

<sub>Also searchable as: atrs, algorithmic transparency, recording standard, public sector, dsit, gov.uk, publish</sub>

## Countries, UK approval and transfers

*One shared library of destinations, with UK approval, EU adequacy and transfer risk, and a date showing when each was last checked by a person.*

**Screen:** `/app/countries`

### What the library holds

Since 5 February 2026, sending personal data outside the UK needs one of three things (UK GDPR Article 44A): a transfer approved by UK regulations under Article 45A — what used to be called adequacy regulations — a safeguard under Article 46 such as the IDTA or the UK Addendum, or an Article 49 derogation. This library is where the first question is answered from, for every assessment and every processing record.

It holds whether the UK approves each destination, whether the EU finds it adequate, transfer risk, and when each entry was last reviewed. Some entries are conditional — a destination approved only for organisations certified under a particular framework is not approved for everybody, and the library says so rather than rounding it up. The stored statuses did not change with the law; only the words did, so older records still read correctly.

Relying on an Article 46 safeguard now means applying the data protection test: acting reasonably and proportionately, you must consider that protection after the transfer would be not materially lower than in the UK, judged on everything about the transfer, including the nature and volume of the data. The UK transfer risk assessment asks for that judgement, the steps behind it, and what you will do if the test is not met.

### Seeded is not verified

Entries loaded from the seed are marked as never checked by a person. Approvals and adequacy decisions change, and an assessment that cites a stale entry is worse than one that cites nothing. The library flags its own staleness and the sweep raises a monthly task while entries remain unchecked.

Your organisation can override a shared entry. An override applies to you alone.

### When nothing is loaded

An empty library escalates every transfer rather than clearing it. If every transfer suddenly needs safeguards, check whether the library has been loaded before assuming the world got worse.

**See also:** The processing register (Article 30) · Approving, returning and rejecting · Third parties and processor agreements (Article 28)

<sub>Also searchable as: adequacy, transfer, scc, idta, third country, chapter v, approved, 45a, data protection test, not materially lower, addendum, safeguard, dpf, outside the uk, uk, international transfer, restricted transfer, overseas, eu</sub>

## Scan findings

*Observations pushed in by scanning tools, waiting for a person to decide whether each is a risk.*

**Screen:** `/app/findings`

### An observation is not a risk

A scanner reports what it saw: a cookie set before consent, a tracker calling a third country. Whether that is a risk depends on context the scanner does not have. So findings arrive in a queue and become risks only when a named person converts them.

Dismissing one asks for a reason, and the reason is recorded. 'We looked and decided no' is a governance position; silence is not.

**See also:** The risk register · Third parties and processor agreements (Article 28) · Connected tools

<sub>Also searchable as: scan, har, cookie, tracker, consent, convert, dismiss, analyser</sub>

---

# Seeing where you stand

## The governance overview

*Posture now: what needs attention, risk before and after treatment, the assessment pipeline and service levels.*

**Screen:** `/app/dashboard`

### Reading it

The attention tiles are the actionable part. Risk posture shows inherent against residual, so the gap between them is what treatment has actually achieved rather than what was planned.

Everything is scoped to what you can see. Two people looking at the same dashboard with different grants will honestly see different totals.

**See also:** Trends · The risk register · Service levels and things that come round again

<sub>Also searchable as: dashboard, overview, posture, pipeline, metrics, attention</sub>

## Trends

*Twelve months of posture, reconstructed from when each record was raised, decided and closed.*

**Screen:** `/app/trends`

### Where the history comes from

From the records themselves rather than from a sampling job, so the history goes back as far as your records do rather than to the day somebody remembered to start sampling.

Months before your first record are empty because the platform was not in use then, not because nothing happened.

### What it will not show you

There is no chart of open risks by tier. A residual rating is re-judged over time and only the current value survives, so charting it by month would apply today's severity to last spring and present it as history.

Days to decide is a median, and a dash means nothing was decided that month — which is different from a decision that took no time.

**See also:** The governance overview · Exports · Service levels and things that come round again

<sub>Also searchable as: trend, history, chart, over time, cycle time, throughput, board</sub>

## Reviews that come round again

*Approved assessments carry a review date, and both the owner and the people who approved it are reminded.*

**Screen:** `/app/reviews`

### How a review date is set

When an assessment is approved, the platform reads the review cycle from the template it ran on and sets the date. A DPIA comes round every twelve months, a screening every twenty-four. A template that declares no cycle produces no review — the platform does not invent one on the organisation's behalf.

The date is on the assessment and can be brought forward. A controller may have its own reason to revisit sooner than the cycle says.

### Who is reminded

Two different people, because reassessing and reapproving are different jobs. The owner is asked to redo the work. Everybody who decided an approval gate is asked to decide again, and they are found from the approvals themselves rather than guessed at when the date was set — membership changes over a year, and the record of who actually signed it off does not.

### Overdue reviews are everybody's business

The recurring reviews page shows everything you can read, not only what is assigned to you. An approved assessment past its review date is one the organisation is still relying on without anybody having confirmed it is still true, so an administrator sees every one — including those belonging to colleagues who have not acted.

The scheduled sweep also raises a monthly reminder while any remain overdue. It nags monthly rather than hourly, and it does not stop until they are dealt with.

### Approved with no review date

Shown separately rather than hidden. Either the template sets no cycle, or the assessment was approved before review dates existed — and an assessment nobody will revisit looks identical to one nobody needs to unless the difference is stated.

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · Approving, returning and rejecting · Service levels and things that come round again · Assessment templates

<sub>Also searchable as: review, reassess, reapprove, recurring, expiry, annual, overdue, stale</sub>

## Service levels and things that come round again

*Due dates, breaches, and the hourly sweep that raises recurring work.*

### The sweep

Runs hourly and does everything that happens because time passed: turns schedules into tasks, flags lapsed risk acceptances, chases overdue mitigations, records service-level breaches, and raises reviews for stale country entries and lapsing processor agreements.

It never changes a governance decision. It raises tasks and names people; a human still decides.

### Breaches

A breach is recorded against the organisation, not against a person. It exists to show where the process is under-resourced. Suppressing it would remove the only evidence that a service level was unrealistic.

**See also:** Tasks, and being mentioned · Trends · The risk register

<sub>Also searchable as: sla, breach, overdue, recurring, review, schedule, sweep, cron</sub>

## Exports

*Spreadsheets of anything you can see, scoped to your access, and recorded when taken.*

**Screen:** `/app/exports`

### What you get

A flat CSV that opens in whatever the recipient already has. The processing register comes out in Article 30 order so a reader can check it against the Regulation. Completeness columns come from the same code the screens use, so a spreadsheet cannot disagree with the app about which records are deficient.

### The audit export

It carries a manifest so the recipient can verify the hash chain themselves. Tamper-evidence a recipient has to take your word for is a claim, not evidence. If the chain is incomplete for the range requested, the file says so rather than presenting a partial extract as whole.

### Exports are recorded

Taking the risk register out of the building is an act worth knowing about, so each export is written to the audit log with who took it and how many rows.

**See also:** The audit trail · Trends · The processing register (Article 30)

<sub>Also searchable as: csv, download, spreadsheet, excel, report, regulator, evidence</sub>

## The audit trail

*An append-only record of who did what, hash-linked so an altered entry breaks everything after it.*

### How it works

Every decision writes an entry carrying a hash of the one before. Changing an old entry would require recomputing every entry since, and the verification tool checks exactly that.

Entries are never edited or deleted. A withdrawn comment or a superseded assessment leaves its history intact.

### What it is for

So that the answer to 'who decided this, when, and on what basis' does not depend on anybody's memory or goodwill. That is also why the platform records rationales rather than just outcomes.

**See also:** Exports · Approving, returning and rejecting · The risk register

<sub>Also searchable as: audit, log, hash, chain, tamper, evidence, verify, history</sub>

---

# Setting it up

## Assessment templates

*The question sets, versioned, so an assessment always shows the questions it was actually answered against.*

**Screen:** `/app/templates`

### Versions matter

Publishing a new version never alters assessments already under way. An assessment records which version it used, so reading an old one shows the questions as they stood — not today's questions with yesterday's answers pasted under them.

### Routing rules

A template carries the rules that decide which approvals an answer set triggers. That is why two assessments from the same template can need different sign-off.

### Templates Waivern releases later

When Waivern ships a new template — the AI risk identification following DSIT's toolkit, for example — the library offers to add it. Adding it publishes it as a version of its own, alongside the legal references it cites. Nothing you already hold changes, including copies you have edited.

When Waivern updates a template you already have, the library says which, and offers to publish the update as its next version. Assessments already started keep the version they ran against. A template with an open draft is left until the draft is published or abandoned.

### Equality impact assessments

The equality impact assessment follows the public sector equality duty: impact on each of the nine protected characteristics in turn, then the duty's three aims, then a decision. An impact nobody has looked into scores almost as badly as an adverse one. Where AI is involved it asks whether performance was measured across groups, as the AI Playbook suggests. Start one from an AI system's page to tie it to the system.

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · Approving, returning and rejecting

<sub>Also searchable as: template, version, questions, publish, routing, dpia template, equality, eia, psed, update</sub>

## Who approves what, and changing it

*Approvers are named by role rather than by person, so a departure is handled by moving the role — and both are managed on one screen.*

**Screen:** `/app/admin/workflows`

### Where the approver is defined

On the approval workflow for that kind of assessment. Each stage names a role — privacy analyst, approver, AI governance — and anyone holding that role in the assessment's entity may decide it. Owners may decide anything, and an AI governance lead may decide what AI governance may.

Deliberately a role and not a person. Naming a person means every leaver strands a queue of assessments waiting on somebody who no longer works here, and every reorganisation becomes a data migration. Naming a role means a departure is handled by moving the role: the gates follow.

That model was always right and entirely invisible — nothing showed which role decided a gate. The screen now shows the rule and the people it currently resolves to, side by side.

### When nobody holds the role

A gate whose role nobody holds does not fail. It waits, indefinitely and quietly. The screen shows those at the top, because a stalled approval looks identical to one somebody is still thinking about.

A suspended member does not count. Withdrawing access removes their ability to decide, which is the point — but if they were the only holder, the gate now has nobody.

### Changing a stage

You can change what a stage is called, which role decides it, how long they have, and — for the simple rules — when it applies. Rules that combine several conditions are shown in English but not offered for editing: rebuilding one in a form is how a rule nobody fully read gets replaced.

Changing the role redirects the approvals already waiting on that stage, because an assessment sitting with the wrong approver is the problem being solved. Approvals already decided keep their own record of who was entitled to decide them, so the history does not move.

### Boards and committees

A stage can be a board's or committee's decision — an AI governance board, an ethics committee — rather than one person's. Somebody holding the stage's role records it, and must give the meeting and minute that decided; the record says the board decided, not the person typing it in.

The shipped AI risk workflow ends with an AI governance board, as the UK government AI Playbook recommends, for anything rated critical or over the spend at which government digital spend control needs assurance: £100,000 for anything public-facing, £1 million otherwise. The DSIT AI risk identification template asks for the expected spend so the rule has a figure to read.

To bring a board or committee into a workflow you have already tuned, add a stage rather than restoring the shipped ones. It goes at the end and applies from the next submission. A stage can also apply when an answer reaches a number, such as a spend threshold.

### When somebody leaves or moves team

Approvals need nothing: revoke the role and every gate they were holding moves with it.

Everything named against them individually is the problem — tasks assigned to them, and records they own. Those do not move when access is withdrawn; they simply stop happening. Worse, a record owned by a suspended person still counts as owned, so nothing reports it as a gap.

People and access shows what each person is holding and offers a handover: it moves their open tasks and owned records to a named colleague, in one act, recorded in the audit trail. Finished work and decided approvals stay where they are, because they are a record of what happened.

Handover is offered for everybody, not only the suspended. The case that goes wrong most often is somebody who moved teams and still owns forty records, because nobody ever suspends them and nothing prompts the question.

### Workflows added after your organisation was set up

When a new kind of assessment ships with its own workflow, organisations created earlier do not have it, and assessments of that kind can be submitted but never approved. This page says so and offers to install it. Installing adds only what is missing; workflows you have already changed are left alone.

**See also:** Approving, returning and rejecting · Giving somebody access · Roles, and why you cannot see something · Service levels and things that come round again

<sub>Also searchable as: approver, approval, workflow, stage, gate, sign-off, who approves, leaver, left the company, moved teams, handover, reassign, sla</sub>

## AI governance framework

*Whether AI risk follows the UK framework or NIST AI RMF, and what changes when the organisation moves from one to the other.*

**Screen:** `/app/admin/ai-framework`

### What the framework decides

The categories AI risks are filed under and appetite is set against, the appetite guidance shown beside each level, the treatments suggested on a risk, and the AI risk identification template offered.

The UK framework uses the nine categories of DSIT's AI Risk Management Toolkit. NIST AI RMF uses its seven characteristics of trustworthy AI, plus Financial and Legal and regulatory compliance, which keep the same meaning in both. Its template follows Map and Measure, and every question cites the NIST subcategory it serves.

UK law applies whichever is followed. The NIST template still asks about the DPIA, solely automated decisions, the equality duty and transparency records.

### Who can change it

An owner, a privacy administrator or an AI governance lead, holding the role across the whole organisation. A role confined to one legal entity can see which framework is followed but not change it.

### What a switch does

Choose a framework and the page shows what would change before anything does. Confirming then does three things.

Risks are re-filed. Each risk under one of the old framework's categories moves to the nearest category in the new one, and the move is recorded against the risk. Risks under Financial, Legal, or a category of the organisation's own stay where they are.

Appetite is proposed, not carried over. An appetite statement is a decision an approver signed, so for each new category the old statements map into, the most cautious of them is proposed again for an approver to decide. Until one is signed off, risks in that category are judged against the organisation default.

The new framework's template is installed. Templates already held stay available, and assessments under way keep the template version they started on.

### Moving back

Nothing is deleted, so switching back is the same operation the other way: risks are re-filed again, and appetite statements already signed off for the old categories still stand.

**See also:** Risk appetite · The risk register · Assessment templates · Who approves what, and changing it · NIST AI RMF profile

<sub>Also searchable as: framework, nist, ai rmf, dsit, playbook, trustworthy, characteristics, crosswalk, switch</sub>

## Connected tools

*Signed endpoints that let the Compliance Portal and scanning tools push records in and pull current state out.*

### Both directions

Tools push processing activities, vendors, processor agreements, evidence, AI systems and scan runs. The Portal pulls current state back out, incrementally, to generate documents from facts rather than from events it may have missed.

Every request is signed and every connection is limited to the endpoints its kind needs. A scanner may push vendors, because a tracker on a page is a third party; it may not push assessments.

### Records that arrive from a tool

They are marked as such throughout. A scanner can see what data moves; it cannot see why, so purposes and lawful basis still need a person. Processing activities that arrived from a connection are counted separately on the register for that reason.

### AI systems from the Portal

The Portal can record AI systems on the AI register and refresh what they are — name, purpose, type, deployment, model and data. It sets a system's stage only when first recording it. Who owns a system, its governance officer, its transparency scope, its review date and its stage are decisions taken here, and a later push never changes them.

The Portal reads the register back, with each system's gaps and its latest approved assessment, so documents it generates say what is and is not in place.

**See also:** Scan findings · Third parties and processor agreements (Article 28) · The processing register (Article 30) · The AI register

<sub>Also searchable as: api, integration, portal, har analyser, webhook, sync, connection</sub>

## The organisation and its legal entities

*What this organisation is called, the legal entities within it, and who may add them.*

**Screen:** `/app/admin/organisation`

### Where the name appears

In the masthead on every page, on the provenance header of every export, and in the manifest that ships with an audit extract. It is a governance-visible fact rather than a label, which is why renaming is written to the audit log — a register exported last month under one name and this month under another should be explicable.

### What renaming leaves alone

The short reference — the slug — stays as it is. The `grant` script uses it, and so does anything an administrator has written down. A display name changing should not break either.

Legal entities are named separately, below.

### Legal entities

An organisation holds one or more legal entities — for the BBC, BBC Public Service and BBC Studios. They are the companies or bodies records are classified, reported and access-scoped by; services, products and departments are not entities. Records arriving with no entity named land in the default one.

An owner of the whole organisation adds entities, renames them and chooses the default, on the Organisation page. Nobody else can — not privacy administrators, and not an owner confined to one entity, who sees the list only. Every change is in the audit log.

Renaming keeps every record with its entity. The Portal and any script that names an entity does so by its name or its reference, so tell them the new one; for the same reason no two entities may share a name or reference. Entities cannot be removed, because records and their history point at them.

### Public authorities and the data protection officer

Mark an entity as a public authority where it is one within the Data Protection Act 2018 s.7 — broadly, a body under the Freedom of Information Act. Two things follow. For processing in the performance of its tasks it may not rely on legitimate interests or recognised legitimate interests (UK GDPR Article 6(1)), so a ROPA record that does is shown in red; where the processing is genuinely not one of its tasks, the record can say so. And it must have a data protection officer (Article 37(1)(a)).

Record the data protection officer on the Organisation page: their name, how to reach them, whom they report to and whether their details are published. An entity can have its own; otherwise the organisation's acts for it. A public or competent authority with none is flagged here and on the ROPA. Where the DPO is a member who may decide it, the 'Data protection officer' approval stage goes to them by name; otherwise it stays with the role. The DPIA asks whether the DPO's advice was sought and what it was (Article 35(2)).

### Which data protection law each entity is subject to

Say for each entity whether it is subject to UK law, EU law, or both. An entity starts as subject to UK law. Part 2 of the Data Protection Act 2018 supplements the UK GDPR, so any entity subject to the UK GDPR is subject to the Act too, along with PECR; one subject to EU law only — a company in an EU member State with no UK establishment and no UK-targeted processing — is subject to none of them.

For an entity subject to EU law only, the Act's own questions and flags are not shown: the Schedule 1 conditions and appropriate policy document on its processing records (Article 10 offers Union or Member State law instead), the data sharing code, the Schedule 2 and 3 exemptions and health opinion on its requests, and the public authority, competent authority and PECR settings. Requests to it are handled under EU law. Where no entity is subject to UK law, the policy document and sharing agreement registers, the UK data protection templates and the s.164A complaints step are not offered either.

Narrowing an entity to EU law only is refused while it is marked as a public authority, competent authority or public communications provider, since those are UK law. Answers already recorded under UK law are kept, not cleared, so widening it again finds them.

### Competent authorities and law enforcement processing

Mark an entity as a competent authority where it is one for some of its functions: a body listed in Schedule 7 of the Data Protection Act 2018, such as a police force, or one with statutory functions for a law enforcement purpose (s.30). Its processing for those purposes falls under Part 3 of the Act rather than the UK GDPR, and it must have a data protection officer (s.69).

Say also which regime its new processing records start under. A police force's investigations are Part 3; its staff and finance records stay under the UK GDPR. Each record can be moved either way afterwards. Once an entity is a competent authority, the law enforcement DPIA and transfer assessment templates are offered through 'Waivern has updated templates'.

### Who creates what

Legal entities within an organisation are its owners' to add. A new organisation — a separate account with its own people, registers and audit log — is not: whoever will own it signs in and asks, and Waivern approves the request. No owner, here or elsewhere, can create an organisation.

### Email domains

An owner can claim the organisation's email domain, such as example.gov.uk. Once it is verified, anyone who signs in with Google using an address at it joins as a contributor without being invited; you can give them more from People.

To verify, publish the TXT record Settings shows you, at _govern-verification. followed by the domain, then press Check now. Only whoever runs the domain's DNS can publish it, which is the proof. A verified domain belongs to one organisation only, and public email domains such as gmail.com cannot be claimed.

Somebody you have removed is never let back in by their address. Removing a domain stops new people joining through it; nobody already in loses access.

Google must have verified the address itself, or the sign-in is refused. Joining by domain works only through Google: other sign-in providers do not prove that a person controls the mailbox.

**See also:** Giving somebody access · Exports · The audit trail

<sub>Also searchable as: organisation, company, client, rename, name, branding, tenant, entity, legal entity, subsidiary</sub>

## Giving somebody access

*Grant a role, confine it to one entity, suspend or reinstate. Every change is written to the audit log.*

**Screen:** `/app/admin/people`

### How somebody gets in

Granting access records the person and the role; it creates no password. They sign in with the organisation's identity provider, and the first time they do, their account is matched by email address.

Somebody who already has access keeps what they have and gains the new role as well. Roles add up, so grant the narrowest one that lets them do the job.

### Confining a role to one entity

A role granted against an entity applies only there. An approver for BBC Studios cannot decide an approval elsewhere, and will be told a record belongs to another part of the organisation rather than shown an empty page.

### Suspending, and the last owner

Suspending keeps the person and their history and stops them signing in. Reinstating restores exactly what they had.

The last active owner cannot be suspended or stripped of that role. An organisation that locks itself out needs a database console to get back in, which is not a state a button should be able to produce.

**See also:** Roles, and why you cannot see something · Why your screens look different from a colleague's · The audit trail

<sub>Also searchable as: invite, user, member, grant, revoke, suspend, admin, onboard, offboard</sub>

## The assistant, and what it may not do

*Optional help from a model your organisation chooses and controls. It drafts and explains; it never decides.*

**Screen:** `/app/admin/assistant`

### It is off until you configure it

There is no default endpoint. Until an organisation points the platform at a model it controls and switches on a surface, nobody sees an assistant anywhere.

The endpoint is yours: Azure OpenAI, an OpenAI account, Anthropic, or anything OpenAI-compatible you host. The key is stored encrypted and is never shown again.

### What it may do

Explain what a question or a record means, draft wording for you to edit, and point at where something is recorded. Answers are proposals. Nothing reaches a record until you write it yourself, and that act is what the audit log attributes to you.

### What it may not do

Rate a risk, decide whether a DPIA is required, approve or accept anything, state that a country is adequate, or confirm that a supplier is a processor. Those are decisions a named person must make and attest to.

The rule it follows: where the platform would escalate a question rather than answer it, the assistant does not answer it either.

### What is sent, and what is kept

On an assessment it is given the template's questions and never your answers. In help it is given the built-in help topics and no records at all.

Obvious identifiers — email addresses, telephone numbers, postcodes, card and national insurance numbers — are removed from a question before it is sent, and you are told what was removed. That catches shapes, not meaning: it will not notice a sentence about a named person's health. Do not type such things.

Conversations are kept for thirty days and then deleted by the scheduled sweep.

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · What this is, and what it is not · The audit trail

<sub>Also searchable as: ai, model, chat, assistant, llm, openai, azure, anthropic, prompt</sub>
