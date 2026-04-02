import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  validateNumericId,
  validateUpdateTodoInput,
} from '@/lib/todo-validation';

interface Params {
  params: {
    id: string;
  };
}

export async function DELETE(request: Request, { params }: Params) {
  const validatedId = validateNumericId(params.id);
  if (!validatedId.ok) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const id = validatedId.value;

  try {
    await prisma.todo.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Todo deleted' }, { status: 200 });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error deleting todo' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const validatedId = validateNumericId(params.id);
  if (!validatedId.ok) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const id = validatedId.value;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const validated = validateUpdateTodoInput(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const todo = await prisma.todo.update({
      where: { id },
      data: validated.value,
      include: {
        dependsOn: { include: { dependsOn: true } },
        dependedBy: { include: { todo: true } },
      },
    });
    return NextResponse.json(todo);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2025') {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Error updating todo' }, { status: 500 });
  }
}
