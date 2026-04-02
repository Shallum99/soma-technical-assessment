import { TodoApp } from "@/components/todo-app";
import { listTodos, serializeForClient } from "@/lib/todo-service";
import type { Todo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const todos = await listTodos();
  return (
    <TodoApp initialTodos={serializeForClient(todos) as unknown as Todo[]} />
  );
}
