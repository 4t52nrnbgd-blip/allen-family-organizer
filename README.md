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

## Current status (2026-11-02)
Repository initialized. Application source files were not yet found on the main branch when this plan was recorded. Next step: scaffold the app, run it, and commit the first working version.
