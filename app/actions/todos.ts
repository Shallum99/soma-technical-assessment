"use server";

import { prisma } from "@/lib/prisma";
import { searchPexelsImage } from "@/lib/pexels";
import { revalidatePath } from "next/cache";

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

  const imageUrl = await searchPexelsImage(title);

  const todo = await prisma.todo.create({
    data: {
      title,
      dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
      imageUrl,
    },
    include: todoInclude,
  });

  revalidatePath("/");
  return { todo };
}

export async function deleteTodo(id: number) {
  await prisma.todo.delete({ where: { id } });
  revalidatePath("/");
}

export async function toggleTodo(id: number, completed: boolean) {
  await prisma.todo.update({
    where: { id },
    data: { completed },
  });
  revalidatePath("/");
}

export async function addDependency(todoId: number, dependsOnId: number) {
  if (todoId === dependsOnId) {
    return { error: "A task cannot depend on itself" };
  }

  // Check both todos exist
  const [todo, dep] = await Promise.all([
    prisma.todo.findUnique({ where: { id: todoId } }),
    prisma.todo.findUnique({ where: { id: dependsOnId } }),
  ]);
  if (!todo || !dep) return { error: "Todo not found" };

  // BFS cycle check
  const visited = new Set<number>();
  const queue = [dependsOnId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === todoId) {
      return { error: "Adding this dependency would create a circular reference" };
    }
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await prisma.todoDependency.findMany({
      where: { todoId: current },
      select: { dependsOnId: true },
    });
    for (const d of deps) queue.push(d.dependsOnId);
  }

  try {
    await prisma.todoDependency.create({
      data: { todoId, dependsOnId },
    });
  } catch (e: any) {
    if (e.code === "P2002") return { error: "Dependency already exists" };
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
  const results: { id: number; error?: string }[] = [];
  for (const depId of dependsOnIds) {
    const result = await addDependency(todoId, depId);
    results.push({ id: depId, ...result });
  }
  return results;
}
