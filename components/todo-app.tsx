"use client";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DependencyGraph } from "@/components/dependency-graph";
import { analyzeGraph, canReach } from "@/lib/graph";
import type { Todo, SortField, SortDir } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseStoredDate(d: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!match) return null;

  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

/**
 * Due dates are chosen as calendar days, so overdue status should flip after
 * the end of that local day rather than based on the stored UTC timestamp.
 */
const isOverdue = (d: string) => {
  const parsed = parseStoredDate(d);
  if (!parsed) return new Date(d) < new Date();

  const dueEndOfDay = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    23,
    59,
    59,
    999
  );
  return dueEndOfDay.getTime() < Date.now();
};

/** Format a due date — extracts UTC date components so the displayed
 *  calendar day always matches what the user picked, regardless of timezone. */
const formatDueDate = (d: string) => {
  const parsed = parseStoredDate(d);
  const date = parsed
    ? new Date(parsed.year, parsed.month - 1, parsed.day)
    : new Date(d);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** Format a timestamp (like createdAt) using the browser's local timezone. */
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const dueDateSortValue = (d: string) => {
  const parsed = parseStoredDate(d);
  if (!parsed) return new Date(d).getTime();
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day);
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatScheduleDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatSlack = (slackMs: number) => {
  const slackDays = Math.round(slackMs / DAY_MS);
  if (slackDays <= 0) return "No slack";
  return `${slackDays} day${slackDays === 1 ? "" : "s"} of slack`;
};

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
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalHeight > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div className={`relative overflow-hidden ${className || ""}`}>
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}
      {error ? (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center rounded">
          <ImageIcon className="h-4 w-4 text-gray-400" />
        </div>
      ) : (
        <img
          ref={imgRef}
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
  criticalPaths,
  todos,
}: {
  criticalPaths: number[][];
  todos: Todo[];
}) {
  const visiblePaths = criticalPaths.filter((path) => path.length > 1);
  const todoMap = useMemo(() => new Map(todos.map((todo) => [todo.id, todo])), [todos]);

  if (visiblePaths.length === 0) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-orange-800 mb-2">
        {visiblePaths.length === 1
          ? "Critical Path"
          : `Critical Paths (${visiblePaths.length})`}
      </h3>
      <div className="space-y-2">
        {visiblePaths.map((path, pathIndex) => (
          <div key={path.join("-")} className="flex flex-wrap items-center gap-1">
            {visiblePaths.length > 1 && (
              <span className="mr-1 text-xs font-medium text-orange-700">
                Path {pathIndex + 1}
              </span>
            )}
            {path.map((id, i) => {
              const todo = todoMap.get(id);
              return (
                <span key={`${pathIndex}-${id}`} className="flex items-center gap-1">
                  <Badge variant="warning">{todo?.title || `#${id}`}</Badge>
                  {i < path.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-orange-400" />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Thumbnail ──────────────────────────────────────────────────────────────
function TodoThumbnail({
  todo,
  isImageLoading,
}: {
  todo: Todo;
  isImageLoading: boolean;
}) {
  if (todo.imageUrl) {
    return (
      <ImageWithSkeleton
        src={todo.imageUrl}
        alt={todo.title}
        className="w-10 h-10"
      />
    );
  }
  if (isImageLoading) {
    return (
      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
        <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
      </div>
    );
  }
  if (todo.imageStatus === "failed") {
    return (
      <div className="w-10 h-10 bg-red-50 rounded flex items-center justify-center border border-red-100">
        <AlertTriangle className="h-4 w-4 text-red-400" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
      <ImageIcon className="h-4 w-4 text-gray-400" />
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
  const [depLoading, setDepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [mutatingTodoIds, setMutatingTodoIds] = useState<Set<number>>(
    new Set()
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // nuqs — URL-persisted state
  const [tab, setTab] = useQueryState("tab", { defaultValue: "tasks" });
  const [statusFilter, setStatusFilter] = useQueryState("status", {
    defaultValue: "all",
  });

  // Reload all todos from the server and update state.
  // Defined as a plain async function (not useCallback) so it always
  // captures the current setTodos — avoids stale-closure issues with HMR.
  async function reloadTodos() {
    const res = await fetch("/api/todos", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Todo[];
    setTodos(data);
  }

  const setTodoMutating = useCallback((todoId: number, isMutating: boolean) => {
    setMutatingTodoIds((prev) => {
      const next = new Set(prev);
      if (isMutating) next.add(todoId);
      else next.delete(todoId);
      return next;
    });
  }, []);

  // On mount, resume any images left in "pending" state from a previous session
  useEffect(() => {
    let cancelled = false;
    async function resumePending() {
      const pending = initialTodos.filter(
        (t) => t.imageStatus === "pending" && !t.imageUrl
      );
      if (pending.length === 0) return;

      for (const todo of pending) {
        if (cancelled) return;
        await fetch(`/api/todos/${todo.id}/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => {});
      }

      if (!cancelled) {
        await reloadTodos();
      }
    }
    void resumePending();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close dep dropdown on click outside
  const depDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        depDropdownRef.current &&
        !depDropdownRef.current.contains(e.target as Node)
      ) {
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
  const projectStart = useMemo(() => {
    const baseline = new Date();
    baseline.setHours(0, 0, 0, 0);
    return baseline;
  }, []);

  const {
    earliestStart,
    slackMs,
    criticalPaths,
    criticalTaskIds,
    criticalEdgeIds,
  } = useMemo(
    () => analyzeGraph(todos, projectStart),
    [todos, projectStart]
  );
  const criticalSet = useMemo(() => new Set(criticalTaskIds), [criticalTaskIds]);

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

  // ── Available deps — computed only for the expanded row ────────────────────
  const availableDeps = useMemo(() => {
    if (expandedId === null) return [];
    const expandedTodo = todos.find((t) => t.id === expandedId);
    if (!expandedTodo) return [];
    const existingDepIds = new Set(
      expandedTodo.dependsOn.map((d) => d.dependsOnId)
    );
    return todos.filter((t) => {
      if (t.id === expandedId) return false;
      if (existingDepIds.has(t.id)) return false;
      if (canReach(t.id, expandedId, adjacency)) return false;
      return true;
    });
  }, [expandedId, todos, adjacency]);

  const filteredDeps = useMemo(() => {
    if (!depSearch) return availableDeps;
    return availableDeps.filter((t) =>
      t.title.toLowerCase().includes(depSearch.toLowerCase())
    );
  }, [availableDeps, depSearch]);

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
        const ad = a.dueDate ? dueDateSortValue(a.dueDate) : Infinity;
        const bd = b.dueDate ? dueDateSortValue(b.dueDate) : Infinity;
        cmp = ad - bd;
      } else {
        cmp =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredTodos, sortField, sortDir]);

  const pendingCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  );
  const completedCount = useMemo(
    () => todos.filter((t) => t.completed).length,
    [todos]
  );

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
    const title = newTitle.trim();
    if (!title) return;
    setLoading(true);
    setError(null);
    try {
      const createRes = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dueDate: newDueDate || null }),
      });
      const createdTodo = (await createRes.json()) as Todo;
      if (!createRes.ok) {
        setError((createdTodo as unknown as { error?: string }).error || "Failed to add todo.");
        return;
      }

      setNewTitle("");
      setNewDueDate("");
      setTodos((prev) => [createdTodo, ...prev]);
      setLoading(false);

      // Fetch the Pexels image, then reload all todos so it appears in-place
      if (createdTodo.imageStatus === "pending") {
        const imgRes = await fetch(`/api/todos/${createdTodo.id}/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (imgRes.ok) {
          await reloadTodos();
        } else {
          const err = await imgRes.json().catch(() => null);
          const message =
            (err && typeof err === "object" && "error" in err && err.error) ||
            "Failed to fetch image.";
          setTodos((prev) =>
            prev.map((t) =>
              t.id === createdTodo.id
                ? { ...t, imageStatus: "failed" as const, imageError: message }
                : t
            )
          );
        }
      }
    } catch {
      setError("Failed to add todo.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: number, completed: boolean) => {
    const previousTodo = todos.find((todo) => todo.id === id);
    if (!previousTodo || mutatingTodoIds.has(id)) return;

    setTodoMutating(id, true);
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, completed } : todo))
    );

    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const data = (await res.json().catch(() => null)) as
        | Todo
        | { error?: string }
        | null;

      if (!res.ok) {
        setTodos((prev) =>
          prev.map((todo) => (todo.id === id ? previousTodo : todo))
        );
        setError(
          (data && "error" in data && data.error) || "Failed to update task."
        );
        return;
      }

      if (data && "id" in data) {
        const updatedTodo = data as Todo;
        setTodos((prev) => {
          const idx = prev.findIndex((t) => t.id === updatedTodo.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = updatedTodo;
          return next;
        });
      }
    } catch {
      setTodos((prev) => prev.map((todo) => (todo.id === id ? previousTodo : todo)));
      setError("Failed to update task.");
    } finally {
      setTodoMutating(id, false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete task");
        return;
      }
      if (expandedId === id) setExpandedId(null);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("Failed to delete task.");
    }
  };

  const handleAddDeps = async (todoId: number) => {
    if (selectedDeps.size === 0) return;
    setError(null);
    setDepLoading(true);
    try {
      const res = await fetch(`/api/todos/${todoId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnIds: Array.from(selectedDeps) }),
      });
      const data = (await res.json()) as
        | { results?: { id: number; error?: string }[]; error?: string }
        | undefined;

      if (!res.ok) {
        setError(data?.error || "Failed to add dependencies.");
        return;
      }

      const errors =
        data?.results
          ?.filter((result) => result.error)
          .map((result) => result.error as string) || [];

      setSelectedDeps(new Set());
      setDepSearch("");
      setDepDropdownOpen(false);

      await reloadTodos();

      if (errors.length > 0) {
        setError(errors.join("; "));
      }
    } catch {
      setError("Failed to add dependencies.");
    } finally {
      setDepLoading(false);
    }
  };

  const handleRemoveDep = async (todoId: number, depId: number) => {
    setDepLoading(true);
    try {
      const res = await fetch(`/api/todos/${todoId}/dependencies`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnId: depId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to remove dependency");
        return;
      }

      await reloadTodos();
    } catch {
      setError("Failed to remove dependency.");
    } finally {
      setDepLoading(false);
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

  const toggleExpanded = (id: number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Things To Do</h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount} pending · {completedCount} completed
            {criticalTaskIds.length > 0 && (
              <span className="ml-2 text-orange-600">
                · {criticalTaskIds.length} critical task
                {criticalTaskIds.length === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Add task row */}
        <div className="bg-white border rounded-lg shadow-sm p-4">
          <form
            className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading && newTitle.trim()) {
                void handleAdd();
              }
            }}
          >
            <input
              type="text"
              className="flex-grow h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="What needs to be done?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={loading}
              aria-label="New task title"
              maxLength={500}
            />
            <input
              type="date"
              className="h-10 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              disabled={loading}
              aria-label="Due date"
            />
            <Button type="submit" disabled={loading || !newTitle.trim()}>
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
          </form>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 bg-red-50 text-red-700 text-sm border border-red-200 rounded-lg px-4 py-3"
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-grow">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
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

            {(tab === "tasks" || !tab) && (
              <div
                className="flex gap-1"
                role="group"
                aria-label="Filter tasks by status"
              >
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
                    aria-pressed={statusFilter === value}
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
                        aria-label={`Sort by title`}
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
                        aria-label={`Sort by due date`}
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
                        aria-label={`Sort by created date`}
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
                      const slack = slackMs.get(todo.id) ?? 0;
                      const isImgLoading = todo.imageStatus === "pending";
                      const isMutating = mutatingTodoIds.has(todo.id);

                      return (
                        <div
                          key={todo.id}
                          className={`border-b last:border-b-0 ${
                            onCritical ? "bg-orange-50/50" : ""
                          }`}
                        >
                          {/* Main row */}
                          <div
                            className={`grid grid-cols-[32px_48px_1fr_140px_140px_48px] gap-2 px-4 py-3 items-center hover:bg-gray-50/50 cursor-pointer `}
                            onClick={() => toggleExpanded(todo.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleExpanded(todo.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            aria-label={`${todo.title}, click to ${expanded ? "collapse" : "expand"} details`}
                          >
                            {/* Completion toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleToggle(todo.id, !todo.completed);
                              }}
                              className={`flex items-center justify-center ${
                                todo.completed
                                  ? "text-green-500"
                                  : "text-gray-300 hover:text-gray-500"
                              }`}
                              disabled={isMutating}
                              aria-label={
                                todo.completed
                                  ? `Mark "${todo.title}" as incomplete`
                                  : `Mark "${todo.title}" as complete`
                              }
                            >
                              {todo.completed ? (
                                <CheckCircle2 className="h-5 w-5" />
                              ) : (
                                <Circle className="h-5 w-5" />
                              )}
                            </button>

                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                              <TodoThumbnail
                                todo={todo}
                                isImageLoading={isImgLoading}
                              />
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
                                  {formatDueDate(todo.dueDate)}
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
                                  setConfirmDeleteId(todo.id);
                                }}
                                aria-label={`Delete "${todo.title}"`}
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
                                        <button
                                          className="block w-full overflow-hidden rounded-lg border hover:ring-2 hover:ring-ring transition-all"
                                          aria-label="Open full-size image preview"
                                        >
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
                                  ) : isImgLoading ? (
                                    <div className="w-full h-48 bg-gray-100 rounded-lg border flex flex-col items-center justify-center gap-2">
                                      <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                                      <p className="text-sm text-muted-foreground">
                                        Searching Pexels...
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="w-full h-48 bg-gray-100 rounded-lg border flex flex-col items-center justify-center gap-2 p-4 text-center">
                                      <span className="text-sm text-muted-foreground">
                                        {todo.imageStatus === "failed"
                                          ? "Image lookup failed"
                                          : "No image available"}
                                      </span>
                                      {todo.imageError && (
                                        <span className="text-xs text-muted-foreground">
                                          {todo.imageError}
                                        </span>
                                      )}
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          setTodos((prev) =>
                                            prev.map((t) =>
                                              t.id === todo.id
                                                ? { ...t, imageStatus: "pending" as const, imageError: null }
                                                : t
                                            )
                                          );
                                          const res = await fetch(
                                            `/api/todos/${todo.id}/image`,
                                            {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ force: true }),
                                            }
                                          );
                                          if (res.ok) {
                                            await reloadTodos();
                                          }
                                        }}
                                      >
                                        Retry image search
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Dependencies + schedule */}
                                <div className="space-y-4">
                                  {es && (
                                    <div>
                                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />{" "}
                                        Schedule
                                      </h4>
                                      <p className="text-sm text-gray-700">
                                        Earliest start:{" "}
                                        <span className="font-medium">
                                          {formatScheduleDate(es)}
                                        </span>
                                      </p>
                                      {onCritical && (
                                        <p className="text-sm text-orange-600 mt-1 flex items-center gap-1">
                                          <AlertTriangle className="h-3.5 w-3.5" />
                                          On the critical path — delays here
                                          will delay the whole project
                                        </p>
                                      )}
                                      {!onCritical && (
                                        <p className="text-sm text-gray-500 mt-1">
                                          {formatSlack(slack)}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  <div>
                                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <Link2 className="h-3 w-3" /> Dependencies
                                      {depLoading && (
                                        <Loader2 className="h-3 w-3 animate-spin ml-1" />
                                      )}
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
                                              disabled={depLoading}
                                              aria-label={`Remove dependency on "${dep.dependsOn.title}"`}
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
                                      <div
                                        className="relative"
                                        ref={depDropdownRef}
                                      >
                                        <input
                                          type="text"
                                          className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                          placeholder={
                                            selectedDeps.size > 0
                                              ? `${selectedDeps.size} selected — type to filter more...`
                                              : "Search tasks to add as dependency..."
                                          }
                                          value={depSearch}
                                          onChange={(e) =>
                                            setDepSearch(e.target.value)
                                          }
                                          onFocus={() =>
                                            setDepDropdownOpen(true)
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                          disabled={depLoading}
                                          aria-label="Search dependencies"
                                        />
                                        {selectedDeps.size > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-1.5">
                                            {Array.from(selectedDeps).map((depId) => {
                                              const t = todos.find((t) => t.id === depId);
                                              return (
                                                <Badge
                                                  key={depId}
                                                  variant="secondary"
                                                  className="gap-1 pr-1 text-xs"
                                                >
                                                  {t?.title || `#${depId}`}
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      toggleDepSelection(depId);
                                                    }}
                                                    className="ml-0.5 rounded-full hover:bg-gray-300 p-0.5"
                                                    aria-label={`Deselect "${t?.title}"`}
                                                  >
                                                    <X className="h-2.5 w-2.5" />
                                                  </button>
                                                </Badge>
                                              );
                                            })}
                                          </div>
                                        )}
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
                                        {selectedDeps.size > 0 && (
                                          <div className="mt-2">
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="w-full"
                                              disabled={depLoading}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                void handleAddDeps(todo.id);
                                              }}
                                            >
                                              {depLoading ? (
                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                              ) : (
                                                <Plus className="h-3 w-3 mr-1" />
                                              )}
                                              Add {selectedDeps.size} dependenc
                                              {selectedDeps.size > 1 ? "ies" : "y"}
                                            </Button>
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

            <div className="mt-4">
              <CriticalPathSummary criticalPaths={criticalPaths} todos={todos} />
            </div>
          </TabsContent>

          {/* Dependencies tab */}
          <TabsContent value="dependencies">
            <DependencyGraph
              todos={todos}
              criticalTaskIds={criticalTaskIds}
              criticalEdgeIds={criticalEdgeIds}
            />
            <div className="mt-4">
              <CriticalPathSummary criticalPaths={criticalPaths} todos={todos} />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete confirmation dialog */}
      <Dialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete Task</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this task and remove its dependencies.
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
