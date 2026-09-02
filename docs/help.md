# Waivern Govern — help

Every help topic the application carries, in the order it presents them.

> Generated from `src/lib/help/topics.ts` by `pnpm help:md`.
> Edit the topics file, not this one.

## Contents

**Getting your bearings**

- [What this is, and what it is not](#what-this-is-and-what-it-is-not) — A workflow tool for privacy and AI governance: it routes work, records decisions, and keeps an audit trail nobody can quietly edit.
- [Why your screens look different from a colleague's](#why-your-screens-look-different-from-a-colleagues) — A persona changes what you are shown first and in whose words. It never changes what you are allowed to see or do.
- [Roles, and why you cannot see something](#roles-and-why-you-cannot-see-something) — Access is granted per role, and can be scoped to a single entity. Two powers are deliberately held apart from the rest.
- [Tasks, and being mentioned](#tasks-and-being-mentioned) — Everything waiting on you, whether it names you directly or waits on a role you hold.

**Doing the work**

- [Assessments: DPIAs, transfer risk, AI risk, screening](#assessments-dpias-transfer-risk-ai-risk-screening) — Answer a template, submit it, and it routes to whoever must approve — with the gates chosen by what your answers said.
- [Approving, returning and rejecting](#approving-returning-and-rejecting) — Gates are chosen by the assessment's own answers, and only an approver can decide one.
- [Asking somebody without an account](#asking-somebody-without-an-account) — A single-use link that lets a named person answer specific questions without signing in or seeing anything else.
- [The risk register](#the-risk-register) — Rate a risk, treat it, then rate what remains. Accepting one is a decision with a name and an expiry date on it.
- [Discussion and mentions](#discussion-and-mentions) — Ask a question beside the record it is about, and name the person who can answer.

**The registers**

- [The processing register (Article 30)](#the-processing-register-article-30) — Every processing activity, checked against what Article 30 actually requires rather than against whether the form was filled in.
- [Third parties and processor agreements (Article 28)](#third-parties-and-processor-agreements-article-28) — Every processor you rely on, whether or not anybody procured it, and whether a contract actually covers them.
- [The AI register](#the-ai-register) — Every AI system the organisation is accountable for, including the ones nobody has assessed.
- [The AI assurance chain](#the-ai-assurance-chain) — Each AI system drawn through to what was done about it — and, more usefully, where that chain stops.
- [Countries, adequacy and transfers](#countries-adequacy-and-transfers) — One shared library of destinations, with adequacy and transfer risk, and a date showing when each was last checked by a person.
- [Scan findings](#scan-findings) — Observations pushed in by scanning tools, waiting for a person to decide whether each is a risk.

**Seeing where you stand**

- [The governance overview](#the-governance-overview) — Posture now: what needs attention, risk before and after treatment, the assessment pipeline and service levels.
- [Trends](#trends) — Twelve months of posture, reconstructed from when each record was raised, decided and closed.
- [Service levels and things that come round again](#service-levels-and-things-that-come-round-again) — Due dates, breaches, and the hourly sweep that raises recurring work.
- [Exports](#exports) — Spreadsheets of anything you can see, scoped to your access, and recorded when taken.
- [The audit trail](#the-audit-trail) — An append-only record of who did what, hash-linked so an altered entry breaks everything after it.

**Setting it up**

- [Assessment templates](#assessment-templates) — The question sets, versioned, so an assessment always shows the questions it was actually answered against.
- [Connected tools](#connected-tools) — Signed endpoints that let the Compliance Portal and scanning tools push records in and pull current state out.
- [Giving somebody access](#giving-somebody-access) — Grant a role, confine it to one entity, suspend or reinstate. Every change is written to the audit log.
- [The assistant, and what it may not do](#the-assistant-and-what-it-may-not-do) — Optional help from a model your organisation chooses and controls. It drafts and explains; it never decides.

---

# Getting your bearings

## What this is, and what it is not

*A workflow tool for privacy and AI governance: it routes work, records decisions, and keeps an audit trail nobody can quietly edit.*

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

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · Roles, and why you cannot see something · Countries, adequacy and transfers

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

### Accepting a risk

Only an approver can accept, and only after a residual rating exists — there is nothing to accept until somebody has judged what remains. An acceptance carries a rationale and an expiry date.

When it expires the risk is not quietly re-accepted. The hourly sweep raises a task, and until somebody acts the risk reads as running unaccepted, whatever its status column says.

**See also:** Approving, returning and rejecting · Scan findings · The AI assurance chain

<sub>Also searchable as: risk, mitigation, residual, inherent, accept, tier, likelihood, impact</sub>

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

---

# The registers

## The processing register (Article 30)

*Every processing activity, checked against what Article 30 actually requires rather than against whether the form was filled in.*

**Screen:** `/app/ropa`

### Recording one

It asks four things to start: what the processing is called, why you do it, your role, and which entity. The rest lives on the record itself. A thin record that names its own gaps beats processing nobody wrote down.

### What the flags mean

Red items are unqualified Article 30 requirements — purposes, categories of data subject and of personal data, recipients, transfer safeguards, and the controller's identity where you act as processor. Missing any of those is a compliance failure, not untidiness.

Amber items are reported without being called a breach. Retention and security measures are qualified in the Regulation by 'where possible', so their absence is worth knowing and is not the same thing.

### Transfers

Each transfer needs a destination and, where that destination is not covered by adequacy, a safeguard. The check reads the country library. If the library is empty it escalates rather than clearing everything — an unanswerable question is never answered 'no'.

**See also:** Countries, adequacy and transfers · Third parties and processor agreements (Article 28) · Exports

<sub>Also searchable as: ropa, article 30, record of processing, purposes, lawful basis, retention, recipients</sub>

## Third parties and processor agreements (Article 28)

*Every processor you rely on, whether or not anybody procured it, and whether a contract actually covers them.*

**Screen:** `/app/third-parties`

### Where these come from

Some you record. Others arrive from a connected scanner, because a tracker seen on a page is a third party whether or not procurement knew about it.

A scanner cannot tell whether that party processes personal data on your behalf, is a recipient in its own right, or was a false positive. So a supplier it reported carries 'nobody has confirmed this is a processor' until a person presses the button saying they have looked. That button records that somebody looked; it does not assert that an agreement exists.

### What counts as covered

Article 28(3) requires processing to be governed by a contract. No agreement, an unsigned agreement and an expired agreement are reported as the same failure, because in substance they are.

Sub-processors and transfer mechanism are reported when missing but not called breaches — an empty sub-processor list may honestly mean none.

### Expiry is watched

The agreement in force is the unexpired one, and among those the most recently signed. An agreement with no end date is perpetual rather than incomplete.

Anything within six months of lapsing raises a monthly task. Six months because that is renewal lead time — a warning at ninety days arrives after the window to renegotiate has closed.

**See also:** The processing register (Article 30) · Countries, adequacy and transfers · Scan findings

<sub>Also searchable as: supplier, vendor, dpa, article 28, processor, sub-processor, contract, expiry</sub>

## The AI register

*Every AI system the organisation is accountable for, including the ones nobody has assessed.*

**Screen:** `/app/ai`

### Record it before you assess it

The register deliberately accepts a system with almost nothing filled in, and does not require an owner. A register that only holds assessed systems cannot tell you what is running unexamined, which is the question worth asking.

That includes AI inside a product bought for something else. Those are the hardest to find and the least likely to have been assessed.

### What the flags mean

Red flags mean a system is running unexamined: never assessed, live with nothing monitoring it, or deciding without human oversight. Amber flags are gaps worth closing but not alarming on their own.

Retired systems are history and are counted separately, so they cannot pad the number of systems you are covering.

**See also:** The AI assurance chain · Assessments: DPIAs, transfer risk, AI risk, screening · The risk register

<sub>Also searchable as: ai, model, llm, machine learning, shadow ai, lifecycle, oversight, eu ai act</sub>

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

## Countries, adequacy and transfers

*One shared library of destinations, with adequacy and transfer risk, and a date showing when each was last checked by a person.*

**Screen:** `/app/countries`

### What the library holds

Sending personal data outside the UK needs either a destination covered by adequacy or a safeguard such as the IDTA or SCCs. This library is where that question is answered from, for every assessment and every processing record.

It holds adequacy status, transfer risk, and when each entry was last reviewed. Some entries are conditional — a destination covered only for organisations certified under a particular framework is not covered for everybody, and the library says so rather than rounding it to 'adequate'.

### Seeded is not verified

Entries loaded from the seed are marked as never checked by a person. Adequacy decisions change, and an assessment that cites a stale entry is worse than one that cites nothing. The library flags its own staleness and the sweep raises a monthly task while entries remain unchecked.

Your organisation can override a shared entry. An override applies to you alone.

### When nothing is loaded

An empty library escalates every transfer rather than clearing it. If every transfer suddenly needs safeguards, check whether the library has been loaded before assuming the world got worse.

**See also:** The processing register (Article 30) · Approving, returning and rejecting · Third parties and processor agreements (Article 28)

<sub>Also searchable as: adequacy, transfer, scc, idta, third country, chapter v, safeguard, dpf, outside the uk, uk, international transfer, restricted transfer, overseas, eu</sub>

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

**See also:** Assessments: DPIAs, transfer risk, AI risk, screening · Approving, returning and rejecting

<sub>Also searchable as: template, version, questions, publish, routing, dpia template</sub>

## Connected tools

*Signed endpoints that let the Compliance Portal and scanning tools push records in and pull current state out.*

### Both directions

Tools push processing activities, vendors, processor agreements, evidence and scan runs. The Portal pulls current state back out, incrementally, to generate documents from facts rather than from events it may have missed.

Every request is signed and every connection is limited to the endpoints its kind needs. A scanner may push vendors, because a tracker on a page is a third party; it may not push assessments.

### Records that arrive from a tool

They are marked as such throughout. A scanner can see what data moves; it cannot see why, so purposes and lawful basis still need a person. Processing activities that arrived from a connection are counted separately on the register for that reason.

**See also:** Scan findings · Third parties and processor agreements (Article 28) · The processing register (Article 30)

<sub>Also searchable as: api, integration, portal, har analyser, webhook, sync, connection</sub>

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
