import { describe, expect, it } from "vitest";
import {
  MAX_TITLE_LENGTH,
  validateCreateTodoInput,
  validateDependencyId,
  validateDependencyIds,
  validateNumericId,
  validateUpdateTodoInput,
} from "@/lib/todo-validation";

describe("validateCreateTodoInput", () => {
  it("trims valid titles and parses due dates to noon UTC", () => {
    const result = validateCreateTodoInput("  Buy milk  ", "2026-04-03");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Buy milk");
    expect(result.value.dueDate?.getUTCFullYear()).toBe(2026);
    expect(result.value.dueDate?.getUTCMonth()).toBe(3);
    expect(result.value.dueDate?.getUTCDate()).toBe(3);
    expect(result.value.dueDate?.getUTCHours()).toBe(12);
    expect(result.value.dueDate?.getUTCMinutes()).toBe(0);
    expect(result.value.dueDate?.getUTCSeconds()).toBe(0);
  });

  it("rejects invalid calendar dates like Feb 31", () => {
    expect(validateCreateTodoInput("Task", "2026-02-31")).toEqual({
      ok: false,
      error: "Due date must be a valid calendar date",
    });
    expect(validateCreateTodoInput("Task", "2026-13-01")).toEqual({
      ok: false,
      error: "Due date must be a valid calendar date",
    });
  });

  it("rejects invalid due date strings", () => {
    expect(validateCreateTodoInput("Task", "04/03/2026")).toEqual({
      ok: false,
      error: "Due date must be a valid YYYY-MM-DD string",
    });
  });

  it("rejects titles longer than the limit after trimming", () => {
    const title = ` ${"a".repeat(MAX_TITLE_LENGTH + 1)} `;
    expect(validateCreateTodoInput(title, null)).toEqual({
      ok: false,
      error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer`,
    });
  });
});

describe("validateUpdateTodoInput", () => {
  it("accepts partial updates with typed fields", () => {
    const result = validateUpdateTodoInput({
      title: "  Updated title  ",
      completed: true,
      dueDate: "2026-04-05",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Updated title");
    expect(result.value.completed).toBe(true);
    expect(result.value.dueDate?.getUTCFullYear()).toBe(2026);
    expect(result.value.dueDate?.getUTCMonth()).toBe(3);
    expect(result.value.dueDate?.getUTCDate()).toBe(5);
    expect(result.value.dueDate?.getUTCHours()).toBe(12);
    expect(result.value.dueDate?.getUTCMinutes()).toBe(0);
    expect(result.value.dueDate?.getUTCSeconds()).toBe(0);
  });

  it("rejects non-boolean completed values", () => {
    expect(validateUpdateTodoInput({ completed: "yes" })).toEqual({
      ok: false,
      error: "Completed must be a boolean",
    });
  });
});

describe("id validation helpers", () => {
  it("validates positive numeric route params", () => {
    expect(validateNumericId("42")).toEqual({ ok: true, value: 42 });
    expect(validateNumericId("0")).toEqual({
      ok: false,
      error: "Invalid ID",
    });
  });

  it("requires dependency ids to be positive integers", () => {
    expect(validateDependencyId(undefined)).toEqual({
      ok: false,
      error: "dependsOnId is required",
    });
    expect(validateDependencyId(2.5)).toEqual({
      ok: false,
      error: "dependsOnId must be a positive integer",
    });
    expect(validateDependencyId(7)).toEqual({ ok: true, value: 7 });
  });

  it("validates dependency id arrays for batch actions", () => {
    expect(validateDependencyIds("nope")).toEqual({
      ok: false,
      error: "dependsOnIds must be an array",
    });
    expect(validateDependencyIds([1, 2.5])).toEqual({
      ok: false,
      error: "dependsOnIds must contain only positive integers",
    });
    expect(validateDependencyIds([2, 7, 9])).toEqual({
      ok: true,
      value: [2, 7, 9],
    });
  });
});
