// REST API routes — the UI uses server actions (app/actions/todos.ts),
// but these routes are kept for external/programmatic access (e.g. seed script).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startTodoImageFetch } from '@/lib/todo-images';
import { validateCreateTodoInput } from '@/lib/todo-validation';

const todoInclude = {
  dependsOn: { include: { dependsOn: true } },
  dependedBy: { include: { todo: true } },
};

export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: { createdAt: 'desc' },
      include: todoInclude,
    });
    return NextResponse.json(todos);
  } catch {
    return NextResponse.json({ error: 'Error fetching todos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const { title, dueDate } = body as Record<string, unknown>;

    const validated = validateCreateTodoInput(title, dueDate);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const todo = await prisma.todo.create({
      data: {
        title: validated.value.title,
        dueDate: validated.value.dueDate,
      },
      include: todoInclude,
    });

    startTodoImageFetch(todo.id, validated.value.title);

    return NextResponse.json(todo, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}
