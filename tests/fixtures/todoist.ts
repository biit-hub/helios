import type { TodoistTask } from "@helios/contracts";
export const token = "synthetic-todoist-fixture-only";
export const projects = [
  {
    id: "project:private/alpha",
    name: "Privater Raum",
    inbox_project: false,
    is_archived: false,
    is_deleted: false,
  },
  {
    id: "project:work/beta",
    name: "Atelier Nord",
    inbox_project: false,
    is_archived: false,
    is_deleted: false,
  },
  {
    id: "project:work/gamma",
    name: "Studio West",
    inbox_project: false,
    is_archived: false,
    is_deleted: false,
  },
  {
    id: "project:work/delta",
    name: "Labor Süd",
    inbox_project: false,
    is_archived: false,
    is_deleted: false,
  },
  {
    id: "inbox:opaque",
    name: "Eingang",
    inbox_project: true,
    is_archived: false,
    is_deleted: false,
  },
];
export const tasks: TodoistTask[] = [
  {
    id: "task:parent/alpha",
    project_id: projects[0]!.id,
    parent_id: null,
    section_id: "section:open",
    content: "Ausflug vorbereiten",
    description:
      "## Ziel\nEine ruhige Auszeit.\n\n## Checkliste\n- [ ] Route auswählen",
    priority: 3,
    checked: false,
    is_deleted: false,
    labels: ["epic"],
    due: {
      date: "2026-10-20",
      datetime: "2026-10-20T10:00:00",
      timezone: "Europe/Zurich",
      is_recurring: false,
    },
    deadline: { date: "2026-10-23" },
    duration: { amount: 30, unit: "minute" },
    updated_at: "2026-10-14T12:00:00Z",
  },
  {
    id: "task:child/beta",
    project_id: projects[0]!.id,
    parent_id: "task:parent/alpha",
    section_id: "section:open",
    content: "Verbindung nachschlagen",
    description: "Keine automatische Buchung.",
    priority: 1,
    checked: false,
    is_deleted: false,
    labels: [],
    due: null,
    deadline: null,
    duration: null,
    updated_at: null,
  },
];
export function fixture() {
  const calls: { url: string; method: string }[] = [];
  const state = {
    mode: "ok",
    projects: structuredClone(projects),
    tasks: structuredClone(tasks),
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace("/api/v1/", ""));
    const method = init?.method ?? "GET";
    calls.push({ url: url.toString(), method });
    if (new Headers(init?.headers).get("authorization") !== "Bearer " + token)
      return Response.json(
        { error: "synthetic invalid credentials" },
        { status: 401 },
      );
    if (method !== "GET")
      return Response.json({ error: "WRITE_FORBIDDEN" }, { status: 405 });
    if (state.mode === "network") throw new Error("synthetic network " + token);
    if (state.mode === "timeout")
      throw new DOMException("synthetic timeout " + token, "TimeoutError");
    if (state.mode === "rate_limit")
      return Response.json(
        { retry_after: 90, error: token },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    if (state.mode === "auth_error" || state.mode === "expired")
      return Response.json({ error: token }, { status: 401 });
    if (state.mode === "unexpected") return Response.json({ bad: token });
    if (state.mode === "missing")
      return Response.json({ error: token }, { status: 404 });
    if (path === "projects")
      return Response.json({
        results: url.searchParams.has("cursor")
          ? state.projects.slice(2)
          : state.projects.slice(0, 2),
        next_cursor: url.searchParams.has("cursor") ? null : "page.two",
      });
    if (path.startsWith("projects/")) {
      const p = state.projects.find((p) => p.id === path.slice(9));
      return p
        ? Response.json(p)
        : Response.json({ error: "missing" }, { status: 404 });
    }
    if (path === "tasks") {
      const rows = state.tasks.filter(
        (t) => t.project_id === url.searchParams.get("project_id"),
      );
      return Response.json({
        results: url.searchParams.has("cursor")
          ? rows.slice(1)
          : rows.slice(0, 1),
        next_cursor:
          !url.searchParams.has("cursor") && rows.length > 1
            ? "tasks.two"
            : null,
      });
    }
    if (path === "sections")
      return Response.json({
        results: [
          {
            id: "section:open",
            project_id: url.searchParams.get("project_id"),
            name: "Offen",
          },
        ],
        next_cursor: null,
      });
    if (path.startsWith("tasks/")) {
      const t = state.tasks.find((t) => t.id === path.slice(6));
      return t
        ? Response.json(t)
        : Response.json({ error: "missing" }, { status: 404 });
    }
    if (path === "comments")
      return Response.json({
        results: [
          {
            id: "comment:one",
            content: "Synthetischer Fortschritt.",
            posted_at: "2026-10-14T12:00:00Z",
            item_id: url.searchParams.get("task_id"),
            is_deleted: false,
          },
        ],
        next_cursor: null,
      });
    return Response.json({ error: "unknown" }, { status: 404 });
  };
  return { state, calls, fetcher };
}
