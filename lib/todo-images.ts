import { prisma } from "@/lib/prisma";
import { searchPexelsImage } from "@/lib/pexels";

export async function fetchAndStoreTodoImage(todoId: number, query: string) {
  const imageUrl = await searchPexelsImage(query.trim());

  if (!imageUrl) {
    return null;
  }

  try {
    await prisma.todo.update({
      where: { id: todoId },
      data: { imageUrl },
    });
  } catch {
    return null;
  }

  return imageUrl;
}

export function startTodoImageFetch(todoId: number, query: string) {
  void fetchAndStoreTodoImage(todoId, query).catch(() => {});
}
