"use server";

import { prisma } from "@/lib/prisma";
import { searchPexelsImage } from "@/lib/pexels";
import { revalidatePath } from "next/cache";
import { wouldCreateCycle } from "@/lib/graph";

const MAX_TITLE_LENGTH = 500;

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
  if (!title || title.trim() === "") {
    return { error: "Title is required" };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` };
  }

  const imageUrl = await searchPexelsImage(title.trim());

  const todo = await prisma.todo.create({
    data: {
      title: title.trim(),
      dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
      imageUrl,
    },
    include: todoInclude,
  });

  revalidatePath("/");
  return { todo };
}

export async function deleteTodo(id: number) {
  try {
    await prisma.todo.delete({ where: { id } });
    revalidatePath("/");
    return {};
  } catch {
    return { error: "Failed to delete task" };
  }
}

export async function toggleTodo(id: number, completed: boolean) {
  try {
    await prisma.todo.update({
      where: { id },
      data: { completed },
    });
    revalidatePath("/");
    return {};
  } catch {
    return { error: "Failed to update task" };
  }
}

export async function addDependency(todoId: number, dependsOnId: number) {
  if (todoId === dependsOnId) {
    return { error: "A task cannot depend on itself" };
  }

  const [todo, dep] = await Promise.all([
    prisma.todo.findUnique({ where: { id: todoId } }),
    prisma.todo.findUnique({ where: { id: dependsOnId } }),
  ]);
  if (!todo || !dep) return { error: "Todo not found" };

  // Load all edges at once and check for cycles in memory (no N+1)
  const allEdges = await prisma.todoDependency.findMany({
    select: { todoId: true, dependsOnId: true },
  });

  if (wouldCreateCycle(todoId, dependsOnId, allEdges)) {
    return {
      error: "Adding this dependency would create a circular reference",
    };
  }

  try {
    await prisma.todoDependency.create({
      data: { todoId, dependsOnId },
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
  await prisma.todoDependency.deleteMany({
    where: { todoId, dependsOnId },
  });
  revalidatePath("/");
}

export async function addMultipleDependencies(
  todoId: number,
  dependsOnIds: number[]
) {
  // Load all edges once for every cycle check in this batch
  const allEdges = await prisma.todoDependency.findMany({
    select: { todoId: true, dependsOnId: true },
  });

  const results: { id: number; error?: string }[] = [];
  // Track edges as we add them so subsequent checks see prior additions
  const currentEdges = [...allEdges];

  for (const depId of dependsOnIds) {
    if (todoId === depId) {
      results.push({ id: depId, error: "A task cannot depend on itself" });
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
