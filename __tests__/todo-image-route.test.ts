import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetchAndStoreTodoImage,
  mockGetTodoById,
  mockMarkTodoImagePending,
} = vi.hoisted(() => ({
  mockFetchAndStoreTodoImage: vi.fn(),
  mockGetTodoById: vi.fn(),
  mockMarkTodoImagePending: vi.fn(),
}));

vi.mock("@/lib/todo-images", () => ({
  fetchAndStoreTodoImage: mockFetchAndStoreTodoImage,
  markTodoImagePending: mockMarkTodoImagePending,
}));

vi.mock("@/lib/todo-service", () => ({
  getTodoById: mockGetTodoById,
  serializeForClient: <T>(value: T) => value,
}));

import { POST } from "@/app/api/todos/[id]/image/route";

describe("/api/todos/[id]/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the todo does not exist", async () => {
    mockGetTodoById.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://test.local"), {
      params: { id: "42" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Todo not found" });
  });

  it("returns the current todo when an image already exists", async () => {
    mockGetTodoById.mockResolvedValueOnce({
      id: 3,
      title: "Review pull request",
      completed: false,
      dueDate: null,
      imageUrl: "https://images.example.com/pr.jpg",
      imageStatus: "ready",
      imageError: null,
      createdAt: "2026-04-01T12:00:00.000Z",
      dependsOn: [],
      dependedBy: [],
    });

    const response = await POST(new Request("http://test.local"), {
      params: { id: "3" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 3,
      imageStatus: "ready",
    });
    expect(mockMarkTodoImagePending).not.toHaveBeenCalled();
    expect(mockFetchAndStoreTodoImage).not.toHaveBeenCalled();
  });

  it("marks the todo pending, fetches the image, and returns the updated todo", async () => {
    mockGetTodoById.mockResolvedValueOnce({
      id: 8,
      title: "Plan team offsite",
      completed: false,
      dueDate: null,
      imageUrl: null,
      imageStatus: "pending",
      imageError: null,
      createdAt: "2026-04-01T12:00:00.000Z",
      dependsOn: [],
      dependedBy: [],
    });
    mockFetchAndStoreTodoImage.mockResolvedValueOnce({
      imageUrl: "https://images.example.com/offsite.jpg",
      imageStatus: "ready",
      imageError: null,
    });

    const response = await POST(
      new Request("http://test.local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: { id: "8" } }
    );

    expect(mockMarkTodoImagePending).toHaveBeenCalledWith(8);
    expect(mockFetchAndStoreTodoImage).toHaveBeenCalledWith(
      8,
      "Plan team offsite"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 8,
      imageUrl: "https://images.example.com/offsite.jpg",
      imageStatus: "ready",
    });
  });
});
