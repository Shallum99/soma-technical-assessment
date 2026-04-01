#!/usr/bin/env node

/**
 * Seed script for the Things To Do app.
 * Usage: node seed.mjs [example-number]
 *
 * Examples:
 *   node seed.mjs 1   — Software project (6 tasks, dependencies, critical path)
 *   node seed.mjs 2   — Event planning (5 tasks, overdue dates, completions)
 *   node seed.mjs 3   — Home renovation (7 tasks, complex dependency chain)
 *   node seed.mjs 4   — Startup launch (8 tasks, multiple critical paths)
 *   node seed.mjs 5   — Simple demo (3 tasks, minimal, quick test)
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const API = `${BASE}/api/todos`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTask(title, dueDate) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, dueDate: dueDate || null }),
  });
  const todo = await res.json();
  console.log(`  + ${title}${dueDate ? ` (due ${dueDate})` : ""}`);
  return todo;
}

async function addDep(todoId, dependsOnId, todoTitle, depTitle) {
  await fetch(`${API}/${todoId}/dependencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dependsOnId }),
  });
  console.log(`  → ${todoTitle} depends on ${depTitle}`);
}

async function complete(todoId, title) {
  await fetch(`${API}/${todoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  console.log(`  ✓ ${title} marked complete`);
}

async function clearAll() {
  const res = await fetch(API);
  const todos = await res.json();
  for (const t of todos) {
    await fetch(`${API}/${t.id}`, { method: "DELETE" });
  }
  if (todos.length > 0) console.log(`  Cleared ${todos.length} existing tasks\n`);
}

// ─── Examples ────────────────────────────────────────────────────────────────

const examples = {
  1: {
    name: "Software Project",
    description: "6 tasks with full dependency chain, 2 completed, overdue dates",
    run: async () => {
      const t1 = await createTask("Design wireframes", "2026-03-15");
      const t2 = await createTask("Set up database", "2026-03-20");
      const t3 = await createTask("Build API endpoints", "2026-05-01");
      const t4 = await createTask("Build frontend UI", "2026-05-15");
      const t5 = await createTask("Write unit tests", "2026-06-01");
      const t6 = await createTask("Deploy to production");

      console.log("\n  Adding dependencies...");
      await addDep(t3.id, t2.id, t3.title, t2.title);
      await addDep(t4.id, t1.id, t4.title, t1.title);
      await addDep(t4.id, t3.id, t4.title, t3.title);
      await addDep(t5.id, t3.id, t5.title, t3.title);
      await addDep(t6.id, t4.id, t6.title, t4.title);
      await addDep(t6.id, t5.id, t6.title, t5.title);

      console.log("\n  Marking completed...");
      await complete(t1.id, t1.title);
      await complete(t2.id, t2.title);
    },
  },

  2: {
    name: "Event Planning",
    description: "5 tasks for a conference, mix of overdue and upcoming, some completed",
    run: async () => {
      const t1 = await createTask("Book venue", "2026-02-01");
      const t2 = await createTask("Send invitations", "2026-03-01");
      const t3 = await createTask("Arrange catering", "2026-03-25");
      const t4 = await createTask("Set up AV equipment", "2026-04-10");
      const t5 = await createTask("Print name badges", "2026-04-08");

      console.log("\n  Adding dependencies...");
      await addDep(t2.id, t1.id, t2.title, t1.title);
      await addDep(t3.id, t1.id, t3.title, t1.title);
      await addDep(t4.id, t1.id, t4.title, t1.title);
      await addDep(t5.id, t2.id, t5.title, t2.title);

      console.log("\n  Marking completed...");
      await complete(t1.id, t1.title);
      await complete(t2.id, t2.title);
      await complete(t3.id, t3.title);
    },
  },

  3: {
    name: "Home Renovation",
    description: "7 tasks with a long dependency chain and parallel work",
    run: async () => {
      const t1 = await createTask("Get permits", "2026-04-01");
      const t2 = await createTask("Demolition", "2026-04-15");
      const t3 = await createTask("Electrical wiring", "2026-05-01");
      const t4 = await createTask("Plumbing", "2026-05-01");
      const t5 = await createTask("Drywall installation", "2026-05-20");
      const t6 = await createTask("Painting", "2026-06-01");
      const t7 = await createTask("Final inspection", "2026-06-15");

      console.log("\n  Adding dependencies...");
      await addDep(t2.id, t1.id, t2.title, t1.title);
      await addDep(t3.id, t2.id, t3.title, t2.title);
      await addDep(t4.id, t2.id, t4.title, t2.title);
      await addDep(t5.id, t3.id, t5.title, t3.title);
      await addDep(t5.id, t4.id, t5.title, t4.title);
      await addDep(t6.id, t5.id, t6.title, t5.title);
      await addDep(t7.id, t6.id, t7.title, t6.title);
    },
  },

  4: {
    name: "Startup Launch",
    description: "8 tasks with multiple parallel critical paths",
    run: async () => {
      const t1 = await createTask("Market research", "2026-03-10");
      const t2 = await createTask("Write business plan", "2026-03-20");
      const t3 = await createTask("Build MVP", "2026-04-15");
      const t4 = await createTask("Design brand identity", "2026-04-01");
      const t5 = await createTask("Set up legal entity", "2026-04-10");
      const t6 = await createTask("Create landing page", "2026-05-01");
      const t7 = await createTask("Beta testing", "2026-05-15");
      const t8 = await createTask("Launch day", "2026-06-01");

      console.log("\n  Adding dependencies...");
      await addDep(t2.id, t1.id, t2.title, t1.title);
      await addDep(t3.id, t2.id, t3.title, t2.title);
      await addDep(t5.id, t2.id, t5.title, t2.title);
      await addDep(t6.id, t4.id, t6.title, t4.title);
      await addDep(t6.id, t3.id, t6.title, t3.title);
      await addDep(t7.id, t3.id, t7.title, t3.title);
      await addDep(t8.id, t6.id, t8.title, t6.title);
      await addDep(t8.id, t7.id, t8.title, t7.title);
      await addDep(t8.id, t5.id, t8.title, t5.title);

      console.log("\n  Marking completed...");
      await complete(t1.id, t1.title);
    },
  },

  5: {
    name: "Simple Demo",
    description: "3 tasks, one dependency, quick test",
    run: async () => {
      const t1 = await createTask("Buy groceries", "2026-04-05");
      const t2 = await createTask("Cook dinner", "2026-04-05");
      const t3 = await createTask("Clean kitchen", "2026-04-06");

      console.log("\n  Adding dependencies...");
      await addDep(t2.id, t1.id, t2.title, t1.title);
      await addDep(t3.id, t2.id, t3.title, t2.title);
    },
  },
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2];

if (!arg || !examples[arg]) {
  console.log("\nThings To Do — Seed Script\n");
  console.log("Usage: node seed.mjs <number>\n");
  console.log("Examples:");
  for (const [num, ex] of Object.entries(examples)) {
    console.log(`  ${num}. ${ex.name} — ${ex.description}`);
  }
  console.log(`\nAdd --keep to skip clearing existing tasks.`);
  console.log(`Set BASE_URL env var to target a different server (default: ${BASE})`);
  process.exit(0);
}

const keepExisting = process.argv.includes("--keep");
const example = examples[arg];

console.log(`\nSeeding: ${example.name}`);
console.log(`Target: ${BASE}\n`);

try {
  if (!keepExisting) await clearAll();
  await example.run();
  console.log(`\nDone! Open ${BASE} to see the results.\n`);
} catch (e) {
  console.error(`\nError: ${e.message}`);
  console.error("Make sure the dev server is running (npm run dev).\n");
  process.exit(1);
}
