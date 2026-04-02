import { NextResponse } from "next/server";
import {
  createTodoRecord,
  listTodos,
  serializeForClient,
} from "@/lib/todo-service";
import { validateCreateTodoInput } from "@/lib/todo-validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todos = await listTodos();
    return NextResponse.json(serializeForClient(todos), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Error fetching todos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { title, dueDate } = body as Record<string, unknown>;

    const validated = validateCreateTodoInput(title, dueDate);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const todo = await createTodoRecord({
      title: validated.value.title,
      dueDate: validated.value.dueDate,
    });

    return NextResponse.json(serializeForClient(todo), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error creating todo" }, { status: 500 });
  }
}
