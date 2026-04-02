import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateTodoRecord, mockListTodos } = vi.hoisted(() => ({
  mockCreateTodoRecord: vi.fn(),
  mockListTodos: vi.fn(),
}));

vi.mock("@/lib/todo-service", () => ({
  createTodoRecord: mockCreateTodoRecord,
  listTodos: mockListTodos,
  serializeForClient: <T>(value: T) => value,
}));

import { GET, POST } from "@/app/api/todos/route";

describe("/api/todos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns todos from the shared todo service", async () => {
    mockListTodos.mockResolvedValueOnce([
      {
        id: 1,
        title: "Draft memo",
        completed: false,
        dueDate: null,
        imageUrl: null,
        imageStatus: "pending",
        imageError: null,
        createdAt: "2026-04-01T12:00:00.000Z",
        dependsOn: [],
        dependedBy: [],
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: 1,
        title: "Draft memo",
        completed: false,
        dueDate: null,
        imageUrl: null,
        imageStatus: "pending",
        imageError: null,
        createdAt: "2026-04-01T12:00:00.000Z",
        dependsOn: [],
        dependedBy: [],
      },
    ]);
  });

  it("rejects invalid create requests before hitting the database", async () => {
    const request = new Request("http://test.local/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   ", dueDate: null }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Title is required" });
    expect(mockCreateTodoRecord).not.toHaveBeenCalled();
  });

  it("creates a todo with the validated due date and persisted image status", async () => {
    mockCreateTodoRecord.mockResolvedValueOnce({
      id: 7,
      title: "Book flights",
      completed: false,
      dueDate: "2026-04-05T12:00:00.000Z",
      imageUrl: null,
      imageStatus: "pending",
      imageError: null,
      createdAt: "2026-04-01T12:00:00.000Z",
      dependsOn: [],
      dependedBy: [],
    });

    const request = new Request("http://test.local/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  Book flights  ", dueDate: "2026-04-05" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreateTodoRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateTodoRecord.mock.calls[0][0].title).toBe("Book flights");
    expect(
      mockCreateTodoRecord.mock.calls[0][0].dueDate.toISOString()
    ).toBe("2026-04-05T12:00:00.000Z");
    expect(payload.imageStatus).toBe("pending");
    expect(payload.imageError).toBeNull();
  });
});
