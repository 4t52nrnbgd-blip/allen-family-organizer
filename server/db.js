// Database layer for The Allen's.
// Uses Postgres (pg) when DATABASE_URL is set, otherwise the built-in
// node:sqlite DatabaseSync with a file at SQLITE_PATH (default ./data/allen.db).
// All queries are written with `?` placeholders; the pg path converts them
// to $1, $2, ... Boolean columns are stored as BOOLEAN in Postgres and
// INTEGER 0/1 in SQLite; this layer normalizes rows so the API always
// sees/returns 0/1 integers for done flags.

const fs = require("node:fs");
const path = require("node:path");

const usePg = Boolean(process.env.DATABASE_URL);

let pool = null;
let sqliteDb = null;

if (usePg) {
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
} else {
  const { DatabaseSync } = require("node:sqlite");
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "allen.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
}

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Normalize a row: Postgres BOOLEAN values become 0/1 integers.
function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  return out;
}

async function get(sql, params = []) {
  if (usePg) {
    const res = await pool.query(toPg(sql), params);
    return normalizeRow(res.rows[0]) || null;
  }
  return normalizeRow(sqliteDb.prepare(sql).get(...params)) || null;
}

async function all(sql, params = []) {
  if (usePg) {
    const res = await pool.query(toPg(sql), params);
    return res.rows.map(normalizeRow);
  }
  return sqliteDb.prepare(sql).all(...params).map(normalizeRow);
}

// For INSERT ... RETURNING id: pg returns rows[0].id; sqlite uses .get().
// For UPDATE/DELETE: returns { changes }.
async function run(sql, params = []) {
  if (usePg) {
    const res = await pool.query(toPg(sql), params);
    return { id: res.rows[0] ? res.rows[0].id : undefined, changes: res.rowCount };
  }
  const stmt = sqliteDb.prepare(sql);
  if (/RETURNING/i.test(sql)) {
    const row = stmt.get(...params);
    return { id: row ? row.id : undefined, changes: row ? 1 : 0 };
  }
  const info = stmt.run(...params);
  return { id: info.lastInsertRowid, changes: info.changes };
}

// Dialect-specific DDL with identical table/column names.
const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL CHECK(name IN ('Michelle','Chad')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  member TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  location TEXT DEFAULT '',
  who TEXT DEFAULT 'Family',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  assignee TEXT DEFAULT 'Either',
  category TEXT DEFAULT 'Household',
  due_date TEXT DEFAULT '',
  done INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refills (
  id INTEGER PRIMARY KEY,
  medication TEXT NOT NULL,
  next_due TEXT NOT NULL,
  interval_days INTEGER DEFAULT 30,
  person TEXT DEFAULT 'Michelle',
  pharmacy TEXT DEFAULT '',
  dosage TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  meal_type TEXT DEFAULT 'Dinner',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS groceries (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  done INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bear_profile (
  id INTEGER PRIMARY KEY CHECK(id=1),
  food TEXT DEFAULT '',
  feeding_notes TEXT DEFAULT '',
  vet_info TEXT DEFAULT '',
  grooming_notes TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bear_routines (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  frequency TEXT DEFAULT 'Daily',
  time_label TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bear_logs (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bear_reminders (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  notes TEXT DEFAULT '',
  done INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL CHECK(name IN ('Michelle','Chad')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  member TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  location TEXT DEFAULT '',
  who TEXT DEFAULT 'Family',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  assignee TEXT DEFAULT 'Either',
  category TEXT DEFAULT 'Household',
  due_date TEXT DEFAULT '',
  done BOOLEAN DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refills (
  id SERIAL PRIMARY KEY,
  medication TEXT NOT NULL,
  next_due TEXT NOT NULL,
  interval_days INTEGER DEFAULT 30,
  person TEXT DEFAULT 'Michelle',
  pharmacy TEXT DEFAULT '',
  dosage TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  meal_type TEXT DEFAULT 'Dinner',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS groceries (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  quantity TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  done BOOLEAN DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bear_profile (
  id INTEGER PRIMARY KEY CHECK(id=1),
  food TEXT DEFAULT '',
  feeding_notes TEXT DEFAULT '',
  vet_info TEXT DEFAULT '',
  grooming_notes TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bear_routines (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  frequency TEXT DEFAULT 'Daily',
  time_label TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bear_logs (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bear_reminders (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  notes TEXT DEFAULT '',
  done BOOLEAN DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

async function initDb() {
  const schema = usePg ? PG_SCHEMA : SQLITE_SCHEMA;
  if (usePg) {
    await pool.query(schema);
  } else {
    sqliteDb.exec(schema);
  }
}

const DATA_TABLES = [
  "events",
  "tasks",
  "refills",
  "meals",
  "groceries",
  "bear_profile",
  "bear_routines",
  "bear_logs",
  "bear_reminders",
];

// Seed demo data only when ALL data tables are empty. Runs at startup.
async function seedIfEmpty() {
  for (const table of DATA_TABLES) {
    const row = await get(`SELECT COUNT(*) AS n FROM ${table}`);
    if (row && Number(row.n) > 0) return false;
  }
  const { buildSeed } = require("./seed");
  const today = new Date().toISOString().slice(0, 10);
  const seed = buildSeed(today);
  const now = new Date().toISOString();
  const createdBy = "Michelle";

  for (const e of seed.events) {
    await run(
      "INSERT INTO events (title, date, time, location, who, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [e.title, e.date, e.time, e.location, e.who, createdBy, now]
    );
  }
  for (const t of seed.tasks) {
    await run(
      "INSERT INTO tasks (title, assignee, category, due_date, done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [t.title, t.assignee, t.category, t.dueDate, Boolean(t.done), createdBy, now]
    );
  }
  for (const r of seed.refills) {
    await run(
      "INSERT INTO refills (medication, next_due, interval_days, person, pharmacy, dosage, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [r.medication, r.nextDue, r.intervalDays, r.person, r.pharmacy, r.dosage, r.notes, createdBy, now]
    );
  }
  for (const m of seed.meals) {
    await run(
      "INSERT INTO meals (date, title, meal_type, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [m.date, m.title, m.mealType, m.notes, createdBy, now]
    );
  }
  for (const g of seed.groceries) {
    await run(
      "INSERT INTO groceries (title, quantity, category, done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [g.title, g.quantity, g.category, Boolean(g.done), createdBy, now]
    );
  }
  for (const r of seed.bearRoutines) {
    await run(
      "INSERT INTO bear_routines (title, category, frequency, time_label, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [r.title, r.category, r.frequency, r.timeLabel, r.notes, createdBy, now]
    );
  }
  for (const r of seed.bearReminders) {
    await run(
      "INSERT INTO bear_reminders (title, date, category, notes, done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
      [r.title, r.date, r.category, r.notes, Boolean(r.done), createdBy, now]
    );
  }
  // Bear profile and bear logs are intentionally not seeded.
  return true;
}

module.exports = { get, all, run, initDb, seedIfEmpty, usePg };
