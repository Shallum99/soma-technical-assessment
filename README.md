## Soma Capital Technical Assessment

This is a technical assessment as part of the interview process for Soma Capital.

> [!IMPORTANT]  
> You will need a Pexels API key to complete the technical assessment portion of the application. You can sign up for a free API key at https://www.pexels.com/api/  

To begin, clone this repository to your local machine.

## Development

This is a [NextJS](https://nextjs.org) app, with a SQLite based backend, intended to be run with the LTS version of Node.

To run the development server:

```bash
npm i
npm run dev
```

## Task:

Modify the code to add support for due dates, image previews, and task dependencies.

### Part 1: Due Dates 

When a new task is created, users should be able to set a due date.

When showing the task list is shown, it must display the due date, and if the date is past the current time, the due date should be in red.

### Part 2: Image Generation 

When a todo is created, search for and display a relevant image to visualize the task to be done. 

To do this, make a request to the [Pexels API](https://www.pexels.com/api/) using the task description as a search query. Display the returned image to the user within the appropriate todo item. While the image is being loaded, indicate a loading state.

You will need to sign up for a free Pexels API key to make the fetch request. 

### Part 3: Task Dependencies

Implement a task dependency system that allows tasks to depend on other tasks. The system must:

1. Allow tasks to have multiple dependencies
2. Prevent circular dependencies
3. Show the critical path
4. Calculate the earliest possible start date for each task based on its dependencies
5. Visualize the dependency graph

## Submission:

1. Add a new "Solution" section to this README with a description and screenshot or recording of your solution. 
2. Push your changes to a public GitHub repository.
3. Submit a link to your repository in the application form.

Thanks for your time and effort. We'll be in touch soon!

---

## Solution

### Setup

```bash
npm install
```

Create a `.env.local` file with your Pexels API key:

```env
DATABASE_URL="file:./dev.db"
PEXELS_API_KEY=your_key_here
```

> The Pexels key sentinel in the code checks for exactly `your_key_here`, so leave that placeholder as-is until you replace it with a real key.

Run the development server:

```bash
npm run dev
```

Optionally seed with example data (server must be running):

```bash
node seed.mjs 1    # Software project — 6 tasks, dependencies, critical path
node seed.mjs 2    # Event planning — 5 tasks, overdue dates, completions
node seed.mjs 3    # Home renovation — 7 tasks, long dependency chain
node seed.mjs 4    # Startup launch — 8 tasks, multiple critical paths
node seed.mjs 5    # Simple demo — 3 tasks, minimal
```

Run tests:

```bash
npm test
```

### Screenshots

**Task list** — inline image thumbnails, sortable columns, overdue dates in red, critical path badges, task completion:

![Task list with due dates and inline images](screenshots/01-task-list.png)

**Expanded row** — larger image preview (click to open full-size dialog), earliest start date, dependency management with multi-select picker:

![Expanded row with image preview and dependencies](screenshots/02-expanded-row.png)

**Dependency graph** — interactive React Flow visualization with critical path highlighted in orange, animated edges, and critical path summary:

![Dependency graph with critical path](screenshots/03-dependency-graph.png)

---

### Part 1: Due Dates

- Added an optional `dueDate` field to the Todo model via Prisma migration.
- Inline date picker in the task creation row with `maxLength` validation.
- Sortable due date column — click the header to toggle ascending/descending.
- Due dates are stored as end-of-day (23:59:59). Overdue detection compares the stored timestamp against the current time, so a task due "today" is shown in **red** with a warning icon starting the following morning.

### Part 2: Image Previews (Pexels API)

- Todo creation is a two-step process: the task row is inserted and returned immediately, then the Pexels image is fetched asynchronously via a separate `loadTodoImage` server action. This keeps creation fast and allows the **todo item itself** to display an animated skeleton placeholder while the image search runs.
- Once the Pexels response arrives, the image URL is persisted and the UI refreshes to show the inline thumbnail.
- Clicking the thumbnail in the expanded row opens a **full-size preview dialog** (Radix Dialog).
- The Pexels fetch has a **5-second timeout** so task creation is never blocked indefinitely by an external API.
- The Pexels API key is stored in `.env.local` and only accessed server-side — never exposed to the client.

### Part 3: Task Dependencies

- **Data model**: A `TodoDependency` join table with a unique constraint on `(todoId, dependsOnId)` to prevent duplicate edges. Cascade deletes ensure cleanup when a task is removed.

- **Multiple dependencies**: Expanding a task row reveals a dependency section with a searchable multi-select picker. Select multiple targets with checkboxes and confirm with a single "Add N dependencies" button.

- **Circular dependency prevention** — dual defense:
  - **Client-side**: DFS reachability check (`canReach`) filters invalid options out of the picker entirely, so users never see an option that would create a cycle.
  - **Server-side**: `wouldCreateCycle` loads all edges in a single query and runs an in-memory BFS check before creating the dependency. Returns a clear error if a cycle would result.

- **Critical path**: All root tasks (no dependencies) share a common project-start baseline, so the critical path is determined purely by dependency-graph depth — not task creation order. Computed via Kahn's topological sort, a forward pass for earliest start/finish, and iterative traceback from the latest-finishing task. Critical path tasks are highlighted with orange badges and row tinting.

- **Earliest start dates**: Calculated per task based on its dependency chain (each task assumed to take 1 day). Displayed in the expanded row for tasks with dependencies, along with a warning about critical path impact.

- **Interactive dependency graph** (React Flow): The "Dependencies" tab shows a draggable, zoomable graph with:
  - Hierarchical left-to-right layout computed by topological level
  - Critical path nodes highlighted with orange borders and shadow
  - Animated dashed edges on the critical path, dimmed gray edges elsewhere
  - Draggable nodes with zoom/pan controls
  - Only connected tasks are shown (tasks without dependencies are hidden for clarity)

### Beyond the Requirements

- **Task completion**: Click the circle icon to mark tasks done. Completed tasks show strikethrough text and muted styling. Overdue indicators are hidden for completed tasks. Uses optimistic UI with rollback on server failure.
- **Status filters**: Filter by All / Pending / Completed with live counts. Filter state is persisted in the URL via nuqs (e.g., `?status=pending&tab=dependencies`).
- **Delete confirmation**: Styled modal dialog instead of browser `confirm()` for consistent UX.
- **Error boundary**: Wraps the app to catch render errors gracefully instead of white-screening.
- **Loading states**: Spinner on the Add button during task creation, spinner and disabled controls during dependency add/remove operations, dimmed rows during optimistic transitions.
- **Accessibility**: `aria-label` on all interactive controls (toggle, sort, delete, filter, search), `role="alert"` on error messages, `aria-pressed` on filter buttons, `aria-expanded` on expandable rows.
- **Input validation**: Title trimming and 500-character max length enforced server-side.
- **Form semantics**: Add-task inputs wrapped in a `<form>` element with `onSubmit`.

### Testing

30 unit tests covering the graph algorithm library (`lib/graph.ts`):

- **`topologicalSort`** — empty input, single node, linear chains, diamond dependencies, cycles, multiple independent chains, multi-dependency nodes
- **`canReach`** — direct edges, transitive paths, unreachable nodes, reverse direction, cycle handling
- **`wouldCreateCycle`** — no edges, direct back-edges, transitive cycles, parallel chains, diamond cycles
- **`analyzeGraph`** — empty input, single-node critical path, linear chains, earliest start calculation, diamond path selection, longer branch selection, cyclic input, independent tasks, fixed baseline verification, proof that later-created independent tasks cannot steal the critical path from a dependency chain

```bash
npm test          # run once
npm run test:watch  # watch mode
```

### Architecture

```
app/
  page.tsx              Server component — fetches todos, passes to client
  layout.tsx            Root layout with NuqsAdapter + ErrorBoundary
  actions/todos.ts      Server actions for all mutations (create, delete, toggle, deps)
  api/todos/            REST API routes (kept for programmatic/external access)

components/
  todo-app.tsx          Main client component — state, handlers, UI orchestration
  dependency-graph.tsx  React Flow visualization with hierarchical layout
  error-boundary.tsx    Class-based error boundary with retry
  ui/                   shadcn/ui primitives (Button, Badge, Dialog, Tabs)

lib/
  graph.ts              Pure functions: topologicalSort, analyzeGraph, canReach, wouldCreateCycle
  types.ts              Shared TypeScript interfaces (Todo, SortField, SortDir)
  prisma.ts             Prisma client singleton
  pexels.ts             Pexels API integration
  utils.ts              cn() utility (clsx + tailwind-merge)

prisma/
  schema.prisma         Todo + TodoDependency models with cascade deletes

__tests__/
  graph.test.ts         30 tests for graph algorithms (vitest)
```

### Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 14 (App Router) | Server components + server actions eliminate client-side data waterfalls |
| Database | Prisma + SQLite | Type-safe ORM with simple file-based DB, zero config |
| UI | shadcn/ui (Radix + Tailwind + CVA) | Accessible primitives with consistent styling |
| Graph viz | React Flow | Interactive pan/zoom/drag with animated edges |
| URL state | nuqs | Tab and filter state shareable via URL |
| Icons | Lucide | Consistent, tree-shakeable icon set |
| Testing | Vitest | Fast, TypeScript-native, zero-config test runner |
