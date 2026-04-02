import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { wouldCreateCycle } from '@/lib/graph';
import {
  validateDependencyId,
  validateNumericId,
} from '@/lib/todo-validation';

interface Params {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: Params) {
  const validatedTodoId = validateNumericId(params.id);
  if (!validatedTodoId.ok) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const todoId = validatedTodoId.value;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const { dependsOnId } = body;
    const validatedDependencyId = validateDependencyId(dependsOnId);
    if (!validatedDependencyId.ok) {
      return NextResponse.json({ error: validatedDependencyId.error }, { status: 400 });
    }
    const dependencyId = validatedDependencyId.value;

    if (todoId === dependencyId) {
      return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 });
    }

    // Verify both todos exist
    const [todo, depTodo] = await Promise.all([
      prisma.todo.findUnique({ where: { id: todoId } }),
      prisma.todo.findUnique({ where: { id: dependencyId } }),
    ]);

    if (!todo || !depTodo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    // Load all edges at once and check for cycles in memory (no N+1)
    const allEdges = await prisma.todoDependency.findMany({
      select: { todoId: true, dependsOnId: true },
    });

    if (wouldCreateCycle(todoId, dependencyId, allEdges)) {
      return NextResponse.json(
        { error: 'Adding this dependency would create a circular reference' },
        { status: 400 }
      );
    }

    const dependency = await prisma.todoDependency.create({
      data: { todoId, dependsOnId: dependencyId },
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
  const validatedTodoId = validateNumericId(params.id);
  if (!validatedTodoId.ok) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }
  const todoId = validatedTodoId.value;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const { dependsOnId } = body;
    const validatedDependencyId = validateDependencyId(dependsOnId);
    if (!validatedDependencyId.ok) {
      return NextResponse.json({ error: validatedDependencyId.error }, { status: 400 });
    }
    const dependencyId = validatedDependencyId.value;

    const result = await prisma.todoDependency.deleteMany({
      where: { todoId, dependsOnId: dependencyId },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Dependency removed' });
  } catch {
    return NextResponse.json({ error: 'Error removing dependency' }, { status: 500 });
  }
}
