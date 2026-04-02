import { describe, it, expect } from "vitest";
import {
  topologicalSort,
  analyzeGraph,
  canReach,
  wouldCreateCycle,
  type TodoNode,
} from "@/lib/graph";

// ─── Helpers ────────────────────────────────────────────────────────────────

function node(
  id: number,
  deps: number[] = [],
  createdAt = "2024-01-01T00:00:00.000Z"
): TodoNode {
  return {
    id,
    title: `Task ${id}`,
    dueDate: null,
    createdAt,
    dependsOn: deps.map((d) => ({ dependsOnId: d })),
  };
}

// ─── topologicalSort ────────────────────────────────────────────────────────

describe("topologicalSort", () => {
  it("returns empty array for no todos", () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it("returns single node", () => {
    expect(topologicalSort([node(1)])).toEqual([1]);
  });

  it("respects linear chain order", () => {
    // 1 → 2 → 3
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
    //   1
    //  / \
    // 2   3
    //  \ /
    //   4
    const todos = [node(1), node(2, [1]), node(3, [1]), node(4, [2, 3])];
    const result = topologicalSort(todos);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);
    // 1 before 2 and 3, both before 4
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
    expect(result!.indexOf(4)).toBe(3); // last
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
    // Should terminate — 1 can reach 2, and 2 can reach 1
    expect(canReach(1, 2, adj)).toBe(true);
    expect(canReach(2, 1, adj)).toBe(true);
  });

  it("returns false when from === to (no self-loop)", () => {
    // from is checked before being added to visited, so from === to is true immediately
    expect(canReach(1, 1, new Map([[1, [2]]]))).toBe(true);
  });
});

// ─── wouldCreateCycle ───────────────────────────────────────────────────────

describe("wouldCreateCycle", () => {
  it("returns false for no edges", () => {
    expect(wouldCreateCycle(1, 2, [])).toBe(false);
  });

  it("detects direct back-edge", () => {
    // 2 depends on 1. Adding "1 depends on 2" creates: 1 → 2 → 1
    const edges = [{ todoId: 2, dependsOnId: 1 }];
    expect(wouldCreateCycle(1, 2, edges)).toBe(true);
  });

  it("detects transitive cycle", () => {
    // 2→1, 3→2. Adding "1 depends on 3" creates: 1→3→2→1
    const edges = [
      { todoId: 2, dependsOnId: 1 },
      { todoId: 3, dependsOnId: 2 },
    ];
    expect(wouldCreateCycle(1, 3, edges)).toBe(true);
  });

  it("allows non-cyclic addition", () => {
    // 2→1. Adding "3 depends on 1" is fine
    const edges = [{ todoId: 2, dependsOnId: 1 }];
    expect(wouldCreateCycle(3, 1, edges)).toBe(false);
  });

  it("allows adding to parallel chain", () => {
    // 2→1, 4→3. Adding "4 depends on 1" is fine
    const edges = [
      { todoId: 2, dependsOnId: 1 },
      { todoId: 4, dependsOnId: 3 },
    ];
    expect(wouldCreateCycle(4, 1, edges)).toBe(false);
  });

  it("detects cycle through diamond", () => {
    // Diamond: 2→1, 3→1, 4→2, 4→3. Adding "1 depends on 4" creates cycle
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
  const DAY = 24 * 60 * 60 * 1000;
  const BASE = "2024-01-01T00:00:00.000Z";
  const baseTime = new Date(BASE).getTime();

  it("returns empty for no todos", () => {
    const result = analyzeGraph([]);
    expect(result.criticalPath).toEqual([]);
    expect(result.earliestStart.size).toBe(0);
    expect(result.earliestFinish.size).toBe(0);
  });

  it("returns single-node critical path for lone task", () => {
    const result = analyzeGraph([node(1)]);
    expect(result.criticalPath).toEqual([1]);
    expect(result.earliestStart.get(1)!.getTime()).toBe(baseTime);
    expect(result.earliestFinish.get(1)!.getTime()).toBe(baseTime + DAY);
  });

  it("computes correct critical path for linear chain", () => {
    const todos = [node(1), node(2, [1]), node(3, [2])];
    const result = analyzeGraph(todos);
    expect(result.criticalPath).toEqual([1, 2, 3]);
  });

  it("computes earliest start dates based on dependencies", () => {
    const todos = [node(1), node(2, [1]), node(3, [2])];
    const result = analyzeGraph(todos);

    expect(result.earliestStart.get(1)!.getTime()).toBe(baseTime);
    expect(result.earliestStart.get(2)!.getTime()).toBe(baseTime + DAY);
    expect(result.earliestStart.get(3)!.getTime()).toBe(baseTime + 2 * DAY);
  });

  it("picks the longest path through a diamond", () => {
    // 1 → 2 → 4
    // 1 → 3 → 4
    // Both paths are equal length (3 nodes), critical path should include 4
    const todos = [node(1), node(2, [1]), node(3, [1]), node(4, [2, 3])];
    const result = analyzeGraph(todos);
    expect(result.criticalPath).toHaveLength(3);
    expect(result.criticalPath[0]).toBe(1);
    expect(result.criticalPath[2]).toBe(4);
  });

  it("selects the longer branch as critical path", () => {
    // Short: 1 → 3
    // Long:  1 → 2 → 3
    // Task 3 depends on both 1 and 2; task 2 depends on 1
    const todos = [node(1), node(2, [1]), node(3, [1, 2])];
    const result = analyzeGraph(todos);
    expect(result.criticalPath).toEqual([1, 2, 3]);
  });

  it("returns empty analysis for cyclic graph", () => {
    const todos = [node(1, [2]), node(2, [1])];
    const result = analyzeGraph(todos);
    expect(result.criticalPath).toEqual([]);
    expect(result.earliestStart.size).toBe(0);
  });

  it("handles independent tasks", () => {
    const todos = [node(1), node(2), node(3)];
    const result = analyzeGraph(todos);
    // All start at the same time; critical path is just one of them
    expect(result.criticalPath).toHaveLength(1);
    for (const id of [1, 2, 3]) {
      expect(result.earliestStart.get(id)!.getTime()).toBe(baseTime);
    }
  });

  it("uses createdAt as baseline for start times", () => {
    const laterDate = "2024-06-01T00:00:00.000Z";
    const laterTime = new Date(laterDate).getTime();
    const todos = [node(1, [], laterDate), node(2, [1], BASE)];
    const result = analyzeGraph(todos);
    // Task 1 starts at its later createdAt
    expect(result.earliestStart.get(1)!.getTime()).toBe(laterTime);
    // Task 2 starts after task 1 finishes
    expect(result.earliestStart.get(2)!.getTime()).toBe(laterTime + DAY);
  });
});
