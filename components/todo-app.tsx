"use client";
import { useState, useEffect, useMemo, useCallback, useTransition, useRef } from "react";
import { useQueryState } from "nuqs";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  AlertTriangle,
  Calendar,
  Link2,
  ArrowRight,
  ImageIcon,
  X,
  Loader2,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { DependencyGraph } from "@/components/dependency-graph";
import { analyzeGraph, canReach } from "@/lib/graph";
import {
  createTodo,
  deleteTodo,
  toggleTodo,
  addDependency,
  removeDependency,
  addMultipleDependencies,
  getTodos,
} from "@/app/actions/todos";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  dueDate: string | null;
  imageUrl: string | null;
  createdAt: string;
  dependsOn: {
    id: number;
    dependsOnId: number;
    dependsOn: { id: number; title: string };
  }[];
  dependedBy: {
    id: number;
    todoId: number;
    todo: { id: number; title: string };
  }[];
}

type SortField = "title" | "dueDate" | "createdAt";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "pending" | "completed";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isOverdue = (d: string) => new Date(d) < new Date();

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatDateTime = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// ─── Image with skeleton loading state ───────────────────────────────────────
function ImageWithSkeleton({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className={`relative ${className || ""}`}>
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}
      {error ? (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded">
          <ImageIcon className="h-4 w-4 text-gray-400" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover rounded ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

// ─── Sort icon ───────────────────────────────────────────────────────────────
function SortIndicator({
  field,
  current,
  dir,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
}) {
  if (field !== current)
    return <span className="text-gray-300 ml-1">&#8597;</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ─── Critical Path Summary ──────────────────────────────────────────────────
function CriticalPathSummary({
  criticalPath,
  todos,
}: {
  criticalPath: number[];
  todos: Todo[];
}) {
  if (criticalPath.length <= 1) return null;
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-orange-800 mb-2">
        Critical Path
      </h3>
      <div className="flex flex-wrap items-center gap-1">
        {criticalPath.map((id, i) => {
          const t = todos.find((t) => t.id === id);
          return (
            <span key={id} className="flex items-center gap-1">
              <Badge variant="warning">{t?.title || `#${id}`}</Badge>
              {i < criticalPath.length - 1 && (
                <ArrowRight className="h-3 w-3 text-orange-400" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function TodoApp({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [depSearch, setDepSearch] = useState("");
  const [depDropdownOpen, setDepDropdownOpen] = useState(false);
  const [selectedDeps, setSelectedDeps] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // nuqs — URL-persisted state
  const [tab, setTab] = useQueryState("tab", { defaultValue: "tasks" });
  const [statusFilter, setStatusFilter] = useQueryState("status", {
    defaultValue: "all",
  });

  // Refresh data from server
  const refresh = useCallback(async () => {
    try {
      const data = await getTodos();
      setTodos(JSON.parse(JSON.stringify(data)));
    } catch (e) {
      console.error("Failed to refresh todos:", e);
    }
  }, []);

  // Close dep dropdown on click outside
  const depDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (depDropdownRef.current && !depDropdownRef.current.contains(e.target as Node)) {
        setDepDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset dep state when switching expanded rows
  useEffect(() => {
    setDepSearch("");
    setDepDropdownOpen(false);
    setSelectedDeps(new Set());
  }, [expandedId]);

  // ── Graph analysis ─────────────────────────────────────────────────────────
  const { earliestStart, criticalPath } = useMemo(
    () => analyzeGraph(todos),
    [todos]
  );
  const criticalSet = useMemo(() => new Set(criticalPath), [criticalPath]);

  const adjacency = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const t of todos) {
      if (!map.has(t.id)) map.set(t.id, []);
      for (const d of t.dependsOn) {
        map.get(t.id)!.push(d.dependsOnId);
      }
    }
    return map;
  }, [todos]);

  // ── Filtered + sorted todos ────────────────────────────────────────────────
  const filteredTodos = useMemo(() => {
    if (statusFilter === "pending") return todos.filter((t) => !t.completed);
    if (statusFilter === "completed") return todos.filter((t) => t.completed);
    return todos;
  }, [todos, statusFilter]);

  const sortedTodos = useMemo(() => {
    const copy = [...filteredTodos];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === "dueDate") {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        cmp = ad - bd;
      } else {
        cmp =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredTodos, sortField, sortDir]);

  // Counts for filter badges
  const pendingCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createTodo(newTitle, newDueDate || null);
      if ("error" in result) {
        setError(result.error!);
      } else {
        setNewTitle("");
        setNewDueDate("");
        await refresh();
      }
    } catch {
      setError("Failed to add todo.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: number, completed: boolean) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed } : t))
    );
    startTransition(async () => {
      await toggleTodo(id, completed);
      await refresh();
    });
  };

  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        "Delete this task? This will also remove its dependencies."
      )
    )
      return;
    try {
      await deleteTodo(id);
      if (expandedId === id) setExpandedId(null);
      await refresh();
    } catch {
      setError("Failed to delete task.");
    }
  };

  const handleAddDeps = async (todoId: number) => {
    if (selectedDeps.size === 0) return;
    setError(null);
    try {
      const results = await addMultipleDependencies(
        todoId,
        Array.from(selectedDeps)
      );
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        setError(errors.map((e) => e.error).join("; "));
      }
      setSelectedDeps(new Set());
      setDepSearch("");
      await refresh();
    } catch {
      setError("Failed to add dependencies.");
    }
  };

  const handleRemoveDep = async (todoId: number, depId: number) => {
    try {
      await removeDependency(todoId, depId);
      await refresh();
    } catch {
      setError("Failed to remove dependency.");
    }
  };

  const toggleDepSelection = (id: number) => {
    setSelectedDeps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Things To Do</h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount} pending · {completedCount} completed
            {criticalPath.length > 1 && (
              <span className="ml-2 text-orange-600">
                · {criticalPath.length} on critical path
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Add task row */}
        <div className="bg-white border rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <input
              type="text"
              className="flex-grow h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="What needs to be done?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              disabled={loading}
            />
            <input
              type="date"
              className="h-10 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              disabled={loading}
            />
            <Button onClick={handleAdd} disabled={loading || !newTitle.trim()}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Add
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-grow">{error}</span>
            <button onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab || "tasks"} onValueChange={setTab}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            </TabsList>

            {/* Status filter (only on tasks tab) */}
            {(tab === "tasks" || !tab) && (
              <div className="flex gap-1">
                {(
                  [
                    ["all", "All", todos.length],
                    ["pending", "Pending", pendingCount],
                    ["completed", "Completed", completedCount],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      statusFilter === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {label}
                    <span className="ml-1 opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tasks tab */}
          <TabsContent value="tasks">
            {todos.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                No tasks yet. Add one above to get started.
              </div>
            ) : sortedTodos.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                No {statusFilter} tasks.
              </div>
            ) : (
              <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="min-w-[640px]">
                    {/* Table header */}
                    <div className="grid grid-cols-[32px_48px_1fr_140px_140px_48px] gap-2 px-4 py-3 border-b bg-gray-50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <span />
                      <span />
                      <button
                        className="text-left flex items-center hover:text-foreground"
                        onClick={() => handleSort("title")}
                      >
                        Task
                        <SortIndicator
                          field="title"
                          current={sortField}
                          dir={sortDir}
                        />
                      </button>
                      <button
                        className="text-left flex items-center hover:text-foreground"
                        onClick={() => handleSort("dueDate")}
                      >
                        Due Date
                        <SortIndicator
                          field="dueDate"
                          current={sortField}
                          dir={sortDir}
                        />
                      </button>
                      <button
                        className="text-left flex items-center hover:text-foreground"
                        onClick={() => handleSort("createdAt")}
                      >
                        Created
                        <SortIndicator
                          field="createdAt"
                          current={sortField}
                          dir={sortDir}
                        />
                      </button>
                      <span />
                    </div>

                    {/* Rows */}
                    {sortedTodos.map((todo) => {
                      const expanded = expandedId === todo.id;
                      const onCritical = criticalSet.has(todo.id);
                      const es = earliestStart.get(todo.id);

                      const existingDepIds = new Set(
                        todo.dependsOn.map((d) => d.dependsOnId)
                      );
                      const availableDeps = todos.filter((t) => {
                        if (t.id === todo.id) return false;
                        if (existingDepIds.has(t.id)) return false;
                        if (canReach(t.id, todo.id, adjacency)) return false;
                        return true;
                      });

                      const filteredDeps = depSearch
                        ? availableDeps.filter((t) =>
                            t.title
                              .toLowerCase()
                              .includes(depSearch.toLowerCase())
                          )
                        : availableDeps;

                      return (
                        <div
                          key={todo.id}
                          className={`border-b last:border-b-0 ${
                            onCritical ? "bg-orange-50/50" : ""
                          }`}
                        >
                          {/* Main row */}
                          <div
                            className="grid grid-cols-[32px_48px_1fr_140px_140px_48px] gap-2 px-4 py-3 items-center hover:bg-gray-50/50 cursor-pointer"
                            onClick={() =>
                              setExpandedId(expanded ? null : todo.id)
                            }
                          >
                            {/* Completion toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggle(todo.id, !todo.completed);
                              }}
                              className={`flex items-center justify-center ${
                                todo.completed
                                  ? "text-green-500"
                                  : "text-gray-300 hover:text-gray-500"
                              }`}
                            >
                              {todo.completed ? (
                                <CheckCircle2 className="h-5 w-5" />
                              ) : (
                                <Circle className="h-5 w-5" />
                              )}
                            </button>

                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                              {todo.imageUrl ? (
                                <ImageWithSkeleton
                                  src={todo.imageUrl}
                                  alt={todo.title}
                                  className="w-10 h-10"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-gray-400" />
                                </div>
                              )}
                            </div>

                            {/* Title + badges */}
                            <div className="flex items-center gap-2 min-w-0">
                              {expanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <span
                                className={`text-sm font-medium truncate ${
                                  todo.completed
                                    ? "text-gray-400 line-through"
                                    : "text-gray-900"
                                }`}
                              >
                                {todo.title}
                              </span>
                              {onCritical && !todo.completed && (
                                <Badge
                                  variant="warning"
                                  className="flex-shrink-0"
                                >
                                  Critical Path
                                </Badge>
                              )}
                              {todo.dependsOn.length > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="flex-shrink-0"
                                >
                                  <Link2 className="h-3 w-3 mr-1" />
                                  {todo.dependsOn.length} dep
                                  {todo.dependsOn.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>

                            {/* Due date */}
                            <div>
                              {todo.dueDate ? (
                                <span
                                  className={`text-sm flex items-center gap-1 ${
                                    todo.completed
                                      ? "text-gray-400"
                                      : isOverdue(todo.dueDate)
                                        ? "text-red-600 font-semibold"
                                        : "text-gray-600"
                                  }`}
                                >
                                  {!todo.completed &&
                                    isOverdue(todo.dueDate) && (
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                    )}
                                  {formatDate(todo.dueDate)}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">
                                  —
                                </span>
                              )}
                            </div>

                            {/* Created */}
                            <div className="text-sm text-gray-500">
                              {formatDate(todo.createdAt)}
                            </div>

                            {/* Delete */}
                            <div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(todo.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {expanded && (
                            <div className="px-4 pb-4 pt-1 border-t bg-gray-50/30">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-10">
                                {/* Image */}
                                <div>
                                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <ImageIcon className="h-3 w-3" /> Image
                                    Preview
                                  </h4>
                                  {todo.imageUrl ? (
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <button className="block w-full overflow-hidden rounded-lg border hover:ring-2 hover:ring-ring transition-all">
                                          <ImageWithSkeleton
                                            src={todo.imageUrl}
                                            alt={todo.title}
                                            className="w-full h-48"
                                          />
                                        </button>
                                      </DialogTrigger>
                                      <DialogContent className="max-w-2xl">
                                        <DialogTitle>{todo.title}</DialogTitle>
                                        <img
                                          src={todo.imageUrl}
                                          alt={todo.title}
                                          className="w-full rounded-lg"
                                        />
                                        <p className="text-xs text-muted-foreground text-center">
                                          Photo from Pexels
                                        </p>
                                      </DialogContent>
                                    </Dialog>
                                  ) : (
                                    <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center border">
                                      <span className="text-sm text-muted-foreground">
                                        No image available
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Dependencies + schedule */}
                                <div className="space-y-4">
                                  {es && todo.dependsOn.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />{" "}
                                        Schedule
                                      </h4>
                                      <p className="text-sm text-gray-700">
                                        Earliest start:{" "}
                                        <span className="font-medium">
                                          {formatDateTime(es)}
                                        </span>
                                      </p>
                                      {onCritical && (
                                        <p className="text-sm text-orange-600 mt-1 flex items-center gap-1">
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                          On the critical path — delays here
                                          will delay the whole project
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  <div>
                                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <Link2 className="h-3 w-3" /> Dependencies
                                    </h4>
                                    {todo.dependsOn.length > 0 ? (
                                      <div className="flex flex-wrap gap-1.5 mb-2">
                                        {todo.dependsOn.map((dep) => (
                                          <Badge
                                            key={dep.id}
                                            variant="secondary"
                                            className="gap-1 pr-1"
                                          >
                                            {dep.dependsOn.title}
                                            <button
                                              onClick={() =>
                                                handleRemoveDep(
                                                  todo.id,
                                                  dep.dependsOnId
                                                )
                                              }
                                              className="ml-0.5 rounded-full hover:bg-gray-300 p-0.5"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground mb-2">
                                        No dependencies
                                      </p>
                                    )}

                                    {/* Multi-select dependency picker */}
                                    {availableDeps.length > 0 && (
                                      <div className="relative" ref={depDropdownRef}>
                                        <input
                                          type="text"
                                          className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                          placeholder="Search tasks to add as dependency..."
                                          value={depSearch}
                                          onChange={(e) =>
                                            setDepSearch(e.target.value)
                                          }
                                          onFocus={() =>
                                            setDepDropdownOpen(true)
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        {depDropdownOpen &&
                                          filteredDeps.length > 0 && (
                                            <div className="absolute z-10 mt-1 w-full border rounded-md bg-white shadow-lg max-h-48 overflow-y-auto">
                                              {filteredDeps.map((t) => {
                                                const isSelected =
                                                  selectedDeps.has(t.id);
                                                return (
                                                  <button
                                                    key={t.id}
                                                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between ${
                                                      isSelected
                                                        ? "bg-primary/10 text-primary"
                                                        : "hover:bg-gray-100"
                                                    }`}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      toggleDepSelection(t.id);
                                                    }}
                                                  >
                                                    <span className="flex items-center gap-2">
                                                      {isSelected ? (
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                      ) : (
                                                        <Circle className="h-3.5 w-3.5 text-gray-400" />
                                                      )}
                                                      {t.title}
                                                    </span>
                                                  </button>
                                                );
                                              })}
                                              {selectedDeps.size > 0 && (
                                                <div className="sticky bottom-0 border-t bg-white p-2">
                                                  <Button
                                                    size="sm"
                                                    className="w-full"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleAddDeps(todo.id);
                                                    }}
                                                  >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    Add {selectedDeps.size}{" "}
                                                    dependenc
                                                    {selectedDeps.size > 1
                                                      ? "ies"
                                                      : "y"}
                                                  </Button>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        {depDropdownOpen &&
                                          depSearch &&
                                          filteredDeps.length === 0 && (
                                            <div className="absolute z-10 mt-1 w-full border rounded-md bg-white shadow-lg px-3 py-2">
                                              <p className="text-xs text-muted-foreground">
                                                No matching tasks available
                                              </p>
                                            </div>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <CriticalPathSummary criticalPath={criticalPath} todos={todos} />
          </TabsContent>

          {/* Dependencies tab */}
          <TabsContent value="dependencies">
            <DependencyGraph todos={todos} criticalPath={criticalPath} />
            <div className="mt-4">
              <CriticalPathSummary criticalPath={criticalPath} todos={todos} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
