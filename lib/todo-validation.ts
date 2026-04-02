export const MAX_TITLE_LENGTH = 500;

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function validateTitle(
  value: unknown,
  emptyMessage: string
): ValidationResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return fail(emptyMessage);
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return fail(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }

  return ok(trimmed);
}

function parseDueDate(value: unknown): ValidationResult<Date | null> {
  if (value === undefined || value === null || value === "") {
    return ok(null);
  }

  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) {
    return fail("Due date must be a valid YYYY-MM-DD string");
  }

  const parsed = new Date(`${value}T23:59:59.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return fail("Due date must be a valid YYYY-MM-DD string");
  }

  return ok(parsed);
}

export function validateNumericId(
  value: string,
  fieldName = "ID"
): ValidationResult<number> {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return fail(`Invalid ${fieldName}`);
  }
  return ok(id);
}

export function validateDependencyId(value: unknown): ValidationResult<number> {
  if (value === undefined || value === null) {
    return fail("dependsOnId is required");
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return fail("dependsOnId must be a positive integer");
  }

  return ok(value);
}

export function validateDependencyIds(
  value: unknown
): ValidationResult<number[]> {
  if (!Array.isArray(value)) {
    return fail("dependsOnIds must be an array");
  }

  const ids: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) {
      return fail("dependsOnIds must contain only positive integers");
    }
    ids.push(item);
  }

  return ok(ids);
}

export function validateCreateTodoInput(
  title: unknown,
  dueDate: unknown
): ValidationResult<{ title: string; dueDate: Date | null }> {
  const validatedTitle = validateTitle(title, "Title is required");
  if (!validatedTitle.ok) return validatedTitle;

  const validatedDueDate = parseDueDate(dueDate);
  if (!validatedDueDate.ok) return validatedDueDate;

  return ok({
    title: validatedTitle.value,
    dueDate: validatedDueDate.value,
  });
}

export function validateUpdateTodoInput(
  body: unknown
): ValidationResult<{
  title?: string;
  completed?: boolean;
  dueDate?: Date | null;
}> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("Request body must be an object");
  }

  const input = body as Record<string, unknown>;
  const data: {
    title?: string;
    completed?: boolean;
    dueDate?: Date | null;
  } = {};

  if ("title" in input) {
    const validatedTitle = validateTitle(input.title, "Title cannot be empty");
    if (!validatedTitle.ok) return validatedTitle;
    data.title = validatedTitle.value;
  }

  if ("completed" in input) {
    if (typeof input.completed !== "boolean") {
      return fail("Completed must be a boolean");
    }
    data.completed = input.completed;
  }

  if ("dueDate" in input) {
    const validatedDueDate = parseDueDate(input.dueDate);
    if (!validatedDueDate.ok) return validatedDueDate;
    data.dueDate = validatedDueDate.value;
  }

  return ok(data);
}
