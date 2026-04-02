import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { wouldCreateCycle } from "@/lib/graph";
import { isPexelsConfigured } from "@/lib/pexels";
import type { TodoImageStatus } from "@/lib/types";

export const todoInclude = Prisma.validator<Prisma.TodoInclude>()({
  dependsOn: { include: { dependsOn: true } },
  dependedBy: { include: { todo: true } },
});

export type TodoRecord = Prisma.TodoGetPayload<{ include: typeof todoInclude }>;

export interface DependencyMutationResult {
  id: number;
  error?: string;
}

export function serializeForClient<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getInitialImageStatus(): TodoImageStatus {
  return isPexelsConfigured() ? "pending" : "unavailable";
}

export async function listTodos() {
  return prisma.todo.findMany({
    orderBy: { createdAt: "desc" },
    include: todoInclude,
  });
}

export async function getTodoById(id: number) {
  return prisma.todo.findUnique({
    where: { id },
    include: todoInclude,
  });
}

export async function createTodoRecord(data: {
  title: string;
  dueDate: Date | null;
}) {
  return prisma.todo.create({
    data: {
      title: data.title,
      dueDate: data.dueDate,
      imageStatus: getInitialImageStatus(),
      imageError: null,
    },
    include: todoInclude,
  });
}

export async function updateTodoRecord(
  id: number,
  data: {
    title?: string;
    completed?: boolean;
    dueDate?: Date | null;
  }
) {
  return prisma.todo.update({
    where: { id },
    data,
    include: todoInclude,
  });
}

export async function deleteTodoRecord(id: number) {
  return prisma.todo.delete({
    where: { id },
  });
}

export async function removeTodoDependency(todoId: number, dependsOnId: number) {
  return prisma.todoDependency.deleteMany({
    where: { todoId, dependsOnId },
  });
}

export async function addTodoDependencies(
  todoId: number,
  dependsOnIds: number[]
): Promise<DependencyMutationResult[]> {
  const uniqueDependencyIds = Array.from(new Set(dependsOnIds));
  if (uniqueDependencyIds.length === 0) {
    return [];
  }

  const existingTodos = await prisma.todo.findMany({
    where: { id: { in: [todoId, ...uniqueDependencyIds] } },
    select: { id: true },
  });
  const existingIds = new Set(existingTodos.map((todo) => todo.id));

  if (!existingIds.has(todoId)) {
    return [{ id: todoId, error: "Todo not found" }];
  }

  const [allEdges, existingDeps] = await Promise.all([
    prisma.todoDependency.findMany({
      select: { todoId: true, dependsOnId: true },
    }),
    prisma.todoDependency.findMany({
      where: {
        todoId,
        dependsOnId: { in: uniqueDependencyIds },
      },
      select: { dependsOnId: true },
    }),
  ]);

  const existingDepIds = new Set(existingDeps.map((dep) => dep.dependsOnId));
  const currentEdges = [...allEdges];
  const toCreate: number[] = [];
  const results: DependencyMutationResult[] = [];

  for (const depId of uniqueDependencyIds) {
    if (todoId === depId) {
      results.push({ id: depId, error: "A task cannot depend on itself" });
      continue;
    }

    if (!existingIds.has(depId)) {
      results.push({ id: depId, error: "Todo not found" });
      continue;
    }

    if (existingDepIds.has(depId)) {
      results.push({ id: depId, error: "Dependency already exists" });
      continue;
    }

    if (wouldCreateCycle(todoId, depId, currentEdges)) {
      results.push({
        id: depId,
        error: "Adding this dependency would create a circular reference",
      });
      continue;
    }

    currentEdges.push({ todoId, dependsOnId: depId });
    toCreate.push(depId);
    results.push({ id: depId });
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((depId) =>
        prisma.todoDependency.create({
          data: { todoId, dependsOnId: depId },
        })
      )
    );
  }

  return results;
}
