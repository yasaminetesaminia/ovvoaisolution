# Lavora Platform

Multi-tenant AI clinic receptionist — voice + chat, sold as a SaaS.

## What's in here

```
lavora-platform/
├── apps/
│   ├── api/              Hono backend (Vapi tool webhooks, Meta webhooks, admin API)
│   ├── web/              Next.js dashboard (built on Day 4)
│   └── workers/          Reminder + sync jobs (built on Day 5)
├── packages/
│   ├── db/               Prisma schema + client + Lavora seed data
│   ├── core/             Domain logic (slots, booking, language detection)
│   ├── ai/               LLM abstraction (later)
│   ├── voice/            Vapi integration (later)
│   ├── chat/             WhatsApp / Instagram clients (later)
│   └── calendar/         Google Calendar sync (later)
└── …
```

See **SETUP.md** for the day-by-day setup checklist.

## Stack

- **Backend**: Hono + TypeScript on Node 20
- **Frontend** (later): Next.js 15 App Router
- **Database**: Postgres on Supabase
- **Auth**: Supabase Auth
- **Voice**: Vapi (streaming + tool webhooks → this API)
- **LLM**: Anthropic primary, OpenAI fallback
- **Workers**: Vercel Cron + pg_cron (no Redis needed)
- **Hosting**: Vercel (web), Railway (api), Supabase (db)
- **Errors / Analytics**: Sentry, PostHog

## Day-1 status

- ✅ Monorepo skeleton (pnpm + Turborepo)
- ✅ Prisma schema — multi-tenant from line one
- ✅ Lavora seed: 1 clinic, 5 doctors, 30+ services
- ✅ Hono API + Vapi tool dispatch endpoint
- ✅ Slot computation with capacity + advisory locks
- ✅ Booking with idempotency for retry safety
- ⏳ Next.js dashboard (Day 4)
- ⏳ Reminder workers (Day 5)
- ⏳ WhatsApp/Calendar sync (Day 6)

## Quick start (after credentials are filled in)

```bash
pnpm install
cp .env.example .env  # fill in
pnpm db:push          # create schema in Supabase
pnpm db:seed          # insert Lavora
pnpm --filter @lavora/api dev
```
