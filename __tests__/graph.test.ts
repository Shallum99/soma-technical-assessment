import { describe, it, expect } from "vitest";
import {
  topologicalSort,
  analyzeGraph,
  canReach,
  wouldCreateCycle,
  type TodoNode,
} from "@/lib/graph";

// ─── Helpers ────────────────────────────────────────────────────────────────

// All nodes use the same createdAt — the algorithm should not depend on it.
const BASE = "2024-01-01T00:00:00.000Z";

function node(id: number, deps: number[] = []): TodoNode {
  return {
    id,
    title: `Task ${id}`,
    dueDate: null,
    createdAt: BASE,
    dependsOn: deps.map((d) => ({ dependsOnId: d })),
  };
}

// Fixed project-start used by every analyzeGraph call so tests are deterministic.
const START = new Date("2024-01-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const startTime = START.getTime();

// ─── topologicalSort ────────────────────────────────────────────────────────

describe("topologicalSort", () => {
  it("returns empty array for no todos", () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it("returns single node", () => {
    expect(topologicalSort([node(1)])).toEqual([1]);
  });

  it("respects linear chain order", () => {
    const result = topologicalSort([node(1), node(2, [1]), node(3, [2])]);
    expect(result).not.toBeNull();
    const i1 = result!.indexOf(1);
    const i2 = result!.indexOf(2);
    const i3 = result!.indexOf(3);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });

  it("returns null for a cycle (2-node)", () => {
    expect(topologicalSort([node(1, [2]), node(2, [1])])).toBeNull();
  });

  it("returns null for a cycle (3-node)", () => {
    expect(
      topologicalSort([node(1, [3]), node(2, [1]), node(3, [2])])
    ).toBeNull();
  });

  it("handles diamond dependency", () => {
    const todos = [node(1), node(2, [1]), node(3, [1]), node(4, [2, 3])];
    const result = topologicalSort(todos);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    expect(result!.indexOf(1)).toBeLessThan(result!.indexOf(2));
    expect(result!.indexOf(1)).toBeLessThan(result!.indexOf(3));
    expect(result!.indexOf(2)).toBeLessThan(result!.indexOf(4));
    expect(result!.indexOf(3)).toBeLessThan(result!.indexOf(4));
  });

  it("handles multiple independent chains", () => {
    const todos = [node(1), node(2, [1]), node(10), node(11, [10])];
    const result = topologicalSort(todos);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    expect(result!.indexOf(1)).toBeLessThan(result!.indexOf(2));
    expect(result!.indexOf(10)).toBeLessThan(result!.indexOf(11));
  });

  it("handles tasks with multiple dependencies", () => {
    const todos = [node(1), node(2), node(3), node(4, [1, 2, 3])];
    const result = topologicalSort(todos);
    expect(result).not.toBeNull();
    expect(result!.indexOf(4)).toBe(3);
  });
});

// ─── canReach ───────────────────────────────────────────────────────────────

describe("canReach", () => {
  it("returns false for empty adjacency", () => {
    expect(canReach(1, 2, new Map())).toBe(false);
  });

  it("returns true for direct edge", () => {
    expect(canReach(1, 2, new Map([[1, [2]]]))).toBe(true);
  });

  it("returns true for transitive path", () => {
    const adj = new Map([
      [1, [2]],
      [2, [3]],
    ]);
    expect(canReach(1, 3, adj)).toBe(true);
  });

  it("returns false for unreachable node", () => {
    const adj = new Map([
      [1, [2]],
      [3, [4]],
    ]);
    expect(canReach(1, 4, adj)).toBe(false);
  });

  it("returns false for reverse direction", () => {
    expect(canReach(2, 1, new Map([[1, [2]]]))).toBe(false);
  });

  it("handles cycles without infinite loop", () => {
    const adj = new Map([
      [1, [2]],
      [2, [1]],
    ]);
    expect(canReach(1, 2, adj)).toBe(true);
    expect(canReach(2, 1, adj)).toBe(true);
  });
});

// ─── wouldCreateCycle ───────────────────────────────────────────────────────

describe("wouldCreateCycle", () => {
  it("returns false for no edges", () => {
    expect(wouldCreateCycle(1, 2, [])).toBe(false);
  });

  it("detects direct back-edge", () => {
    const edges = [{ todoId: 2, dependsOnId: 1 }];
    expect(wouldCreateCycle(1, 2, edges)).toBe(true);
  });

  it("detects transitive cycle", () => {
    const edges = [
      { todoId: 2, dependsOnId: 1 },
      { todoId: 3, dependsOnId: 2 },
    ];
    expect(wouldCreateCycle(1, 3, edges)).toBe(true);
  });

  it("allows non-cyclic addition", () => {
    const edges = [{ todoId: 2, dependsOnId: 1 }];
    expect(wouldCreateCycle(3, 1, edges)).toBe(false);
  });

  it("allows adding to parallel chain", () => {
    const edges = [
      { todoId: 2, dependsOnId: 1 },
      { todoId: 4, dependsOnId: 3 },
    ];
    expect(wouldCreateCycle(4, 1, edges)).toBe(false);
  });

  it("detects cycle through diamond", () => {
    const edges = [
      { todoId: 2, dependsOnId: 1 },
      { todoId: 3, dependsOnId: 1 },
      { todoId: 4, dependsOnId: 2 },
      { todoId: 4, dependsOnId: 3 },
    ];
    expect(wouldCreateCycle(1, 4, edges)).toBe(true);
  });
});

// ─── analyzeGraph ───────────────────────────────────────────────────────────

describe("analyzeGraph", () => {
  it("returns empty for no todos", () => {
    const result = analyzeGraph([], START);
    expect(result.criticalPath).toEqual([]);
    expect(result.earliestStart.size).toBe(0);
    expect(result.earliestFinish.size).toBe(0);
  });

  it("returns single-node critical path for lone task", () => {
    const result = analyzeGraph([node(1)], START);
    expect(result.criticalPath).toEqual([1]);
    expect(result.earliestStart.get(1)!.getTime()).toBe(startTime);
    expect(result.earliestFinish.get(1)!.getTime()).toBe(startTime + DAY);
  });

  it("computes correct critical path for linear chain", () => {
    const todos = [node(1), node(2, [1]), node(3, [2])];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toEqual([1, 2, 3]);
  });

  it("computes earliest start dates based on dependencies", () => {
    const todos = [node(1), node(2, [1]), node(3, [2])];
    const result = analyzeGraph(todos, START);

    expect(result.earliestStart.get(1)!.getTime()).toBe(startTime);
    expect(result.earliestStart.get(2)!.getTime()).toBe(startTime + DAY);
    expect(result.earliestStart.get(3)!.getTime()).toBe(startTime + 2 * DAY);
  });

  it("uses the earliest createdAt as the default project baseline", () => {
    const todos = [
      {
        ...node(1),
        createdAt: "2024-02-01T00:00:00.000Z",
      },
      {
        ...node(2, [1]),
        createdAt: "2024-03-01T00:00:00.000Z",
      },
    ];
    const result = analyzeGraph(todos);
    const inferredStart = new Date("2024-02-01T00:00:00.000Z").getTime();

    expect(result.earliestStart.get(1)!.getTime()).toBe(inferredStart);
    expect(result.earliestStart.get(2)!.getTime()).toBe(inferredStart + DAY);
  });

  it("all root tasks share the same baseline regardless of createdAt", () => {
    // Task 1 was created much later than task 2 — should not matter.
    const todos = [
      {
        ...node(1),
        createdAt: "2025-06-01T00:00:00.000Z",
      },
      node(2),
    ];
    const result = analyzeGraph(todos, START);
    // Both root tasks start at projectStart, not their createdAt
    expect(result.earliestStart.get(1)!.getTime()).toBe(startTime);
    expect(result.earliestStart.get(2)!.getTime()).toBe(startTime);
  });

  it("independent task does NOT steal critical path from a chain", () => {
    // Chain: 1 → 2 → 3  (depth 3)
    // Independent: 4     (depth 1)
    // Critical path must be the chain, not the standalone task.
    const todos = [node(1), node(2, [1]), node(3, [2]), node(4)];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toEqual([1, 2, 3]);
  });

  it("picks longest path as critical path in a diamond", () => {
    const todos = [node(1), node(2, [1]), node(3, [1]), node(4, [2, 3])];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toHaveLength(3);
    expect(result.criticalPath[0]).toBe(1);
    expect(result.criticalPath[2]).toBe(4);
  });

  it("selects the longer branch as critical path", () => {
    // Short: 1 → 3
    // Long:  1 → 2 → 3
    const todos = [node(1), node(2, [1]), node(3, [1, 2])];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toEqual([1, 2, 3]);
  });

  it("returns empty analysis for cyclic graph", () => {
    const todos = [node(1, [2]), node(2, [1])];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toEqual([]);
    expect(result.earliestStart.size).toBe(0);
  });

  it("handles independent tasks (critical path is single deepest)", () => {
    const todos = [node(1), node(2), node(3)];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toHaveLength(1);
    // All start at the same time
    for (const id of [1, 2, 3]) {
      expect(result.earliestStart.get(id)!.getTime()).toBe(startTime);
    }
  });

  it("later-created independent task does not become critical path over a chain", () => {
    // This is the exact scenario the reviewer reproduced:
    // Chain 1→2→3, then a standalone task 4 created at a much later date.
    // With the old createdAt-based model, task 4 could beat the chain.
    // With the fixed model, it must not.
    const todos = [
      node(1),
      node(2, [1]),
      node(3, [2]),
      {
        ...node(4),
        createdAt: "2099-01-01T00:00:00.000Z", // far future — should be irrelevant
      },
    ];
    const result = analyzeGraph(todos, START);
    expect(result.criticalPath).toEqual([1, 2, 3]);
  });
});
