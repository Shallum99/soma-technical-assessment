// Pure graph analysis functions for task dependencies

export interface TodoNode {
  id: number;
  title: string;
  dueDate: string | null;
  createdAt: string;
  dependsOn: { dependsOnId: number }[];
}

// The prompt does not include task durations, so the schedule defaults to
// a one-day duration per task.
const TASK_DURATION_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getTaskDurationMs(_todo: TodoNode) {
  return TASK_DURATION_MS;
}

/** Kahn's algorithm — returns topological order or null if cycle exists */
export function topologicalSort(todos: TodoNode[]): number[] | null {
  const todoIds = new Set(todos.map((todo) => todo.id));
  const inDegree = new Map<number, number>();
  const adjList = new Map<number, number[]>();

  for (const todo of todos) {
    inDegree.set(todo.id, 0);
    if (!adjList.has(todo.id)) adjList.set(todo.id, []);
  }

  for (const todo of todos) {
    for (const dep of todo.dependsOn) {
      if (!todoIds.has(dep.dependsOnId)) continue;
      const list = adjList.get(dep.dependsOnId) || [];
      list.push(todo.id);
      adjList.set(dep.dependsOnId, list);
      inDegree.set(todo.id, (inDegree.get(todo.id) || 0) + 1);
    }
  }

  // Index-based queue avoids O(n) shift on each dequeue
  const queue: number[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: number[] = [];
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    sorted.push(node);
    for (const neighbor of adjList.get(node) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted.length === todos.length ? sorted : null;
}

export interface GraphAnalysis {
  earliestStart: Map<number, Date>;
  earliestFinish: Map<number, Date>;
  latestStart: Map<number, Date>;
  latestFinish: Map<number, Date>;
  slackMs: Map<number, number>;
  criticalEdgeIds: string[];
  criticalPath: number[];
  criticalPaths: number[][];
  criticalTaskIds: number[];
  projectFinish: Date | null;
  projectStart: Date;
}

/**
 * Forward-pass schedule + critical path computation.
 *
 * All root tasks (no dependencies) start at `projectStart`, which defaults to
 * the current local day if no baseline is provided.
 */
export function analyzeGraph(
  todos: TodoNode[],
  projectStart?: Date
): GraphAnalysis {
  const baseline = projectStart ? new Date(projectStart) : startOfDay(new Date());
  const empty: GraphAnalysis = {
    earliestStart: new Map(),
    earliestFinish: new Map(),
    latestStart: new Map(),
    latestFinish: new Map(),
    slackMs: new Map(),
    criticalEdgeIds: [],
    criticalPath: [],
    criticalPaths: [],
    criticalTaskIds: [],
    projectFinish: null,
    projectStart: baseline,
  };
  if (!todos || todos.length === 0) return empty;

  const todoMap = new Map<number, TodoNode>();
  for (const t of todos) todoMap.set(t.id, t);

  const sorted = topologicalSort(todos);
  if (!sorted) return empty;

  const successors = new Map<number, number[]>();
  for (const todo of todos) {
    if (!successors.has(todo.id)) successors.set(todo.id, []);
    for (const dep of todo.dependsOn) {
      if (!todoMap.has(dep.dependsOnId)) continue;
      const next = successors.get(dep.dependsOnId) || [];
      next.push(todo.id);
      successors.set(dep.dependsOnId, next);
    }
  }

  // Forward pass: compute earliest start/finish for each task.
  const earliestStart = new Map<number, Date>();
  const earliestFinish = new Map<number, Date>();

  for (const id of sorted) {
    const todo = todoMap.get(id)!;
    let es = baseline;

    for (const dep of todo.dependsOn) {
      if (!todoMap.has(dep.dependsOnId)) continue;
      const depFinish = earliestFinish.get(dep.dependsOnId);
      if (depFinish && depFinish > es) es = depFinish;
    }

    earliestStart.set(id, es);
    earliestFinish.set(id, new Date(es.getTime() + getTaskDurationMs(todo)));
  }

  let projectFinish = earliestFinish.get(sorted[0]) || baseline;
  for (const id of sorted) {
    const ef = earliestFinish.get(id) || new Date();
    if (ef > projectFinish) projectFinish = ef;
  }

  const latestStart = new Map<number, Date>();
  const latestFinish = new Map<number, Date>();

  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i];
    const todo = todoMap.get(id)!;
    const downstream = successors.get(id) || [];

    let lf = projectFinish;
    if (downstream.length > 0) {
      lf = new Date(
        Math.min(
          ...downstream.map(
            (nextId) => latestStart.get(nextId)?.getTime() ?? projectFinish.getTime()
          )
        )
      );
    }

    latestFinish.set(id, lf);
    latestStart.set(id, new Date(lf.getTime() - getTaskDurationMs(todo)));
  }

  const slackMs = new Map<number, number>();
  const criticalTaskIds = sorted.filter((id) => {
    const slack =
      (latestStart.get(id)?.getTime() ?? 0) -
      (earliestStart.get(id)?.getTime() ?? 0);
    slackMs.set(id, slack);
    return slack === 0;
  });

  const criticalTaskSet = new Set(criticalTaskIds);
  const criticalEdgeIds: string[] = [];
  const criticalSuccessors = new Map<number, number[]>();
  const criticalIncoming = new Map<number, number[]>();

  for (const todo of todos) {
    for (const dep of todo.dependsOn) {
      if (!criticalTaskSet.has(dep.dependsOnId) || !criticalTaskSet.has(todo.id)) {
        continue;
      }
      const depFinish = earliestFinish.get(dep.dependsOnId);
      const todoStart = earliestStart.get(todo.id);
      if (!depFinish || !todoStart) continue;
      if (depFinish.getTime() !== todoStart.getTime()) continue;

      const edgeId = `${dep.dependsOnId}-${todo.id}`;
      criticalEdgeIds.push(edgeId);

      const next = criticalSuccessors.get(dep.dependsOnId) || [];
      next.push(todo.id);
      criticalSuccessors.set(dep.dependsOnId, next);

      const incoming = criticalIncoming.get(todo.id) || [];
      incoming.push(dep.dependsOnId);
      criticalIncoming.set(todo.id, incoming);
    }
  }

  const topoIndex = new Map(sorted.map((id, index) => [id, index]));
  for (const [id, nextIds] of Array.from(criticalSuccessors.entries())) {
    nextIds.sort((a, b) => (topoIndex.get(a) ?? 0) - (topoIndex.get(b) ?? 0));
    criticalSuccessors.set(id, nextIds);
  }

  const criticalRoots = criticalTaskIds.filter(
    (id) => (criticalIncoming.get(id) || []).length === 0
  );

  const criticalPaths: number[][] = [];
  const dfs = (path: number[], currentId: number) => {
    const nextIds = criticalSuccessors.get(currentId) || [];
    if (nextIds.length === 0) {
      criticalPaths.push(path);
      return;
    }
    for (const nextId of nextIds) {
      dfs([...path, nextId], nextId);
    }
  };

  for (const rootId of criticalRoots) {
    dfs([rootId], rootId);
  }

  const criticalPath =
    criticalPaths.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return (topoIndex.get(a[0]) ?? 0) - (topoIndex.get(b[0]) ?? 0);
    })[0] || [];

  for (const id of sorted) {
    if (!slackMs.has(id)) {
      const slack =
        (latestStart.get(id)?.getTime() ?? 0) -
        (earliestStart.get(id)?.getTime() ?? 0);
      slackMs.set(id, slack);
    }
  }

  return {
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    slackMs,
    criticalEdgeIds,
    criticalPath,
    criticalPaths,
    criticalTaskIds,
    projectFinish,
    projectStart: baseline,
  };
}

/** DFS reachability check — returns true if `from` can reach `to` through edges */
export function canReach(
  from: number,
  to: number,
  adjacency: Map<number, number[]>
): boolean {
  const visited = new Set<number>();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) || []) {
      stack.push(neighbor);
    }
  }
  return false;
}

/**
 * Check if adding edge (todoId depends on dependsOnId) would create a cycle.
 * Takes the full edge list to run in-memory — no N+1 DB queries.
 */
export function wouldCreateCycle(
  todoId: number,
  dependsOnId: number,
  edges: { todoId: number; dependsOnId: number }[]
): boolean {
  // Build adjacency: task → [tasks it depends on]
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    if (!adj.has(e.todoId)) adj.set(e.todoId, []);
    adj.get(e.todoId)!.push(e.dependsOnId);
  }
  // If dependsOnId can reach todoId through existing deps, adding the edge creates a cycle
  return canReach(dependsOnId, todoId, adj);
}
