// Pure graph analysis functions for task dependencies

export interface TodoNode {
  id: number;
  title: string;
  dueDate: string | null;
  createdAt: string;
  dependsOn: { dependsOnId: number }[];
}

// Each task is assumed to take 1 day for scheduling purposes
const TASK_DURATION_MS = 24 * 60 * 60 * 1000;

/** Kahn's algorithm — returns topological order or null if cycle exists */
export function topologicalSort(todos: TodoNode[]): number[] | null {
  const inDegree = new Map<number, number>();
  const adjList = new Map<number, number[]>();

  for (const todo of todos) {
    inDegree.set(todo.id, todo.dependsOn.length);
    if (!adjList.has(todo.id)) adjList.set(todo.id, []);
    for (const dep of todo.dependsOn) {
      const list = adjList.get(dep.dependsOnId) || [];
      list.push(todo.id);
      adjList.set(dep.dependsOnId, list);
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
  criticalPath: number[];
}

/** Forward-pass schedule + critical path computation */
export function analyzeGraph(todos: TodoNode[]): GraphAnalysis {
  const empty: GraphAnalysis = {
    earliestStart: new Map(),
    earliestFinish: new Map(),
    criticalPath: [],
  };
  if (!todos || todos.length === 0) return empty;

  const todoMap = new Map<number, TodoNode>();
  for (const t of todos) todoMap.set(t.id, t);

  const sorted = topologicalSort(todos);
  if (!sorted) return empty;

  // Forward pass: compute earliest start/finish for each task
  const earliestStart = new Map<number, Date>();
  const earliestFinish = new Map<number, Date>();

  for (const id of sorted) {
    const todo = todoMap.get(id)!;
    let es = new Date(todo.createdAt);

    for (const dep of todo.dependsOn) {
      const depFinish = earliestFinish.get(dep.dependsOnId);
      if (depFinish && depFinish > es) es = depFinish;
    }

    earliestStart.set(id, es);
    earliestFinish.set(id, new Date(es.getTime() + TASK_DURATION_MS));
  }

  // Find the task with the latest finish — end of critical path
  let latestFinishId = sorted[0];
  let latestFinishTime = earliestFinish.get(sorted[0]) || new Date();
  for (const id of sorted) {
    const ef = earliestFinish.get(id) || new Date();
    if (ef >= latestFinishTime) {
      latestFinishTime = ef;
      latestFinishId = id;
    }
  }

  // Trace back iteratively from the latest-finishing task along critical predecessors
  const criticalPath: number[] = [];
  let traceId: number | null = latestFinishId;
  while (traceId !== null) {
    criticalPath.unshift(traceId);
    const traceNode: TodoNode = todoMap.get(traceId)!;
    if (traceNode.dependsOn.length === 0) break;

    let criticalPred: number | null = null;
    let criticalFinish = new Date(0);
    for (const dep of traceNode.dependsOn) {
      const ef = earliestFinish.get(dep.dependsOnId) || new Date(0);
      if (ef >= criticalFinish) {
        criticalFinish = ef;
        criticalPred = dep.dependsOnId;
      }
    }
    traceId = criticalPred;
  }

  return { earliestStart, earliestFinish, criticalPath };
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
