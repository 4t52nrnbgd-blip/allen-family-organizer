// Demo seed data for The Allen's.
// Pure function of a "today" date (YYYY-MM-DD): all demo dates are relative
// to it so the demo always looks alive. No users are seeded and no real
// personal or medical details appear here — every title is prefixed "Sample: ".

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(base, n) {
  const d = new Date(base + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

// Next Sunday on or after today (if today is Sunday, today).
function nextSunday(today) {
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = Sunday
  const delta = (7 - dow) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return fmt(d);
}

// Start (Sunday) of the current Sunday-start week containing today.
function weekStart(today) {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return fmt(d);
}

function buildSeed(today) {
  const sunday = nextSunday(today);
  const week = weekStart(today);

  return {
    events: [
      { title: "Sample: Church service", date: sunday, time: "10:00 AM", location: "", who: "Family" },
      { title: "Sample: Hair appointment", date: addDays(today, 3), time: "", location: "", who: "Family" },
      { title: "Sample: Family dinner", date: addDays(today, 5), time: "6:00 PM", location: "", who: "Family" },
    ],
    tasks: [
      { title: "Sample: Take out the recycling", assignee: "Michelle", category: "Household", dueDate: today, done: 0 },
      { title: "Sample: Buy milk", assignee: "Either", category: "Shopping", dueDate: addDays(today, 1), done: 0 },
      { title: "Sample: Vacuum the living room", assignee: "Chad", category: "Household", dueDate: addDays(today, 3), done: 0 },
      { title: "Sample: Call the pharmacy", assignee: "Michelle", category: "Health", dueDate: addDays(today, 1), done: 0 },
      { title: "Sample: Water the plants", assignee: "Either", category: "Household", dueDate: today, done: 1 },
    ],
    refills: [
      { medication: "Sample: Allergy tablets", nextDue: addDays(today, 3), intervalDays: 30, person: "Michelle", pharmacy: "Sample Pharmacy", dosage: "", notes: "" },
      { medication: "Sample: Daily vitamin", nextDue: addDays(today, 12), intervalDays: 30, person: "Chad", pharmacy: "Sample Pharmacy", dosage: "", notes: "" },
    ],
    meals: [
      { date: addDays(week, 0), title: "Sample: Pancakes", mealType: "Breakfast", notes: "" },
      { date: addDays(week, 2), title: "Sample: Spaghetti night", mealType: "Dinner", notes: "" },
    ],
    groceries: [
      { title: "Sample: Milk", quantity: "1 gallon", category: "Meat & dairy", done: 0 },
      { title: "Sample: Bread", quantity: "1 loaf", category: "Bakery", done: 0 },
      { title: "Sample: Apples", quantity: "6", category: "Produce", done: 1 },
    ],
    bearRoutines: [
      { title: "Sample: Morning walk", category: "Walk", frequency: "Daily", timeLabel: "Morning", notes: "" },
      { title: "Sample: Breakfast", category: "Feeding", frequency: "Daily", timeLabel: "Morning", notes: "" },
      { title: "Sample: Dinner", category: "Feeding", frequency: "Daily", timeLabel: "Evening", notes: "" },
      { title: "Sample: Brush and pajama check", category: "Grooming", frequency: "Daily", timeLabel: "Evening", notes: "Check leg fur for mats." },
    ],
    bearReminders: [
      { title: "Sample: Vet checkup", date: addDays(today, 30), category: "Vet", notes: "", done: 0 },
    ],
    // Bear profile is intentionally left empty — the user fills it in.
    bearProfile: null,
    bearLogs: [],
  };
}

module.exports = { buildSeed };
