// Pure graph analysis functions for task dependencies

export interface TodoNode {
  id: number;
  title: string;
  dueDate: string | null;
  createdAt: string;
  dependsOn: { dependsOnId: number }[];
}

const TASK_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day

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

  const queue: number[] = [];
  Array.from(inDegree.entries()).forEach(([id, deg]) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: number[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
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

  // Forward pass
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

  // Find the task with the latest finish → end of critical path
  let latestFinishId = sorted[0];
  let latestFinishTime = earliestFinish.get(sorted[0]) || new Date();
  for (const id of sorted) {
    const ef = earliestFinish.get(id) || new Date();
    if (ef >= latestFinishTime) {
      latestFinishTime = ef;
      latestFinishId = id;
    }
  }

  // Trace back from latest-finishing task along the critical predecessors
  const criticalPath: number[] = [];
  const traceBack = (id: number) => {
    criticalPath.unshift(id);
    const todo = todoMap.get(id)!;
    if (todo.dependsOn.length === 0) return;

    let criticalPred = -1;
    let criticalFinish = new Date(0);
    for (const dep of todo.dependsOn) {
      const ef = earliestFinish.get(dep.dependsOnId) || new Date(0);
      if (ef >= criticalFinish) {
        criticalFinish = ef;
        criticalPred = dep.dependsOnId;
      }
    }
    if (criticalPred !== -1) traceBack(criticalPred);
  };
  traceBack(latestFinishId);

  return { earliestStart, earliestFinish, criticalPath };
}

/** DFS reachability check — returns true if `from` can reach `to` through existing edges */
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
