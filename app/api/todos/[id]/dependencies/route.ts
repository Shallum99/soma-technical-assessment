import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { wouldCreateCycle } from '@/lib/graph';

interface Params {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: Params) {
  const todoId = parseInt(params.id);
  if (isNaN(todoId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    const { dependsOnId } = await request.json();

    if (!dependsOnId || typeof dependsOnId !== 'number') {
      return NextResponse.json({ error: 'dependsOnId is required' }, { status: 400 });
    }

    if (todoId === dependsOnId) {
      return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
    }

    // Verify both todos exist
    const [todo, depTodo] = await Promise.all([
      prisma.todo.findUnique({ where: { id: todoId } }),
      prisma.todo.findUnique({ where: { id: dependsOnId } }),
    ]);

    if (!todo || !depTodo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    // Load all edges at once and check for cycles in memory (no N+1)
    const allEdges = await prisma.todoDependency.findMany({
      select: { todoId: true, dependsOnId: true },
    });

    if (wouldCreateCycle(todoId, dependsOnId, allEdges)) {
      return NextResponse.json(
        { error: 'Adding this dependency would create a circular reference' },
        { status: 400 }
      );
    }

    const dependency = await prisma.todoDependency.create({
      data: { todoId, dependsOnId },
      include: { dependsOn: true },
    });

    return NextResponse.json(dependency, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Dependency already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error creating dependency' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const todoId = parseInt(params.id);
  if (isNaN(todoId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    const { dependsOnId } = await request.json();

    await prisma.todoDependency.deleteMany({
      where: { todoId, dependsOnId },
    });

    return NextResponse.json({ message: 'Dependency removed' });
  } catch {
    return NextResponse.json({ error: 'Error removing dependency' }, { status: 500 });
  }
}
