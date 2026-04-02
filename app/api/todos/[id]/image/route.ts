import { NextResponse } from "next/server";
import { fetchAndStoreTodoImage, markTodoImagePending } from "@/lib/todo-images";
import {
  getTodoById,
  serializeForClient,
} from "@/lib/todo-service";
import { validateNumericId } from "@/lib/todo-validation";

interface Params {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: Params) {
  const validatedId = validateNumericId(params.id);
  if (!validatedId.ok) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const id = validatedId.value;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const force = body.force === true;

  try {
    const todo = await getTodoById(id);
    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    if (todo.imageUrl && !force) {
      return NextResponse.json(serializeForClient(todo));
    }

    await markTodoImagePending(id);
    const imageResult = await fetchAndStoreTodoImage(id, todo.title);

    return NextResponse.json(
      serializeForClient({
        ...todo,
        imageUrl: imageResult.imageUrl,
        imageStatus: imageResult.imageStatus,
        imageError: imageResult.imageError,
      })
    );
  } catch {
    return NextResponse.json(
      { error: "Error fetching todo image" },
      { status: 500 }
    );
  }
}
