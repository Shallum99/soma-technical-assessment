import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: {
    id: string;
  };
}

// Check if adding a dependency would create a circular reference
async function wouldCreateCycle(todoId: number, dependsOnId: number): Promise<boolean> {
  // BFS from dependsOnId: if we can reach todoId, adding the edge would create a cycle
  const visited = new Set<number>();
  const queue = [dependsOnId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === todoId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = await prisma.todoDependency.findMany({
      where: { todoId: current },
      select: { dependsOnId: true },
    });

    for (const dep of deps) {
      queue.push(dep.dependsOnId);
    }
  }

  return false;
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

    // Check for circular dependency
    const cycle = await wouldCreateCycle(todoId, dependsOnId);
    if (cycle) {
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
  } catch (error: any) {
    if (error.code === 'P2002') {
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
  } catch (error) {
    return NextResponse.json({ error: 'Error removing dependency' }, { status: 500 });
  }
}
