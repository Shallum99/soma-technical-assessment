// REST API routes — the UI uses server actions (app/actions/todos.ts),
// but these routes are kept for external/programmatic access.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchPexelsImage } from '@/lib/pexels';

export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        dependsOn: {
          include: { dependsOn: true },
        },
        dependedBy: {
          include: { todo: true },
        },
      },
    });
    return NextResponse.json(todos);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching todos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, dueDate } = await request.json();
    if (!title || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Search for an image in the background
    const imageUrl = await searchPexelsImage(title);

    const todo = await prisma.todo.create({
      data: {
        title,
        dueDate: dueDate ? new Date(dueDate + "T12:00:00") : null,
        imageUrl,
      },
      include: {
        dependsOn: {
          include: { dependsOn: true },
        },
        dependedBy: {
          include: { todo: true },
        },
      },
    });
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error creating todo' }, { status: 500 });
  }
}
