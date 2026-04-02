import { NextResponse } from "next/server";
import {
  addTodoDependencies,
  removeTodoDependency,
} from "@/lib/todo-service";
import {
  validateDependencyId,
  validateDependencyIds,
  validateNumericId,
} from "@/lib/todo-validation";

interface Params {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: Params) {
  const validatedTodoId = validateNumericId(params.id);
  if (!validatedTodoId.ok) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const todoId = validatedTodoId.value;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const dependencyIds =
      "dependsOnIds" in body
        ? body.dependsOnIds
        : "dependsOnId" in body
          ? [body.dependsOnId]
          : undefined;

    if (Array.isArray(dependencyIds)) {
      const validatedDependencyIds = validateDependencyIds(dependencyIds);
      if (!validatedDependencyIds.ok) {
        return NextResponse.json(
          { error: validatedDependencyIds.error },
          { status: 400 }
        );
      }

      const results = await addTodoDependencies(todoId, validatedDependencyIds.value);
      return NextResponse.json({ results }, { status: 200 });
    }

    const validatedDependencyId = validateDependencyId(dependencyIds);
    if (!validatedDependencyId.ok) {
      return NextResponse.json(
        { error: validatedDependencyId.error },
        { status: 400 }
      );
    }

    const results = await addTodoDependencies(todoId, [validatedDependencyId.value]);
    const [result] = results;
    if (result?.error) {
      const status =
        result.error === "Todo not found"
          ? 404
          : result.error === "Dependency already exists"
            ? 409
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ results }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error creating dependency" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const validatedTodoId = validateNumericId(params.id);
  if (!validatedTodoId.ok) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const todoId = validatedTodoId.value;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { dependsOnId } = body;
    const validatedDependencyId = validateDependencyId(dependsOnId);
    if (!validatedDependencyId.ok) {
      return NextResponse.json(
        { error: validatedDependencyId.error },
        { status: 400 }
      );
    }
    const dependencyId = validatedDependencyId.value;

    const result = await removeTodoDependency(todoId, dependencyId);

    if (result.count === 0) {
      return NextResponse.json({ error: "Dependency not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Dependency removed" });
  } catch {
    return NextResponse.json({ error: "Error removing dependency" }, { status: 500 });
  }
}
