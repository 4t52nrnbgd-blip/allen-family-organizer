# Allen Family Organizer

A private, shared household organizer for Michelle and Chad.

## Goal
Build a mobile-friendly web app that both adults can securely sign into, view, add, and edit from their own phones. Prioritize simple navigation, calm visual design, and clear reminders. Do not put real medical or other personal details in source code or sample data.

## First release (MVP)
1. **Home dashboard:** upcoming appointments, tasks due soon, refill dates, and quick-add controls.
2. **Shared calendar:** appointments, hair appointments, events, and reminders; each entry has date, time, description, and optional assigned person.
3. **Medication refill tracker:** medication name, refill due date, pharmacy, who it belongs to, and reminder preference. No medication advice or automatic prescription changes.
4. **Tasks and shopping list:** assign to Michelle or Chad, mark complete, recurring items.
5. **Bear's care:** feeding, grooming, training, and veterinary appointments.
6. **Meals:** weekly plan and grocery list.

## Design
- Responsive, phone-first interface with accessible controls.
- Warm neutral palette, clean typography, low-clutter cards.
- Prominent Today / Calendar / Tasks / More navigation.

## Collaboration and privacy
- Separate logins for Michelle and Chad, with both authorized to edit shared household data.
- Protect records with server-side authorization; never rely only on hidden UI controls.
- Store secrets in environment variables, never in GitHub.
- Seed demo data only; users enter real details after authentication is working.
- Ask before connecting Google Calendar or sending notifications.

## Suggested build sequence
1. Scaffold a working application and commit it.
2. Create dashboard, calendar, task, and refill interfaces using demo data.
3. Add secure authentication and shared data persistence.
4. Test adding/editing entries from two accounts.
5. Add recurring reminders, shopping, Bear, and meal planning.
6. Set up deployment and verify the app on iPhones.

## How to run locally

Requires Node.js 22 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000. The first visit shows a setup screen: create
a login for Michelle or Chad (password of at least 6 characters), then create
the other member's login from the Account tab after signing in. Demo data is
seeded automatically on first run (clearly labeled `Sample: `); real details
are entered after signing in.

By default the app stores data in a local SQLite file at `./data/allen.db`.
Set `DATABASE_URL` to use Postgres instead.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default `3000`). |
| `SESSION_SECRET` | Secret used by the session system. Required in production; set a long random string. |
| `DATABASE_URL` | Postgres connection string. Leave blank for local SQLite. |
| `SQLITE_PATH` | Path to the local SQLite file (default `./data/allen.db`). |

Copy `.env.example` to `.env` for local use. Never commit `.env` or any real
secrets to GitHub.

## How to deploy on Render

1. Push this repo to GitHub.
2. In Render, choose **New → Web Service** and select the repo. Render reads
   `render.yaml` and creates the web service (`the-allens`, free plan) and its
   Postgres database (`the-allens-db`, free plan).
3. Render generates `SESSION_SECRET` and `DATABASE_URL` from `render.yaml`;
   confirm they are set in the service's environment settings.
4. Deploy and open the service URL.

**The hosted version starts empty.** Michelle and Chad recreate their logins
there (same setup screen as local). Data from the Muse version does not carry
over, and the two logins created locally do not carry over either.

Free-tier caveats:

- Render's free web service sleeps after a period of inactivity, so the first
  load after idle time is slow (up to about a minute).
- Render's free Postgres database expires after 30 days. For long-term use,
  upgrade the database to a paid plan before it expires, or the stored data
  will be lost.

## Current status (2026-11-07)
Standalone rebuild in progress: the Express + SQLite/Postgres backend is
scaffolded (auth, calendar, tasks, refills, meals, groceries, Bear's care)
with demo seed data. The frontend (`public/`) is being built separately.
Next steps: finish the frontend, run the app locally, verify sign-in and
shared data from two accounts, then deploy to Render.
