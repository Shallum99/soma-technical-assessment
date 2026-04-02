import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: {
    id: string;
  };
}

export async function DELETE(request: Request, { params }: Params) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    await prisma.todo.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Todo deleted' }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Error deleting todo' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const data: { title?: string; completed?: boolean; dueDate?: Date | null } = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim() === '') {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      if (body.title.length > 500) {
        return NextResponse.json({ error: 'Title must be 500 characters or fewer' }, { status: 400 });
      }
      data.title = body.title.trim();
    }
    if (body.completed !== undefined) data.completed = body.completed;
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate ? new Date(body.dueDate + "T23:59:59") : null;
    }

    const todo = await prisma.todo.update({
      where: { id },
      data,
      include: {
        dependsOn: { include: { dependsOn: true } },
        dependedBy: { include: { todo: true } },
      },
    });
    return NextResponse.json(todo);
  } catch {
    return NextResponse.json({ error: 'Error updating todo' }, { status: 500 });
  }
}
