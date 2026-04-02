import { prisma } from "@/lib/prisma";
import { searchPexelsImage } from "@/lib/pexels";
import type { TodoImageStatus } from "@/lib/types";

export interface TodoImageFetchResult {
  imageError: string | null;
  imageUrl: string | null;
  imageStatus: TodoImageStatus;
}

export async function markTodoImagePending(todoId: number) {
  await prisma.todo.update({
    where: { id: todoId },
    data: {
      imageStatus: "pending",
      imageError: null,
    },
  });
}

export async function fetchAndStoreTodoImage(
  todoId: number,
  query: string
): Promise<TodoImageFetchResult> {
  const result = await searchPexelsImage(query.trim());

  if (!result.ok) {
    const imageStatus: TodoImageStatus =
      result.code === "unconfigured" || result.code === "no_results"
        ? "unavailable"
        : "failed";

    await prisma.todo.update({
      where: { id: todoId },
      data: {
        imageUrl: null,
        imageStatus,
        imageError: result.message,
      },
    });

    return {
      imageStatus,
      imageUrl: null,
      imageError: result.message,
    };
  }

  try {
    await prisma.todo.update({
      where: { id: todoId },
      data: {
        imageUrl: result.imageUrl,
        imageStatus: "ready",
        imageError: null,
      },
    });
  } catch {
    await prisma.todo.update({
      where: { id: todoId },
      data: {
        imageStatus: "failed",
        imageError: "Failed to save image",
      },
    });

    return {
      imageStatus: "failed",
      imageUrl: null,
      imageError: "Failed to save image",
    };
  }

  return {
    imageStatus: "ready",
    imageUrl: result.imageUrl,
    imageError: null,
  };
}
