// The Allen's — standalone family organizer backend.
// Express API + static frontend. Sessions are random tokens stored in the
// sessions table and sent as an HttpOnly cookie. Every /api route except
// GET /api/auth/state (and the no-users setup case) requires a valid session.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("./db");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

// ---------------------------------------------------------------------------
// Config / sessions
// ---------------------------------------------------------------------------

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production.");
}
if (!process.env.SESSION_SECRET) {
  console.warn("Warning: SESSION_SECRET not set; using an ephemeral value (dev only).");
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
void SESSION_SECRET; // Sessions are random tokens; the secret is reserved for future signing needs.

const SESSION_DAYS = 30;
const MEMBERS = ["Michelle", "Chad"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const parts = [
    `session=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (isProduction) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = ["session=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (isProduction) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

async function createSession(res, member) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.run(
    "INSERT INTO sessions (token, member, created_at, expires_at) VALUES (?, ?, ?, ?)",
    [token, member, now.toISOString(), expires.toISOString()]
  );
  setSessionCookie(res, token);
  return token;
}

async function getSignedInMember(req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const row = await db.get("SELECT * FROM sessions WHERE token = ?", [token]);
  if (!row) return null;
  if (row.expires_at <= new Date().toISOString()) {
    await db.run("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }
  return row.member;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function bad(res, message) {
  return res.status(400).json({ error: message });
}

function notFound(res) {
  return res.status(404).json({ error: "Not found" });
}

function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function reqTitle(value, label = "Title") {
  if (typeof value !== "string" || value.trim() === "") return `${label} is required.`;
  if (value.trim().length > 200) return `${label} must be 200 characters or fewer.`;
  return null;
}

function optString(value, max = 200) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  if (value.length > max) return null;
  return value;
}

function checkEnum(value, allowed, label) {
  if (!allowed.includes(value)) return `${label} must be one of: ${allowed.join(", ")}.`;
  return null;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const requireAuth = ah(async (req, res, next) => {
  const member = await getSignedInMember(req);
  if (!member) return res.status(401).json({ error: "Please sign in to continue." });
  req.member = member;
  next();
});

// Row -> API (camelCase) mappers. db layer already normalizes booleans to 0/1.
const mapEvent = (r) => r && {
  id: r.id, title: r.title, date: r.date, time: r.time, location: r.location,
  who: r.who, createdBy: r.created_by, createdAt: r.created_at,
};
const mapTask = (r) => r && {
  id: r.id, title: r.title, assignee: r.assignee, category: r.category,
  dueDate: r.due_date, done: r.done, createdBy: r.created_by, createdAt: r.created_at,
};
const mapRefill = (r) => r && {
  id: r.id, medication: r.medication, nextDue: r.next_due, intervalDays: r.interval_days,
  person: r.person, pharmacy: r.pharmacy, dosage: r.dosage, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at,
};
const mapMeal = (r) => r && {
  id: r.id, date: r.date, title: r.title, mealType: r.meal_type, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at,
};
const mapGrocery = (r) => r && {
  id: r.id, title: r.title, quantity: r.quantity, category: r.category,
  done: r.done, createdBy: r.created_by, createdAt: r.created_at,
};
const mapBearProfile = (r) => r && {
  id: r.id, food: r.food, feedingNotes: r.feeding_notes, vetInfo: r.vet_info,
  groomingNotes: r.grooming_notes, notes: r.notes,
};
const mapBearRoutine = (r) => r && {
  id: r.id, title: r.title, category: r.category, frequency: r.frequency,
  timeLabel: r.time_label, notes: r.notes, createdBy: r.created_by, createdAt: r.created_at,
};
const mapBearLog = (r) => r && {
  id: r.id, date: r.date, title: r.title, category: r.category, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at,
};
const mapBearReminder = (r) => r && {
  id: r.id, title: r.title, date: r.date, category: r.category, notes: r.notes,
  done: r.done, createdBy: r.created_by, createdAt: r.created_at,
};

async function loadOr404(res, table, id) {
  const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) { notFound(res); return null; }
  return row;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

app.get("/api/auth/state", ah(async (req, res) => {
  const users = await db.all("SELECT name FROM users");
  const has = new Set(users.map((u) => u.name));
  const signedIn = await getSignedInMember(req);
  res.json({
    members: MEMBERS.map((name) => ({ name, hasLogin: has.has(name) })),
    signedIn: signedIn || null,
  });
}));

app.post("/api/auth/setup", ah(async (req, res) => {
  const { name, password } = req.body || {};
  if (!MEMBERS.includes(name)) return bad(res, "Please choose Michelle or Chad.");
  if (typeof password !== "string" || password.length < 6) {
    return bad(res, "Password must be at least 6 characters.");
  }
  const existing = await db.all("SELECT name FROM users");
  if (existing.length === 0) {
    // No users yet: first login, no session required.
    const hash = await bcrypt.hash(password, 10);
    await db.run("INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?) RETURNING id",
      [name, hash, new Date().toISOString()]);
    await createSession(res, name);
    return res.json({ ok: true, user: { name } });
  }
  // Users exist: creating the other member's login requires a session.
  const member = await getSignedInMember(req);
  if (!member) return res.status(401).json({ error: "Please sign in to continue." });
  if (existing.some((u) => u.name === name)) {
    return bad(res, `${name} already has a login.`);
  }
  const hash = await bcrypt.hash(password, 10);
  await db.run("INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?) RETURNING id",
    [name, hash, new Date().toISOString()]);
  res.json({ ok: true, user: { name } });
}));

app.post("/api/auth/signin", ah(async (req, res) => {
  const { name, password } = req.body || {};
  if (!MEMBERS.includes(name) || typeof password !== "string") {
    return res.status(401).json({ error: "Incorrect name or password." });
  }
  const user = await db.get("SELECT * FROM users WHERE name = ?", [name]);
  if (!user) return res.status(401).json({ error: "Incorrect name or password." });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Incorrect name or password." });
  await createSession(res, name);
  res.json({ ok: true, user: { name } });
}));

app.post("/api/auth/signout", ah(async (req, res) => {
  const token = parseCookies(req).session;
  if (token) await db.run("DELETE FROM sessions WHERE token = ?", [token]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.post("/api/auth/change-password", requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return bad(res, "New password must be at least 6 characters.");
  }
  const user = await db.get("SELECT * FROM users WHERE name = ?", [req.member]);
  if (!user) return notFound(res);
  const ok = await bcrypt.compare(currentPassword || "", user.password_hash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect." });
  const hash = await bcrypt.hash(newPassword, 10);
  await db.run("UPDATE users SET password_hash = ? WHERE name = ?", [hash, req.member]);
  res.json({ ok: true });
}));

app.post("/api/auth/reset-member-password", requireAuth, ah(async (req, res) => {
  const { name, newPassword } = req.body || {};
  if (!MEMBERS.includes(name)) return bad(res, "Please choose Michelle or Chad.");
  if (name === req.member) {
    return bad(res, "You can only reset the other member's password. Use change password for your own.");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return bad(res, "New password must be at least 6 characters.");
  }
  const user = await db.get("SELECT * FROM users WHERE name = ?", [name]);
  if (!user) return notFound(res);
  const hash = await bcrypt.hash(newPassword, 10);
  await db.run("UPDATE users SET password_hash = ? WHERE name = ?", [hash, name]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const MEAL_ORDER = { Breakfast: 0, Lunch: 1, Dinner: 2, Snack: 3 };

app.get("/api/overview", requireAuth, ah(async (req, res) => {
  const [events, tasks, refills, meals, groceries, profile, routines, logs, reminders] =
    await Promise.all([
      db.all("SELECT * FROM events ORDER BY date ASC, time ASC"),
      db.all("SELECT * FROM tasks"),
      db.all("SELECT * FROM refills ORDER BY next_due ASC"),
      db.all("SELECT * FROM meals"),
      db.all("SELECT * FROM groceries"),
      db.get("SELECT * FROM bear_profile WHERE id = 1"),
      db.all("SELECT * FROM bear_routines ORDER BY created_at ASC"),
      db.all("SELECT * FROM bear_logs ORDER BY date DESC, created_at DESC"),
      db.all("SELECT * FROM bear_reminders ORDER BY date ASC"),
    ]);

  tasks.sort((a, b) =>
    (a.done - b.done) ||
    ((a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31")) ||
    a.created_at.localeCompare(b.created_at));
  meals.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    ((MEAL_ORDER[a.meal_type] ?? 99) - (MEAL_ORDER[b.meal_type] ?? 99)));
  groceries.sort((a, b) => (a.done - b.done) || a.created_at.localeCompare(b.created_at));

  res.json({
    today: todayStr(),
    events: events.map(mapEvent),
    tasks: tasks.map(mapTask),
    refills: refills.map(mapRefill),
    meals: meals.map(mapMeal),
    groceries: groceries.map(mapGrocery),
    bearProfile: mapBearProfile(profile),
    bearRoutines: routines.map(mapBearRoutine),
    bearLogs: logs.map(mapBearLog),
    bearReminders: reminders.map(mapBearReminder),
  });
}));

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const EVENT_WHO = ["Michelle", "Chad", "Both", "Family"];

app.post("/api/events", requireAuth, ah(async (req, res) => {
  const { title, date, time, location, who } = req.body || {};
  const err = reqTitle(title);
  if (err) return bad(res, err);
  if (!isValidDate(date)) return bad(res, "Date must be YYYY-MM-DD.");
  const whoVal = who === undefined ? "Family" : who;
  const enumErr = checkEnum(whoVal, EVENT_WHO, "Who");
  if (enumErr) return bad(res, enumErr);
  const timeVal = optString(time);
  const locVal = optString(location);
  if (timeVal === null || locVal === null) return bad(res, "Time and location must be text.");
  const result = await db.run(
    "INSERT INTO events (title, date, time, location, who, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [title.trim(), date, timeVal, locVal, whoVal, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.delete("/api/events/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "events", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM events WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TASK_ASSIGNEES = ["Michelle", "Chad", "Either"];
const TASK_CATEGORIES = ["Household", "Shopping", "Bear's care", "Health", "Faith & service", "Other"];

app.post("/api/tasks", requireAuth, ah(async (req, res) => {
  const { title, assignee, category, dueDate } = req.body || {};
  const err = reqTitle(title);
  if (err) return bad(res, err);
  const assigneeVal = assignee === undefined ? "Either" : assignee;
  const categoryVal = category === undefined ? "Household" : category;
  const dueVal = dueDate === undefined ? "" : dueDate;
  let enumErr = checkEnum(assigneeVal, TASK_ASSIGNEES, "Assignee");
  if (enumErr) return bad(res, enumErr);
  enumErr = checkEnum(categoryVal, TASK_CATEGORIES, "Category");
  if (enumErr) return bad(res, enumErr);
  if (dueVal !== "" && !isValidDate(dueVal)) return bad(res, "Due date must be YYYY-MM-DD.");
  const result = await db.run(
    "INSERT INTO tasks (title, assignee, category, due_date, done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [title.trim(), assigneeVal, categoryVal, dueVal, false, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.patch("/api/tasks/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "tasks", req.params.id);
  if (!row) return;
  const { done } = req.body || {};
  if (done !== 0 && done !== 1) return bad(res, "Done must be 0 or 1.");
  await db.run("UPDATE tasks SET done = ? WHERE id = ?", [Boolean(done), row.id]);
  res.json({ ok: true });
}));

app.delete("/api/tasks/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "tasks", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM tasks WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Refills
// ---------------------------------------------------------------------------

app.post("/api/refills", requireAuth, ah(async (req, res) => {
  const { medication, nextDue, intervalDays, person, pharmacy, dosage, notes } = req.body || {};
  const err = reqTitle(medication, "Medication");
  if (err) return bad(res, err);
  if (!isValidDate(nextDue)) return bad(res, "Next due date must be YYYY-MM-DD.");
  const interval = intervalDays === undefined ? 30 : intervalDays;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    return bad(res, "Interval must be between 1 and 365 days.");
  }
  const personVal = person === undefined ? "Michelle" : person;
  const enumErr = checkEnum(personVal, MEMBERS, "Person");
  if (enumErr) return bad(res, enumErr);
  const pharmacyVal = optString(pharmacy);
  const dosageVal = optString(dosage);
  const notesVal = optString(notes);
  if (pharmacyVal === null || dosageVal === null || notesVal === null) {
    return bad(res, "Pharmacy, dosage and notes must be text.");
  }
  const result = await db.run(
    "INSERT INTO refills (medication, next_due, interval_days, person, pharmacy, dosage, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [medication.trim(), nextDue, interval, personVal, pharmacyVal, dosageVal, notesVal, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.post("/api/refills/:id/refilled", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "refills", req.params.id);
  if (!row) return;
  const today = todayStr();
  const base = row.next_due >= today ? row.next_due : today;
  const nextDue = addDays(base, row.interval_days);
  await db.run("UPDATE refills SET next_due = ? WHERE id = ?", [nextDue, row.id]);
  res.json({ ok: true, nextDue });
}));

app.delete("/api/refills/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "refills", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM refills WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];

app.post("/api/meals", requireAuth, ah(async (req, res) => {
  const { date, title, mealType, notes } = req.body || {};
  if (!isValidDate(date)) return bad(res, "Date must be YYYY-MM-DD.");
  const err = reqTitle(title);
  if (err) return bad(res, err);
  const mealTypeVal = mealType === undefined ? "Dinner" : mealType;
  const enumErr = checkEnum(mealTypeVal, MEAL_TYPES, "Meal type");
  if (enumErr) return bad(res, enumErr);
  const notesVal = optString(notes);
  if (notesVal === null) return bad(res, "Notes must be text.");
  const result = await db.run(
    "INSERT INTO meals (date, title, meal_type, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [date, title.trim(), mealTypeVal, notesVal, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.patch("/api/meals/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "meals", req.params.id);
  if (!row) return;
  const { date, title, mealType, notes } = req.body || {};
  const updates = {};
  if (date !== undefined) {
    if (!isValidDate(date)) return bad(res, "Date must be YYYY-MM-DD.");
    updates.date = date;
  }
  if (title !== undefined) {
    const err = reqTitle(title);
    if (err) return bad(res, err);
    updates.title = title.trim();
  }
  if (mealType !== undefined) {
    const enumErr = checkEnum(mealType, MEAL_TYPES, "Meal type");
    if (enumErr) return bad(res, enumErr);
    updates.meal_type = mealType;
  }
  if (notes !== undefined) {
    const v = optString(notes);
    if (v === null) return bad(res, "Notes must be text.");
    updates.notes = v;
  }
  const keys = Object.keys(updates);
  if (keys.length > 0) {
    const set = keys.map((k) => `${k} = ?`).join(", ");
    await db.run(`UPDATE meals SET ${set} WHERE id = ?`, [...keys.map((k) => updates[k]), row.id]);
  }
  res.json({ ok: true });
}));

app.delete("/api/meals/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "meals", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM meals WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Groceries
// ---------------------------------------------------------------------------

const GROCERY_CATEGORIES = ["Produce", "Meat & dairy", "Pantry", "Frozen", "Bakery", "Household", "Other"];

app.post("/api/groceries", requireAuth, ah(async (req, res) => {
  const { title, quantity, category } = req.body || {};
  const err = reqTitle(title);
  if (err) return bad(res, err);
  const categoryVal = category === undefined ? "Other" : category;
  const enumErr = checkEnum(categoryVal, GROCERY_CATEGORIES, "Category");
  if (enumErr) return bad(res, enumErr);
  const qtyVal = optString(quantity);
  if (qtyVal === null) return bad(res, "Quantity must be text.");
  const result = await db.run(
    "INSERT INTO groceries (title, quantity, category, done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [title.trim(), qtyVal, categoryVal, false, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.patch("/api/groceries/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "groceries", req.params.id);
  if (!row) return;
  const { done } = req.body || {};
  if (done !== 0 && done !== 1) return bad(res, "Done must be 0 or 1.");
  await db.run("UPDATE groceries SET done = ? WHERE id = ?", [Boolean(done), row.id]);
  res.json({ ok: true });
}));

app.delete("/api/groceries/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "groceries", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM groceries WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

app.post("/api/groceries/clear-checked", requireAuth, ah(async (req, res) => {
  const result = await db.run("DELETE FROM groceries WHERE done = ?", [true]);
  res.json({ ok: true, removed: result.changes || 0 });
}));

// ---------------------------------------------------------------------------
// Bear
// ---------------------------------------------------------------------------

app.get("/api/bear/profile", requireAuth, ah(async (req, res) => {
  const row = await db.get("SELECT * FROM bear_profile WHERE id = 1");
  res.json({ profile: mapBearProfile(row) });
}));

app.put("/api/bear/profile", requireAuth, ah(async (req, res) => {
  const existing = await db.get("SELECT * FROM bear_profile WHERE id = 1");
  const merged = {
    food: existing ? existing.food : "",
    feeding_notes: existing ? existing.feeding_notes : "",
    vet_info: existing ? existing.vet_info : "",
    grooming_notes: existing ? existing.grooming_notes : "",
    notes: existing ? existing.notes : "",
  };
  const fields = { food: "food", feedingNotes: "feeding_notes", vetInfo: "vet_info", groomingNotes: "grooming_notes", notes: "notes" };
  for (const [bodyKey, col] of Object.entries(fields)) {
    if (req.body && req.body[bodyKey] !== undefined) {
      const v = optString(req.body[bodyKey], 2000);
      if (v === null) return bad(res, `${bodyKey} must be text.`);
      merged[col] = v;
    }
  }
  await db.run(
    `INSERT INTO bear_profile (id, food, feeding_notes, vet_info, grooming_notes, notes)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET food = ?, feeding_notes = ?, vet_info = ?, grooming_notes = ?, notes = ?`,
    [merged.food, merged.feeding_notes, merged.vet_info, merged.grooming_notes, merged.notes,
     merged.food, merged.feeding_notes, merged.vet_info, merged.grooming_notes, merged.notes]
  );
  res.json({ ok: true });
}));

const BEAR_ROUTINE_CATEGORIES = ["Walk", "Feeding", "Grooming", "Health", "Play", "Other"];

app.post("/api/bear/routines", requireAuth, ah(async (req, res) => {
  const { title, category, frequency, timeLabel, notes } = req.body || {};
  const err = reqTitle(title);
  if (err) return bad(res, err);
  const categoryVal = category === undefined ? "Other" : category;
  const enumErr = checkEnum(categoryVal, BEAR_ROUTINE_CATEGORIES, "Category");
  if (enumErr) return bad(res, enumErr);
  const freqVal = optString(frequency);
  const timeVal = optString(timeLabel);
  const notesVal = optString(notes, 2000);
  if (freqVal === null || timeVal === null || notesVal === null) {
    return bad(res, "Frequency, time label and notes must be text.");
  }
  const result = await db.run(
    "INSERT INTO bear_routines (title, category, frequency, time_label, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [title.trim(), categoryVal, freqVal || "Daily", timeVal, notesVal, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.delete("/api/bear/routines/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "bear_routines", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM bear_routines WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

app.post("/api/bear/routines/:id/done", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "bear_routines", req.params.id);
  if (!row) return;
  const date = req.body && req.body.date !== undefined ? req.body.date : todayStr();
  if (!isValidDate(date)) return bad(res, "Date must be YYYY-MM-DD.");
  const result = await db.run(
    "INSERT INTO bear_logs (date, title, category, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [date, row.title, row.category, "", req.member, new Date().toISOString()]
  );
  res.json({ ok: true, logId: result.id });
}));

const BEAR_LOG_CATEGORIES = ["Walk", "Feeding", "Grooming", "Health", "Play", "Other"];

app.post("/api/bear/logs", requireAuth, ah(async (req, res) => {
  const { date, title, category, notes } = req.body || {};
  if (!isValidDate(date)) return bad(res, "Date must be YYYY-MM-DD.");
  const err = reqTitle(title);
  if (err) return bad(res, err);
  const categoryVal = category === undefined ? "Other" : category;
  const enumErr = checkEnum(categoryVal, BEAR_LOG_CATEGORIES, "Category");
  if (enumErr) return bad(res, enumErr);
  const notesVal = optString(notes, 2000);
  if (notesVal === null) return bad(res, "Notes must be text.");
  const result = await db.run(
    "INSERT INTO bear_logs (date, title, category, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [date, title.trim(), categoryVal, notesVal, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.delete("/api/bear/logs/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "bear_logs", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM bear_logs WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

const BEAR_REMINDER_CATEGORIES = ["Vet", "Grooming", "Medication", "Other"];

app.post("/api/bear/reminders", requireAuth, ah(async (req, res) => {
  const { title, date, category, notes } = req.body || {};
  const err = reqTitle(title);
  if (err) return bad(res, err);
  if (!isValidDate(date)) return bad(res, "Date must be YYYY-MM-DD.");
  const categoryVal = category === undefined ? "Other" : category;
  const enumErr = checkEnum(categoryVal, BEAR_REMINDER_CATEGORIES, "Category");
  if (enumErr) return bad(res, enumErr);
  const notesVal = optString(notes, 2000);
  if (notesVal === null) return bad(res, "Notes must be text.");
  const result = await db.run(
    "INSERT INTO bear_reminders (title, date, category, notes, done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [title.trim(), date, categoryVal, notesVal, false, req.member, new Date().toISOString()]
  );
  res.json({ ok: true, id: result.id });
}));

app.patch("/api/bear/reminders/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "bear_reminders", req.params.id);
  if (!row) return;
  const { done } = req.body || {};
  if (done !== 0 && done !== 1) return bad(res, "Done must be 0 or 1.");
  await db.run("UPDATE bear_reminders SET done = ? WHERE id = ?", [Boolean(done), row.id]);
  res.json({ ok: true });
}));

app.delete("/api/bear/reminders/:id", requireAuth, ah(async (req, res) => {
  const row = await loadOr404(res, "bear_reminders", req.params.id);
  if (!row) return;
  await db.run("DELETE FROM bear_reminders WHERE id = ?", [row.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Static frontend + fallback
// ---------------------------------------------------------------------------

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get(/^(?!\/api).*/, (req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Frontend not yet built.");
});

// Unknown API route.
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Error handler.
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  await db.initDb();
  await db.seedIfEmpty();
  const port = process.env.PORT || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`The Allen's listening on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { app, start };
