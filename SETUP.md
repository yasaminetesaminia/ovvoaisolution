# Setup checklist — what YOU do, what I do

## Day 1: Today

### What you do (~30 min total)

#### 1. Install pnpm + Node 20
```powershell
# Check you have Node 20+
node -v   # should print v20.x or v22.x

# If not, install from nodejs.org

# Install pnpm globally
npm install -g pnpm

pnpm -v   # confirm
```

#### 2. Create accounts (free tier on all)

| Service | URL | What to grab |
|---|---|---|
| **Supabase** | [supabase.com](https://supabase.com) | New project → name `lavora-prod` → save the DB password somewhere |
| **Vapi** | [vapi.ai](https://vapi.ai) | Sign up → Settings → API Keys |
| **Sentry** | [sentry.io](https://sentry.io) | New project → Platform: Node.js → grab DSN |
| **PostHog** | [posthog.com](https://posthog.com) | New project → grab Project API Key |
| **Vercel** | [vercel.com](https://vercel.com) | Sign in with GitHub (we'll deploy here on Day 7) |
| **GitHub** | [github.com](https://github.com) | Create empty private repo `lavora-platform` |

#### 3. Get Supabase connection strings

In your Supabase project:
- **Project Settings → Database → Connection string**
  - "Transaction" mode (port 6543) → copy → that's `DATABASE_URL`
  - "Session" mode (port 5432) → copy → that's `DIRECT_URL`
  - Password = whatever you set when creating the project
- **Project Settings → API**
  - URL → `SUPABASE_URL`
  - `anon` key → `SUPABASE_ANON_KEY`
  - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(keep secret, server-only)*

#### 4. Create `.env`

```bash
cd C:\Users\MSI\Desktop\lavora-platform
cp .env.example .env
notepad .env   # or your editor
```

Paste the values you gathered above. Leave the WhatsApp / Google rows blank for now — we'll fill them on Day 2-3.

#### 5. Push to GitHub

```bash
cd C:\Users\MSI\Desktop\lavora-platform
git init
git add .
git commit -m "Day 1: monorepo skeleton + Prisma schema + Hono API + Lavora seed"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/lavora-platform.git
git push -u origin main
```

#### 6. Install dependencies & push schema

```bash
pnpm install
pnpm --filter @lavora/db db:generate
pnpm --filter @lavora/db db:push     # creates all tables in Supabase
pnpm --filter @lavora/db db:seed     # inserts Lavora + doctors + services
```

If anything errors, paste it to me — I'll fix it.

#### 7. Smoke-test the API locally

```bash
pnpm --filter @lavora/api dev
```

You should see:
```
✓ Lavora API listening on http://localhost:8787
```

Open another terminal:
```bash
curl http://localhost:8787/v1/health
# → {"ok":true}

curl http://localhost:8787/v1/health/ready
# → {"ok":true,"db":"up"}
```

If both return `ok:true`, **Day 1 is done**.

---

## Day 2 (tomorrow): What I'll build

- Google Calendar OAuth flow (so booking → calendar event)
- WhatsApp send helper (for Day 5 reminders)
- Better error handling + Sentry breadcrumbs
- The remaining 1-2 tool webhooks (list_packages etc.)

## Day 3: Vapi agent setup

- Lavora prompt → Vapi assistant
- All tools registered to point at your deployed API
- Twilio / Vapi-bought number wired in
- **First end-to-end test call → bookings save to Postgres**

## Day 4-5: Dashboard

Next.js app with login, appointments list, call log, basic stats.

## Day 6-7: Production deploy + polish + demo

---

## Common errors / FAQ

### `prisma generate` fails with binary download error
Behind a proxy / no network: re-run with `pnpm --filter @lavora/db db:generate -- --no-engine`

### Supabase says "max connections reached"
You're probably using the wrong port. Use **6543** (pooler) for `DATABASE_URL`,
**5432** (direct) for `DIRECT_URL`. The `?pgbouncer=true` query param matters.

### `Module not found: @lavora/db`
Run `pnpm install` from the repo root, not from inside an app folder. Workspaces
only resolve from the root.
