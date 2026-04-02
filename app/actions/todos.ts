"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { wouldCreateCycle } from "@/lib/graph";
import { startTodoImageFetch } from "@/lib/todo-images";
import {
  validateCreateTodoInput,
  validateDependencyId,
  validateDependencyIds,
} from "@/lib/todo-validation";

const todoInclude = {
  dependsOn: { include: { dependsOn: true } },
  dependedBy: { include: { todo: true } },
};

export async function getTodos() {
  return prisma.todo.findMany({
    orderBy: { createdAt: "desc" },
    include: todoInclude,
  });
}

export async function createTodo(title: string, dueDate: string | null) {
  const validated = validateCreateTodoInput(title, dueDate);
  if (!validated.ok) {
    return { error: validated.error };
  }

  const todo = await prisma.todo.create({
    data: {
      title: validated.value.title,
      dueDate: validated.value.dueDate,
    },
    include: todoInclude,
  });

  startTodoImageFetch(todo.id, validated.value.title);
  revalidatePath("/");
  return { todo };
}

export async function deleteTodo(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Invalid task ID" };
  }
  try {
    await prisma.todo.delete({ where: { id } });
    revalidatePath("/");
    return {};
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return { error: "Task not found" };
    }
    return { error: "Failed to delete task" };
  }
}

export async function toggleTodo(id: number, completed: boolean) {
  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Invalid task ID" };
  }
  if (typeof completed !== "boolean") {
    return { error: "Completed must be a boolean" };
  }
  try {
    await prisma.todo.update({
      where: { id },
      data: { completed },
    });
    revalidatePath("/");
    return {};
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return { error: "Task not found" };
    }
    return { error: "Failed to update task" };
  }
}

export async function addDependency(todoId: number, dependsOnId: number) {
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return { error: "Invalid task ID" };
  }
  const validatedDep = validateDependencyId(dependsOnId);
  if (!validatedDep.ok) return { error: validatedDep.error };
  const dependencyId = validatedDep.value;

  if (todoId === dependencyId) {
    return { error: "A task cannot depend on itself" };
  }

  const [todo, dep] = await Promise.all([
    prisma.todo.findUnique({ where: { id: todoId } }),
    prisma.todo.findUnique({ where: { id: dependencyId } }),
  ]);
  if (!todo || !dep) return { error: "Todo not found" };

  // Load all edges at once and check for cycles in memory (no N+1)
  const allEdges = await prisma.todoDependency.findMany({
    select: { todoId: true, dependsOnId: true },
  });

  if (wouldCreateCycle(todoId, dependencyId, allEdges)) {
    return {
      error: "Adding this dependency would create a circular reference",
    };
  }

  try {
    await prisma.todoDependency.create({
      data: { todoId, dependsOnId: dependencyId },
    });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { error: "Dependency already exists" };
    }
    return { error: "Error creating dependency" };
  }

  revalidatePath("/");
  return {};
}

export async function removeDependency(todoId: number, dependsOnId: number) {
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return { error: "Invalid task ID" };
  }
  const validatedDep = validateDependencyId(dependsOnId);
  if (!validatedDep.ok) return { error: validatedDep.error };
  const dependencyId = validatedDep.value;

  try {
    const result = await prisma.todoDependency.deleteMany({
      where: { todoId, dependsOnId: dependencyId },
    });
    if (result.count === 0) {
      return { error: "Dependency not found" };
    }
    revalidatePath("/");
    return {};
  } catch {
    return { error: "Failed to remove dependency" };
  }
}

export async function addMultipleDependencies(
  todoId: number,
  dependsOnIds: number[]
) {
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return [{ id: -1, error: "Invalid task ID" }];
  }

  const validatedDepIds = validateDependencyIds(dependsOnIds);
  if (!validatedDepIds.ok) {
    return [{ id: -1, error: validatedDepIds.error }];
  }

  const dependencyIds = validatedDepIds.value;

  const existingTodos = await prisma.todo.findMany({
    where: { id: { in: [todoId, ...dependencyIds] } },
    select: { id: true },
  });
  const existingIds = new Set(existingTodos.map((todo) => todo.id));
  if (!existingIds.has(todoId)) {
    return [{ id: todoId, error: "Todo not found" }];
  }

  // Load all edges once for every cycle check in this batch
  const allEdges = await prisma.todoDependency.findMany({
    select: { todoId: true, dependsOnId: true },
  });

  const results: { id: number; error?: string }[] = [];
  // Track edges as we add them so subsequent checks see prior additions
  const currentEdges = [...allEdges];

  for (const depId of dependencyIds) {
    if (todoId === depId) {
      results.push({ id: depId, error: "A task cannot depend on itself" });
      continue;
    }

    if (!existingIds.has(depId)) {
      results.push({ id: depId, error: "Todo not found" });
      continue;
    }

    if (wouldCreateCycle(todoId, depId, currentEdges)) {
      results.push({
        id: depId,
        error: "Would create a circular reference",
      });
      continue;
    }

    try {
      await prisma.todoDependency.create({
        data: { todoId, dependsOnId: depId },
      });
      currentEdges.push({ todoId, dependsOnId: depId });
      results.push({ id: depId });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        results.push({ id: depId, error: "Dependency already exists" });
      } else {
        results.push({ id: depId, error: "Error creating dependency" });
      }
    }
  }

  revalidatePath("/");
  return results;
}
