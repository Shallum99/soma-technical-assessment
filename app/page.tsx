import { getTodos } from "@/app/actions/todos";
import { TodoApp } from "@/components/todo-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const todos = await getTodos();
  // Serialize dates for client
  const serialized = JSON.parse(JSON.stringify(todos));
  return <TodoApp initialTodos={serialized} />;
}
