// REST API routes — the UI uses server actions (app/actions/todos.ts),
// but these routes are kept for external/programmatic access (e.g. seed script).
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchPexelsImage } from '@/lib/pexels';

const MAX_TITLE_LENGTH = 500;

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
  try {
    const { title, dueDate } = await request.json();
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const trimmed = title.trim();

    const todo = await prisma.todo.create({
      data: {
        title: trimmed,
        dueDate: dueDate ? new Date(dueDate + "T23:59:59") : null,
      },
      include: todoInclude,
    });

    // Fire-and-forget image fetch so the response returns immediately
    searchPexelsImage(trimmed).then(async (imageUrl) => {
      if (imageUrl) {
        await prisma.todo.update({
          where: { id: todo.id },
          data: { imageUrl },
        });
      }
    }).catch(() => {});

    return NextResponse.json(todo, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}
