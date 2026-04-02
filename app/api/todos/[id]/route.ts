import { NextResponse } from "next/server";
import {
  deleteTodoRecord,
  getTodoById,
  serializeForClient,
  updateTodoRecord,
} from "@/lib/todo-service";
import {
  validateNumericId,
  validateUpdateTodoInput,
} from "@/lib/todo-validation";

interface Params {
  params: {
    id: string;
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: Params) {
  const validatedId = validateNumericId(params.id);
  if (!validatedId.ok) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const id = validatedId.value;

  try {
    const todo = await getTodoById(id);
    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    return NextResponse.json(serializeForClient(todo), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Error fetching todo" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const validatedId = validateNumericId(params.id);
  if (!validatedId.ok) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const id = validatedId.value;

  try {
    await deleteTodoRecord(id);
    return NextResponse.json({ message: "Todo deleted" }, { status: 200 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error deleting todo" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const validatedId = validateNumericId(params.id);
  if (!validatedId.ok) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const id = validatedId.value;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const validated = validateUpdateTodoInput(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const todo = await updateTodoRecord(id, validated.value);
    return NextResponse.json(serializeForClient(todo));
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error updating todo" }, { status: 500 });
  }
}
