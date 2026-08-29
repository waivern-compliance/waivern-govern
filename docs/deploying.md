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

Both are useful, for different things. The app uses the internal one; your
laptop has to use the public one.

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

## 6. Run the migrations

From your machine, against the **public** string — your laptop is outside
Railway's private network. Quote it; Railway passwords contain characters your
shell will otherwise interpret.

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm db:migrate
```

Migrations are deliberately not part of the build. One that runs automatically
on every deploy is one that can take the API down at three in the morning.

## 7. Seed

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm seed
```

That creates the organisation, its legal entities, the people, the template
library and the approval workflows. Then, for a demonstration portfolio:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm seed:demo
```

`seed:demo` refuses to run twice — a second run would double every assessment
and quietly wrong every number on the dashboard.

## 8. Redeploy and check it comes up

Redeploy the application service so it picks up the variables. Then:

- `https://<your-domain>/sign-in` shows your provider and **no** development
  sign-in box. If the box is there, `ALLOW_DEV_SIGN_IN` leaked into production.

## 9. Give yourself access

Sign-in is invite-only. A valid Google or Entra ID token proves who you are, not
that you belong here. The seed only creates fictional `@example.bbc.co.uk`
people, so **until you do this, signing in with your real account is refused.**

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant you@waivern.com --name "Your Name"
```

That grants `owner` across the organisation. Narrower grants take a role and,
optionally, an entity:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant analyst@example.com privacy_analyst
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant approver@example.com approver --entity "BBC Studios"
```

Add `--persona` to set what their home leads with — one of
`privacy_governance`, `ai_governance`, `engineering`, `product`. It changes
presentation only, never access, and they can switch it themselves afterwards.
Left unset, it is derived from what they can do.

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant lead@example.com contributor --persona engineering
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
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm provision
```

Secrets print once and cannot be read back.

**Later schema changes.** Run `pnpm db:migrate` against the public string before
deploying the code that depends on it.
