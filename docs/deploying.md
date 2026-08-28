# Deploying to Vercel

Written for a first Vercel deployment. Order matters in two places, both called
out below.

## Before you start

You need three accounts: **GitHub** (for the code), **Neon** (for Postgres), and
**Vercel**. Neon and Vercel both have free tiers that will run this.

Two things to decide up front:

- **Vercel plan.** The Hobby tier is free but is for non-commercial use, and its
  cron jobs run once a day rather than hourly. Anything client-facing wants Pro.
  Check the current terms — Vercel changes them.
- **How people sign in.** There is no password login. The app uses OIDC (Entra
  ID or Google), and the local no-password bypass *refuses to build* in
  production on purpose. **Configure a provider before you deploy, or nobody —
  including you — can get in.** See step 4.

## 1. Push to GitHub

From the repository root:

```bash
gh repo create waivern-govern --private --source=. --remote=origin --push
```

That creates a private repository, wires it as `origin`, and pushes `main`.

Check nothing sensitive went with it — `.env.local` is ignored, `.env.example`
is not:

```bash
git ls-files | grep '^\.env'
```

Should print `.env.example` and nothing else.

## 2. Create the database

In Neon, create a project with the region **AWS eu-west-2 (London)**. It has to
match where the functions run, or every query pays a round trip across the
Atlantic — and UK data residency stops being true.

Neon gives you two connection strings. You need both, for different things:

- **Pooled** (the host contains `-pooler`) — for the app.
- **Direct** — for running migrations.

## 3. Run the migrations

Migrations run from your machine against the new database, using the **direct**
string:

```bash
DATABASE_URL='<neon direct connection string>' pnpm db:migrate
```

Then, if you want the demonstration tenant:

```bash
DATABASE_URL='<neon direct connection string>' pnpm seed
DATABASE_URL='<neon direct connection string>' pnpm seed:demo
```

`pnpm seed` creates the organisation, its two legal entities, the people, the
template library and the approval workflows. `pnpm seed:demo` adds a plausible
portfolio so the dashboard has something to show.

## 4. Set up sign-in

Google is the quicker of the two to get working; Entra ID is what a broadcaster
would actually use.

**Google:** in Google Cloud Console, create an OAuth 2.0 Client ID of type Web
application. Add an authorised redirect URI of
`https://<your-domain>/api/auth/callback/google`. You will not know the domain
until step 6 — set it to the Vercel URL afterwards and save.

**Entra ID:** register an application, add a Web redirect URI of
`https://<your-domain>/api/auth/callback/microsoft-entra-id`, create a client
secret, and note the tenant issuer URL.

Only the provider you configure appears on the sign-in page. Both may be set.

## 5. Import the project into Vercel

In Vercel: **Add New → Project**, then import the GitHub repository. It will
detect Next.js on its own. **Do not deploy yet.**

## 6. Set the environment variables — before the first build

This is the step-ordering that matters. `DATABASE_URL` is read while the project
is being built, not only when it runs, so a deploy with the variables missing
fails at build rather than failing later at runtime.

On the import screen, expand **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<your-domain>` |
| `INTEGRATION_KEY` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from step 4 |

Or, for Entra ID, `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET` and `_ISSUER`.

**Do not set `ALLOW_DEV_SIGN_IN`.** The build fails if it is present in
production, which is deliberate: a no-password bypass that can reach production
is worse than no bypass at all.

`AUTH_URL` is a chicken-and-egg — you do not know the domain until the first
deploy. Set it to anything, deploy, then correct it and redeploy. Sign-in will
not work until it is right.

## 7. Deploy

Press Deploy. The first build takes a couple of minutes.

When it finishes you have a URL like `waivern-govern-xyz.vercel.app`. Now go
back and fix two things:

1. `AUTH_URL` in Vercel → set to the real URL → redeploy.
2. The OAuth redirect URI in Google or Entra ID → set to the real URL.

Then sign in.

## 8. Check it came up correctly

- `https://<domain>/sign-in` shows your provider and **no** development
  sign-in box. If you see the box, `ALLOW_DEV_SIGN_IN` leaked into production.
- Sign in, then `/app/dashboard` shows the seeded portfolio.
- The cron endpoint refuses an unauthenticated call:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/cron/sweep
  ```

  Should print `401`. If it prints `503`, `CRON_SECRET` is not set.

## Notes for afterwards

**Region.** `vercel.json` pins functions to `lhr1` (London) and schedules the
sweep hourly. On the Hobby tier the hourly schedule will not be honoured —
Vercel runs Hobby crons once a day. Everything the sweep does is idempotent, so
a daily run is correct, just less timely.

**Migrations on later deploys.** They are not part of the build. When you change
the schema, run `pnpm db:migrate` against the direct connection string before
deploying the code that depends on it. Deliberately manual: a migration that
runs automatically on every deploy is a migration that can take the API down at
three in the morning.

**Integration connections.** To issue credentials for the Portal or the HAR
Analyser against the deployed database:

```bash
DATABASE_URL='<neon direct connection string>' pnpm provision
```

Secrets print once and cannot be read back.

**Preview deployments.** Every branch gets its own URL, sharing the production
database unless you set different variables for the Preview environment. Give
Preview its own Neon branch before anyone uses previews for anything real.
