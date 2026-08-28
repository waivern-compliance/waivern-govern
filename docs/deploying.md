# Deploying

Vercel runs the application; Railway runs the database. Written for a first
Vercel deployment. Order matters in two places, both called out below.

## Before you start

Two things to settle first.

**How people sign in.** There is no password login. The app uses OIDC (Entra ID
or Google), and the local no-password bypass *refuses to build* in production on
purpose. **Configure a provider before you deploy, or nobody — including you —
can get in.** See step 3.

**Vercel plan.** The Hobby tier is free but is for non-commercial use, and its
cron jobs run once a day rather than hourly. Anything client-facing wants Pro.
Check the current terms; Vercel changes them.

## Where the data sits

Railway's regions are US East, US West, EU West (Amsterdam) and Singapore. There
is no UK region, so the database sits in the EU rather than the UK.

That is lawful — the EU holds UK adequacy, so the transfer needs no separate
safeguard — but it is a weaker claim than UK residency, and worth stating
plainly rather than glossing. If a buyer requires the data to stay in the UK,
Railway cannot do it and a London-region provider (Neon on AWS `eu-west-2`, for
instance) is the answer, at the cost of one more sub-processor.

Vercel functions are pinned to `lhr1` in `vercel.json`, which keeps request
handling in London and the round trip to Amsterdam short.

## 1. Push to GitHub

Already done:

```bash
gh repo create waivern-govern --private --source=. --remote=origin --push
```

Confirm nothing local is outstanding — empty output means everything is pushed:

```bash
git log origin/main..main --oneline
```

And that no real secrets travelled. This should print `.env.example` and nothing
else:

```bash
git ls-files | grep '^\.env'
```

## 2. Create the database on Railway

In the Railway dashboard: **New Project → Provision PostgreSQL**. Set the region
to **EU West** — see the note above about what that does and does not buy you.

Then the part that catches people out. Open the Postgres service, go to
**Variables**, and you will see two connection strings:

| Variable | Host looks like | Use it for |
| --- | --- | --- |
| `DATABASE_URL` | `postgres.railway.internal` | Nothing here |
| `DATABASE_PUBLIC_URL` | `<something>.proxy.rlwy.net:<port>` | Everything here |

`DATABASE_URL` is Railway's *private* network address. It only resolves from
inside the same Railway project. Vercel is not inside it, and neither is your
laptop, so **both the migrations and the deployed app need
`DATABASE_PUBLIC_URL`**. Using the internal one produces a DNS failure that
looks like the database is down.

You may need to enable public networking on the Postgres service before that
variable appears.

## 3. Set up sign-in

Google is quicker to get working; Entra ID is what a broadcaster would actually
use.

**Google:** in Google Cloud Console, create an OAuth 2.0 Client ID of type Web
application, with an authorised redirect URI of
`https://<your-domain>/api/auth/callback/google`. You will not know the domain
until step 6 — come back and set it.

**Entra ID:** register an application, add a Web redirect URI of
`https://<your-domain>/api/auth/callback/microsoft-entra-id`, create a client
secret, and note the tenant issuer URL.

Only the provider you configure appears on the sign-in page. Both may be set.

## 4. Run the migrations

From your machine, against the **public** connection string:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL from Railway>' pnpm db:migrate
```

Then, for the demonstration tenant:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm seed
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm seed:demo
```

`pnpm seed` creates the organisation, its two legal entities, the people, the
template library and the approval workflows. `pnpm seed:demo` adds a plausible
portfolio so the dashboard has something to show.

Quote the string. Railway passwords contain characters your shell will
otherwise interpret.

## 5. Import the project into Vercel

In Vercel: **Add New → Project**, then import `waivern-govern` from GitHub. It
detects Next.js on its own. **Do not deploy yet.**

## 6. Set the environment variables — before the first build

This is the step-ordering that matters. `DATABASE_URL` is read while the project
is being built, not only when it runs, so a deploy with the variables missing
fails at build rather than later at runtime.

On the import screen, expand **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Railway's **`DATABASE_PUBLIC_URL`** |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<your-domain>` |
| `INTEGRATION_KEY` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from step 3 |

Or, for Entra ID, `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET` and `_ISSUER`.

**Do not set `ALLOW_DEV_SIGN_IN`.** The build fails if it is present in
production, which is deliberate: a no-password bypass that can reach production
is worse than no bypass at all.

`AUTH_URL` is a chicken-and-egg — you do not know the domain until the first
deploy. Put anything in, deploy, then correct it and redeploy. Sign-in will not
work until it is right.

Keep `INTEGRATION_KEY` somewhere safe. It decrypts the integration secrets; lose
it and every connection has to be reprovisioned.

## 7. Deploy

Press Deploy. The first build takes a couple of minutes.

When it finishes you have a URL like `waivern-govern-xyz.vercel.app`.

## 8. Point the URL-dependent settings at the real domain

Two things could not be set before you knew the domain:

1. **`AUTH_URL`** in Vercel → set to the real URL → redeploy for it to take
   effect.
2. **The OAuth redirect URI** in Google or Entra ID → set to
   `https://<domain>/api/auth/callback/google` (or
   `.../callback/microsoft-entra-id`).

Sign-in fails until both are right, usually with a redirect-mismatch error from
the provider.

## 9. Give yourself access

Sign-in is invite-only. A valid Google or Entra ID token proves who you are, not
that you belong here — an account with no membership is refused. The seed only
creates fictional `@example.bbc.co.uk` people, so **until you do this, signing in
with your real account is rejected.**

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant you@waivern.com --name "Your Name"
```

That grants `owner` across the organisation, which is everything. Narrower
grants take a role and, optionally, an entity:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant analyst@example.com privacy_analyst
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm grant approver@example.com approver --entity "BBC Studios"
```

The email must match the one on the identity-provider account exactly — that is
what the platform matches on. Re-running changes nothing, so it is safe to use
to check.

One thing to know about granting yourself `owner`: it includes `risk.accept`,
but a risk cannot be accepted by the person who owns it. On a demonstration
tenant where you own everything, use one of the seeded approvers to show
acceptance working.

## 10. Check it came up correctly

- `https://<domain>/sign-in` shows your provider and **no** development sign-in
  box. If the box is there, `ALLOW_DEV_SIGN_IN` leaked into production.
- Sign in with the account you granted in step 9, then `/app/dashboard` shows
  the seeded portfolio.
- The cron endpoint refuses an unauthenticated call:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/cron/sweep
  ```

  `401` is right. `503` means `CRON_SECRET` is not set.

## Notes for afterwards

**Connections.** Railway's Postgres has no connection pooler in front of it, and
every warm Vercel function holds its own connection. The app opens at most one
per instance in production for exactly this reason, but the ceiling is Postgres's
`max_connections` (100 by default). Fine for a demonstration and for a single
client; if concurrency grows, put PgBouncer in front of it or move to a provider
whose pooling is built in.

**Migrations on later deploys.** They are not part of the build. When the schema
changes, run `pnpm db:migrate` against the public connection string before
deploying the code that depends on it. Deliberately manual: a migration that
runs automatically on every deploy is one that can take the API down at three in
the morning.

**Cron.** `vercel.json` schedules the sweep hourly. On the Hobby tier Vercel runs
crons once a day instead. Everything the sweep does is idempotent, so a daily run
is correct, just less timely.

**Integration connections.** To issue credentials for the Portal or the HAR
Analyser against the deployed database:

```bash
DATABASE_URL='<DATABASE_PUBLIC_URL>' pnpm provision
```

Secrets print once and cannot be read back.

**Preview deployments.** Every branch gets its own URL, and it will share the
production database unless you give the Preview environment its own
`DATABASE_URL`. Point it at a second Railway database before anyone uses a
preview for anything real.
