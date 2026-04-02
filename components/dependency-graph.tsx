"use client";
import React, { useMemo } from "react";
import ReactFlow, {
  Node,
  Edge,
  Position,
  MarkerType,
  Background,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";
import { Badge } from "@/components/ui/badge";
import type { Todo } from "@/lib/types";

interface DependencyGraphProps {
  todos: Todo[];
  criticalTaskIds: number[];
  criticalEdgeIds: string[];
}

export function DependencyGraph({
  todos,
  criticalTaskIds,
  criticalEdgeIds,
}: DependencyGraphProps) {
  const criticalSet = useMemo(() => new Set(criticalTaskIds), [criticalTaskIds]);
  const criticalEdges = useMemo(
    () => new Set(criticalEdgeIds),
    [criticalEdgeIds]
  );

  const { nodes, edges } = useMemo(() => {
    // Only include tasks that are part of the dependency graph
    const connectedIds = new Set<number>();
    for (const t of todos) {
      if (t.dependsOn.length > 0 || t.dependedBy.length > 0) {
        connectedIds.add(t.id);
        for (const dep of t.dependsOn) connectedIds.add(dep.dependsOnId);
        for (const dep of t.dependedBy) connectedIds.add(dep.todoId);
      }
    }
    const connectedTodos = todos.filter((t) => connectedIds.has(t.id));

    const todoMap = new Map<number, Todo>();
    for (const t of connectedTodos) todoMap.set(t.id, t);

    // Compute levels (distance from root nodes) using memoized iterative approach
    const levels = new Map<number, number>();

    const computeLevel = (startId: number): number => {
      if (levels.has(startId)) return levels.get(startId)!;

      // Iterative DFS with post-order processing
      const stack: { id: number; phase: "enter" | "exit" }[] = [
        { id: startId, phase: "enter" },
      ];
      const visiting = new Set<number>();

      while (stack.length > 0) {
        const { id, phase } = stack[stack.length - 1];

        if (levels.has(id)) {
          stack.pop();
          continue;
        }

        if (phase === "enter") {
          if (visiting.has(id)) {
            // Cycle detected — treat as root to avoid infinite loop
            levels.set(id, 0);
            stack.pop();
            continue;
          }
          visiting.add(id);

          const todo = todoMap.get(id);
          if (!todo || todo.dependsOn.length === 0) {
            levels.set(id, 0);
            stack.pop();
            continue;
          }

          // Switch to exit phase
          stack[stack.length - 1] = { id, phase: "exit" };

          // Push dependencies to process first
          for (const dep of todo.dependsOn) {
            if (connectedIds.has(dep.dependsOnId) && !levels.has(dep.dependsOnId)) {
              stack.push({ id: dep.dependsOnId, phase: "enter" });
            }
          }
        } else {
          // Exit phase — all deps are computed
          stack.pop();
          const todo = todoMap.get(id);
          let maxDepLevel = 0;
          if (todo) {
            for (const dep of todo.dependsOn) {
              if (connectedIds.has(dep.dependsOnId)) {
                maxDepLevel = Math.max(
                  maxDepLevel,
                  (levels.get(dep.dependsOnId) || 0) + 1
                );
              }
            }
          }
          levels.set(id, maxDepLevel);
        }
      }

      return levels.get(startId) || 0;
    };

    for (const t of connectedTodos) computeLevel(t.id);

    // Group by level
    const levelGroups = new Map<number, Todo[]>();
    for (const t of connectedTodos) {
      const lvl = levels.get(t.id) || 0;
      if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
      levelGroups.get(lvl)!.push(t);
    }

    const nodeWidth = 200;
    const nodeHeight = 60;
    const horizontalGap = 280;
    const verticalGap = 90;

    const nodes: Node[] = [];
    const maxLevel = Math.max(...Array.from(levels.values()), 0);

    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const group = levelGroups.get(lvl) || [];
      group.forEach((t, i) => {
        const isOnCritical = criticalSet.has(t.id);
        nodes.push({
          id: String(t.id),
          position: {
            x: lvl * horizontalGap,
            y: i * verticalGap,
          },
          data: {
            label: (
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`text-sm font-medium ${isOnCritical ? "text-orange-900" : "text-gray-800"}`}
                >
                  {t.title.length > 22
                    ? t.title.slice(0, 20) + "..."
                    : t.title}
                </span>
                {isOnCritical && (
                  <Badge
                    variant="warning"
                    className="text-[10px] px-1.5 py-0"
                  >
                    Critical
                  </Badge>
                )}
              </div>
            ),
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            width: nodeWidth,
            height: nodeHeight,
            background: isOnCritical ? "#FFF7ED" : "#FFFFFF",
            border: isOnCritical ? "2px solid #EA580C" : "1px solid #E5E7EB",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: isOnCritical
              ? "0 4px 12px rgba(234, 88, 12, 0.15)"
              : "0 1px 3px rgba(0,0,0,0.1)",
          },
        });
      });
    }

    // Build edges
    const edges: Edge[] = [];
    for (const todo of connectedTodos) {
      for (const dep of todo.dependsOn) {
        const edgeKey = `${dep.dependsOnId}-${todo.id}`;
        const isCritical = criticalEdges.has(edgeKey);
        edges.push({
          id: edgeKey,
          source: String(dep.dependsOnId),
          target: String(todo.id),
          type: "smoothstep",
          animated: isCritical,
          style: {
            stroke: isCritical ? "#EA580C" : "#D1D5DB",
            strokeWidth: isCritical ? 2.5 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isCritical ? "#EA580C" : "#9CA3AF",
            width: 20,
            height: 20,
          },
        });
      }
    }

    return { nodes, edges };
  }, [todos, criticalSet, criticalEdges]);

  if (todos.length === 0) return null;

  const hasDeps = todos.some(
    (t) => t.dependsOn.length > 0 || t.dependedBy.length > 0
  );
  if (!hasDeps) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No dependencies yet. Add dependencies between tasks to see the graph.
      </div>
    );
  }

  return (
    <div className="w-full h-[500px] border rounded-lg bg-white" aria-label="Interactive task dependency graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={true}
        nodesConnectable={false}
      >
        <Background color="#F3F4F6" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
