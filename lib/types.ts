export interface TodoDependencyRelation {
  id: number;
  dependsOnId: number;
  dependsOn: { id: number; title: string };
}

export interface TodoDependedByRelation {
  id: number;
  todoId: number;
  todo: { id: number; title: string };
}

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  dueDate: string | null;
  imageUrl: string | null;
  createdAt: string;
  dependsOn: TodoDependencyRelation[];
  dependedBy: TodoDependedByRelation[];
}

export type SortField = "title" | "dueDate" | "createdAt";
export type SortDir = "asc" | "desc";
