import { fixture, projects, token } from "./todoist";
import type { TodoistTask } from "@helios/contracts";
export function taskFixture() {
  const f = fixture();
  let sequence = 0;
  const sections = projects
    .filter((p) => !p.inbox_project)
    .flatMap((p) =>
      ["Offen", "In Arbeit", "Wartet", "Abgeschlossen"].map((name, n) => ({
        id: p.id + ":section:" + n,
        project_id: p.id,
        name,
      })),
    );
  for (const t of f.state.tasks)
    t.section_id = sections.find(
      (s) => s.project_id === t.project_id && s.name === "Offen",
    )!.id;
  const comments = [
    {
      id: "comment:synthetic",
      item_id: f.state.tasks[0]!.id,
      content: "Synthetischer Fortschritt.",
      posted_at: "2026-10-14T10:00:00Z",
      is_deleted: false,
    },
  ];
  const control = {
    fail: "",
    afterWrite: undefined as undefined | (() => void),
    calls: [] as { path: string; body: Record<string, unknown> | undefined }[],
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace("/api/v1/", ""));
    const method = init?.method ?? "GET";
    if (
      new Headers(init?.headers).get("authorization") !== "Bearer " + token ||
      f.state.mode !== "ok"
    )
      return f.fetcher(input, init);
    if (method === "GET") {
      if (["tasks", "sections", "comments"].includes(path))
        f.calls.push({ url: url.toString(), method });
      if (path === "sections")
        return Response.json({
          results: sections.filter(
            (s) => s.project_id === url.searchParams.get("project_id"),
          ),
          next_cursor: null,
        });
      if (path === "comments")
        return Response.json({
          results: comments.filter(
            (c) => c.item_id === url.searchParams.get("task_id"),
          ),
          next_cursor: null,
        });
      if (path === "tasks")
        return Response.json({
          results: f.state.tasks.filter(
            (t) =>
              t.project_id === url.searchParams.get("project_id") &&
              !t.checked &&
              !t.is_deleted,
          ),
          next_cursor: null,
        });
      return f.fetcher(input, init);
    }
    f.calls.push({ url: url.toString(), method });
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    control.calls.push({ path, body });
    if (control.fail === "429")
      return Response.json(
        {},
        { status: 429, headers: { "Retry-After": "40" } },
      );
    if (control.fail === "403") return Response.json({}, { status: 403 });
    if (control.fail === "unknown") throw Error("synthetic disconnected");
    let result: unknown = null;
    let status = 200;
    if (path === "tasks") {
      const t: TodoistTask = {
        id: "created:" + ++sequence,
        project_id: String(body?.project_id ?? projects[4]!.id),
        section_id: body?.section_id ? String(body.section_id) : null,
        parent_id: body?.parent_id ? String(body.parent_id) : null,
        content: String(body?.content),
        description: String(body?.description ?? ""),
        priority: Number(body?.priority ?? 1),
        labels: (body?.labels ?? []) as string[],
        due: null,
        deadline: null,
        duration: null,
        checked: false,
        is_deleted: false,
        updated_at: null,
      };
      f.state.tasks.push(t);
      result = t;
    } else if (path === "comments") {
      const c = {
        id: "comment:" + ++sequence,
        item_id: String(body?.task_id),
        content: String(body?.content),
        posted_at: new Date().toISOString(),
        is_deleted: false,
      };
      comments.push(c);
      result = c;
    } else if (path === "sections") {
      const s = {
        id: "new-section:" + ++sequence,
        name: String(body?.name),
        project_id: String(body?.project_id),
      };
      sections.push(s);
      result = s;
    } else {
      const match = path.match(/^tasks\/(.+?)(?:\/(move|close))?$/);
      const t = f.state.tasks.find((t) => t.id === match?.[1]);
      if (!t) return Response.json({}, { status: 404 });
      const ids = new Set([t.id]);
      let more = true;
      while (more) {
        more = false;
        for (const c of f.state.tasks)
          if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
            ids.add(c.id);
            more = true;
          }
      }
      const affected = f.state.tasks.filter((c) => ids.has(c.id));
      if (method === "DELETE") {
        f.state.tasks = f.state.tasks.filter(
          (v) => !affected.some((c) => c.id === v.id),
        );
        status = 204;
      } else if (match?.[2] === "close") {
        if (t.due?.is_recurring)
          t.due = {
            ...t.due,
            date: new Date(Date.parse(t.due.date) + 86400000)
              .toISOString()
              .slice(0, 10),
          };
        else for (const row of affected) row.checked = true;
        status = 204;
      } else if (match?.[2] === "move") {
        if (body?.section_id) {
          for (const row of affected) row.section_id = String(body.section_id);
          t.parent_id = null;
        }
        if (body?.project_id) {
          for (const row of affected) {
            row.project_id = String(body.project_id);
            row.section_id = null;
          }
          t.parent_id = null;
        }
        if (body?.parent_id) {
          t.parent_id = String(body.parent_id);
          t.section_id =
            f.state.tasks.find((v) => v.id === t.parent_id)?.section_id ?? null;
        }
      } else {
        for (const field of [
          "content",
          "description",
          "priority",
          "labels",
        ] as const)
          if (body && field in body) Object.assign(t, { [field]: body[field] });
        if (body?.due_string === "no date") t.due = null;
        else if (body?.due_string)
          t.due = {
            date: "2026-11-01",
            string: String(body.due_string).replace(
              / starting \d{4}-\d{2}-\d{2}$/,
              "",
            ),
            lang: "en",
            is_recurring: true,
          };
        if (body?.due_date)
          t.due = { date: String(body.due_date), is_recurring: false };
        if (body?.due_datetime)
          t.due = {
            date: String(body.due_datetime).slice(0, 10),
            datetime: String(body.due_datetime),
            is_recurring: false,
          };
        if (body && "deadline_date" in body)
          t.deadline = body.deadline_date
            ? { date: String(body.deadline_date) }
            : null;
        if (body && "duration" in body)
          t.duration = body.duration
            ? { amount: Number(body.duration), unit: "minute" }
            : null;
      }
      result = t;
    }
    await control.afterWrite?.();
    if (control.fail === "applied") throw Error("synthetic response lost");
    return status === 204
      ? new Response(null, { status })
      : Response.json(result);
  };
  return { ...f, sections, comments, control, fetcher };
}
