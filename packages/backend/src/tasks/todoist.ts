import type { TaskFields } from "@helios/contracts";
import { WorkFault } from "../work/service";
export function fieldPatch(f: Partial<TaskFields>) {
  const out: Record<string, unknown> = {};
  for (const name of ["content", "description", "priority", "labels"] as const)
    if (f[name] !== undefined) out[name] = f[name];
  if (f.due !== undefined) {
    if (f.due === null) out.due_string = "no date";
    else if (f.due.includes("T")) out.due_datetime = f.due;
    else out.due_date = f.due;
  }
  if (f.recurring) {
    if (f.due !== undefined) throw new WorkFault("INVALID_REQUEST");
    out.due_string = f.recurring;
    out.due_lang = "en";
  }
  if (f.deadline !== undefined) out.deadline_date = f.deadline;
  if (f.duration !== undefined) {
    out.duration = f.duration;
    out.duration_unit = f.duration === null ? null : "minute";
  }
  return out;
}
export function createTaskWriter(
  fetcher: typeof fetch = fetch,
  base = "https://api.todoist.com/api/v1/",
) {
  return async (
    token: string,
    method: "POST" | "DELETE",
    path: string,
    body: Record<string, unknown> | undefined,
    key: string,
  ) => {
    if (
      !/^(tasks(?:\/[^/]+(?:\/(?:move|close))?)?|comments|sections)$/.test(path)
    )
      throw new WorkFault("INVALID_REQUEST");
    let r: Response;
    try {
      r = await fetcher(new URL(path, base), {
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "X-Request-Id": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
    } catch {
      throw new WorkFault("OUTCOME_UNKNOWN", 409);
    }
    if (r.status === 429) {
      const delay = Number(r.headers.get("retry-after"));
      await r.body?.cancel();
      throw new TaskRateLimit(
        Number.isFinite(delay) ? Math.max(30, Math.min(86400, delay)) : 60,
      );
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new WorkFault(
        r.status >= 500
          ? "OUTCOME_UNKNOWN"
          : r.status === 403
            ? "TODOIST_PERMISSION"
            : "TODOIST_REJECTED",
        r.status >= 500 ? 409 : 422,
      );
    }
    if (r.status === 204) return null;
    const stream = r.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (stream)
        while (true) {
          const part = await stream.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 8 * 1024 * 1024)
            throw new WorkFault("OUTCOME_UNKNOWN", 409);
          chunks.push(part.value);
        }
    } catch {
      throw new WorkFault("OUTCOME_UNKNOWN", 409);
    } finally {
      await stream?.cancel();
    }
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      throw new WorkFault("OUTCOME_UNKNOWN", 409);
    }
  };
}
export class TaskRateLimit extends WorkFault {
  constructor(public seconds: number) {
    super("rate_limit", 429);
  }
}
export type TaskWriter = ReturnType<typeof createTaskWriter>;

export function matchesFields(
  task: import("@helios/contracts").TodoistTask,
  desired: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(desired)) {
    if (["project_id", "section_id", "parent_id"].includes(key)) {
      if (task[key as "project_id"] !== value) return false;
      continue;
    }
    if (key === "due_lang" || key === "duration_unit") continue;
    if (key === "due_string") {
      if (value === "no date") {
        if (task.due) return false;
      } else {
        const normalize = (text: string) =>
          text.trim().toLowerCase().replace(/\s+/g, " ");
        const requested = normalize(String(value));
        const start = requested.match(/^(.*?) starting (\d{4}-\d{2}-\d{2})$/);
        if (!task.due?.is_recurring || !task.due.string) return false;
        if (normalize(task.due.string) !== (start?.[1] ?? requested))
          return false;
        if (start && task.due.date.slice(0, 10) !== start[2]) return false;
      }
      continue;
    }
    if (key === "due_date") {
      if (task.due?.date.slice(0, 10) !== value) return false;
      continue;
    }
    if (key === "due_datetime") {
      const actual = task.due?.datetime ?? task.due?.date;
      if (!actual || Date.parse(actual) !== Date.parse(String(value)))
        return false;
      continue;
    }
    if (key === "deadline_date") {
      if ((task.deadline?.date ?? null) !== value) return false;
      continue;
    }
    if (key === "duration") {
      if ((task.duration?.amount ?? null) !== value) return false;
      continue;
    }
    const actual = task[key as "content"];
    if (Array.isArray(actual) && Array.isArray(value)) {
      if (
        [...actual]
          .sort((a, b) => String(a).localeCompare(String(b)))
          .join("\0") !==
        [...value].sort((a, b) => String(a).localeCompare(String(b))).join("\0")
      )
        return false;
    } else if (actual !== value) return false;
  }
  return true;
}
