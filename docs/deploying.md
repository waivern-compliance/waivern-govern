# Deploying to Railway

Two services in one Railway project — the application and its Postgres — plus a
third that runs the scheduled sweep. Order matters in two places, both called
out below.

There is a `vercel.json` in the repository. It is correct for Vercel and
**completely inert on Railway**: the region pinning and the cron schedule in it
do nothing here. The cron is set up separately in step 10.

## Before you start

**How people sign in.** There is no password login. The app uses OIDC (Entra ID
or Google), and the local no-password bypass *refuses to build* in production on
purpose. Configure a provider, and grant yourself access in step 9, or nobody
can get in.

**Where the data sits.** Railway's regions are US East, US West, EU West
(Amsterdam) and Singapore. There is no UK region, so the database sits in the EU
rather than the UK. That is lawful — the EU holds UK adequacy, so the transfer
needs no separate safeguard — but it is a weaker claim than UK residency and
worth stating plainly rather than glossing. A buyer who requires the data to
stay in the UK needs a London-region provider instead.

## 1. Push to GitHub

```bash
gh repo create waivern-govern --private --source=. --remote=origin --push
```

Confirm nothing is outstanding — empty output means everything is pushed:

```bash
git log origin/main..main --oneline
```

And that no real secrets travelled. This should print `.env.example` and nothing
else:

```bash
git ls-files | grep '^\.env'
```

## 2. Create the project and the database

In Railway: **New Project → Deploy PostgreSQL**. Set the region to **EU West**.

Railway gives the Postgres service two connection strings:

| Variable | Host looks like | Reachable from |
| --- | --- | --- |
| `DATABASE_URL` | `postgres.railway.internal` | Inside this Railway project only |
| `DATABASE_PUBLIC_URL` | `<name>.proxy.rlwy.net:<port>` | Anywhere |

The internal one is the default for everything. You should end up pasting
neither: the application takes `DATABASE_URL` as a *reference* (step 5), and
one-off commands run inside Railway with `railway ssh` (below), where the
internal address already works.

`DATABASE_PUBLIC_URL` is the escape hatch — for `psql`, for a GUI client, or
when the service will not start and you need to look at the database from
outside. Reach for it deliberately, not by default. Copying it around is how a
password ends up somewhere it should not be.

## 3. Deploy the application

In the same project: **New → GitHub Repo → `waivern-govern`**.

Railway detects Next.js and builds it with Nixpacks. No `railway.json` is
needed; the default build and `pnpm start` are correct.

Under the service's **Settings → Networking**, generate a public domain. You get
something like `waivern-govern-production.up.railway.app`. You need it for the
next two steps.

## 4. Set up sign-in

Google is quicker; Entra ID is what a broadcaster would actually use.

**Google:** Google Cloud Console → **Create OAuth client ID** → *Web
application*. Add an **Authorised redirect URI** of exactly:

```
https://<your-domain>/api/auth/callback/google
```

The path matters — `/api/auth/callback/google`, not `/callback` or
`/api/auth/google`. Authorised JavaScript origins are not needed for this flow;
adding the domain there is harmless.

**Entra ID:** register an application, Web redirect URI
`https://<your-domain>/api/auth/callback/microsoft-entra-id`, create a client
secret, note the tenant issuer URL.

Only the provider you configure appears on the sign-in page.

## 5. Set the application's variables

On the application service → **Variables**.

**Set `DATABASE_URL` as a reference, not a pasted string:**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Substituting whatever your Postgres service is called. That resolves to the
internal address, so traffic never leaves Railway's network. Pasting the local
development string here is the most common way to break this, and it fails as
`ECONNREFUSED` at the first sign-in rather than at deploy — see
*Troubleshooting*.

Then:

| Name | Value |
| --- | --- |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<your-domain>` — no trailing slash |
| `INTEGRATION_KEY` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from step 4 |

**Do not set `ALLOW_DEV_SIGN_IN`.** The build fails if it is present in
production, deliberately: a no-password bypass that can reach production is
worse than no bypass at all.

Keep `INTEGRATION_KEY` safe. It decrypts the integration secrets; lose it and
every connection has to be reprovisioned.

`CRON_SECRET` is only needed if you intend to trigger the sweep over HTTP. The
scheduled job in step 10 does not use it.

## 6. Migrations

Set the service's **Settings → Deploy → Custom Start Command** to:

```
pnpm db:migrate:deploy && pnpm start
```

Migrations then run inside the container, on the private network, with the
service's own `DATABASE_URL`, every time it starts. If one fails the container
exits non-zero, so the deploy fails and the previous version keeps serving.

Leave **Pre-deploy Command** empty. It is the more natural home for this — it
runs once per deploy rather than once per replica — but on this project it is
displayed without being executed, which is worse than not setting it: a command
that looks like it is migrating your database while doing nothing is how a
schema silently falls behind. If you ever see evidence it does run, move the
migration there and drop it from the start command.

The same caveat applies to `railway.json`. A `deploy.preDeployCommand` there is
valid against Railway's published schema and was still never executed, so this
repository does not carry one. Configure the start command in the dashboard.

Because it runs per replica, keep this service at one replica, or move to a
mechanism that runs once. Two containers starting together would race for the
same migration.

This reverses an earlier decision in this document, which held that a migration
running automatically on every deploy is one that can take the API down at three
in the morning. Forgetting the manual step took this deployment down twice —
once on the `persona` column, once on the Article 30 columns — and a migration
that fails before the process starts cannot take a healthy version down; it
stops the new one replacing it.

What that does *not* do is make a destructive migration safe. Read the generated
SQL before pushing it. The gate stops a migration that errors; it cannot stop
one that succeeds at dropping a column.

`pnpm db:migrate:deploy` uses `drizzle-orm`'s migrator rather than `drizzle-kit`,
which is a development dependency and need not survive into a production image.
Locally, `pnpm db:migrate` still does the same job.

**Bootstrapping.** The very first deploy that introduces a migration cannot fix
itself: the running container is the old image, so `railway ssh` cannot reach the
new migration, and the new image will not pass its health check until the
migration is applied. Apply that one from your machine against the public string
— see the escape hatch below — then redeploy.

## Running one-off commands

Seeding, granting access and provisioning connections all need a database, and
your laptop cannot reach the private one. Rather than copy the public string
into each command, run the command where the database already is:

```bash
railway link          # once per checkout, to pick the project and service
railway ssh -- pnpm <script>
```

`railway ssh` runs inside the deployed service, so `DATABASE_URL` is already
set to the private address. Nothing is copied, and nothing can be pasted
wrong. The scripts tolerate a missing `.env.local`, which is why the same
`pnpm` script works on a laptop and in a container.

If you would rather run from your machine — because the service will not
start, say — the public string still works:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm <script>
```

The application refuses a private `.railway.internal` address when it is not
running on Railway, and says so, rather than failing with a DNS error that
looks like the database is down.

## 7. Seed

```bash
railway ssh -- pnpm seed
```

That creates the organisation, its legal entities, the people, the template
library and the approval workflows. Then, for a demonstration portfolio:

```bash
railway ssh -- pnpm seed:demo
```

`seed:demo` refuses to run twice — a second run would double every assessment
and quietly wrong every number on the dashboard.

## 8. Redeploy, and point the health check at the app

Redeploy the application service so it picks up the variables.

Then set **Settings → Deploy → Healthcheck Path** to `/api/health`.

Do this rather than leaving it on the port. A Next.js process binds its port and
reports ready before it has spoken to the database once, so "the container is
up" and "the application works" are different claims — and the gap between them
is a deployment that sits green while every page fails. `/api/health` answers the
second question: it returns 503 when the database is unreachable or when the
schema is behind the code.

```bash
curl https://<your-domain>/api/health
# {"status":"healthy","migrations":14,"expects":"0013_dizzy_wendell_rand"}
```

Then:

- `https://<your-domain>/sign-in` shows your provider and **no** development
  sign-in box. If the box is there, `ALLOW_DEV_SIGN_IN` leaked into production.

## 9. Give yourself access

Sign-in is invite-only. A valid Google or Entra ID token proves who you are, not
that you belong here. The seed only creates fictional `@example.bbc.co.uk`
people, so **until you do this, signing in with your real account is refused.**

```bash
railway ssh -- pnpm grant you@waivern.com --name "Your Name"
```

That grants `owner` across the organisation. Narrower grants take a role and,
optionally, an entity:

```bash
railway ssh -- pnpm grant analyst@example.com privacy_analyst
railway ssh -- pnpm grant approver@example.com approver --entity "BBC Studios"
```

Add `--persona` to set what their home leads with — one of
`privacy_governance`, `ai_governance`, `engineering`, `product`. It changes
presentation only, never access, and they can switch it themselves afterwards.
Left unset, it is derived from what they can do.

```bash
railway ssh -- pnpm grant lead@example.com contributor --persona engineering
```

The email must match the identity-provider account exactly. Re-running changes
nothing, so it is safe to use as a check.

Granting yourself `owner` includes `risk.accept`, but a risk cannot be accepted
by the person who owns it. On a demonstration tenant where you own everything,
use one of the seeded approvers to show acceptance working.

Now sign in.

## 10. Schedule the sweep

Nothing time-based happens without this: no service-level breaches recorded, no
lapsed risk acceptances flagged, no recurring reviews raised, no outbound
webhooks delivered. Everything else works; the half that depends on time does
not.

In the same Railway project: **New → GitHub Repo → `waivern-govern`** again — a
second service from the same repository.

On that service:

1. **Settings → Deploy → Custom Start Command:** `pnpm sweep:prod`
2. **Settings → Deploy → Cron Schedule:** `0 * * * *` (hourly)
3. **Settings → Deploy → Restart Policy:** *Never* — it is a job, not a server,
   and it is meant to exit
4. **Settings → Networking:** no public domain. It serves nothing.
5. **Variables:** `DATABASE_URL=${{Postgres.DATABASE_URL}}`. That is all it
   needs — it talks to the database directly rather than calling the web app, so
   it needs no secret and does not depend on the web tier being healthy.

The job is idempotent: running it twice, or retrying after a partial failure,
converges on the same state. A quiet run logs `nothing due`, which is the normal
case.

Its start command is its own, so it does not run migrations — only the web
service does (step 6). Leave it that way. Two services migrating on the same
deploy would race for no benefit, and this one is a job that should do one
thing.

To check it, trigger the service manually and read the log. You should see
something like:

```
BBC Group: 1 lapsed acceptance(s) flagged, 3 service-level breach(es) recorded
Swept 1 organisation(s) in 186ms.
```

`/api/cron/sweep` still exists and does the same work, for a scheduler that can
only make an HTTP request. It needs `CRON_SECRET` as a bearer token and refuses
everything when that variable is unset.

## Troubleshooting

**Every page fails but the platform says the service is online.**

Check `/api/health` first. `"reason": "behind"` means the code expects
migrations the database has not had. Since the pre-deploy command applies them,
this now means the migration step did not run or did not finish — check the
deploy log for `pnpm db:migrate:deploy`. To apply them by hand:

```bash
railway ssh -- pnpm db:migrate:deploy
```

No redeploy is needed; the code is already right and the database was behind
it.

**"That account cannot sign in" — or "Sign-in is not working right now."**

Two different faults, and the page distinguishes them. The second means the
membership lookup failed rather than refused; the cause is in the application
log. The most common is `ECONNREFUSED`, which means `DATABASE_URL` on the
application service is wrong — usually the local development string pasted in by
mistake. Use `${{Postgres.DATABASE_URL}}`.

The first means the address your identity provider presented is not registered.
The log records which one:

```
[auth] refused sign-in: no active membership for <address> (via google)
```

Grant that address. Two useful queries:

```sql
-- who is registered
select email from app_user;
-- sso_subject stays null until a matching sign-in succeeds, so null here means
-- nobody has ever signed in as that address
select email, sso_subject, last_seen_at from app_user;
```

**Google returns `redirect_uri_mismatch`.** The authorised redirect URI does not
exactly match `https://<domain>/api/auth/callback/google`, or `AUTH_URL` points
somewhere other than the domain being used.

## Afterwards

**Connections.** Railway's Postgres has no connection pooler in front of it, and
each application instance holds its own connections. Fine for a demonstration
and a single client; if concurrency grows, put PgBouncer in front of it.

**Integration credentials.** To issue them for the Portal or the HAR Analyser:

```bash
railway ssh -- pnpm provision
```

Secrets print once and cannot be read back.

**Reference data is not schema.** `pnpm db:migrate` creates tables; it does not
fill them. The shared country library is the one that matters: until it is
loaded, transfer routing has nothing to answer with and escalates every
transfer — safe, but wrong.

```bash
railway ssh -- pnpm seed:countries
```

Idempotent, so it is safe to run whenever you are unsure. `pnpm seed` on a fresh
deployment loads it too.

**Later schema changes.** Generate the migration locally with
`pnpm db:generate`, read the SQL it produces, and commit it alongside the code
that needs it. The pre-deploy command applies it on the next deploy, before the
new version takes traffic.

Read the SQL. That is not a formality: the gate stops a migration that errors,
not one that succeeds at dropping a column.

`/api/health` catches exactly that:

```json
{ "status": "unhealthy", "reason": "behind",
  "detail": "The database has 13 of 14 migrations. Run pnpm db:migrate." }
```

With the healthcheck path set, Railway refuses to cut over to a deployment whose
schema is behind, so a forgotten migration becomes a failed deploy rather than a
silent outage.
