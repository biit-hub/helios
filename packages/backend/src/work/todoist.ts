import { z } from "zod";
import { todoistTaskSchema, externalId } from "@helios/contracts";
import type { ProblemCode } from "@helios/contracts";
export class TodoistFault extends Error {
  constructor(
    public code: ProblemCode,
    public retrySeconds = 30,
  ) {
    super(code);
  }
}
const project = z
  .object({
    id: externalId,
    name: z.string().min(1).max(1000),
    inbox_project: z.boolean().optional(),
    workspace_id: externalId.optional(),
    is_archived: z.boolean(),
    is_deleted: z.boolean(),
  })
  .refine((v) => v.inbox_project !== undefined || v.workspace_id !== undefined);
const section = z.object({
  id: externalId,
  project_id: externalId,
  name: z.string(),
});
const comment = z.object({
  id: externalId,
  content: z.string().default(""),
  posted_at: z.string().nullable(),
  item_id: externalId.nullable(),
  is_deleted: z.boolean(),
});
export type TodoistReader = ReturnType<typeof createTodoistReader>;
// A fixed origin, GET-only transport and redirect rejection are structural, not UI promises.
export function createTodoistReader(
  fetcher: typeof fetch = fetch,
  base = "https://api.todoist.com/api/v1/",
  timeout = 5000,
) {
  async function get(
    path: string,
    token: string,
    query: Record<string, string> = {},
    started = Date.now(),
  ): Promise<unknown> {
    if (Date.now() - started > 45000) throw new TodoistFault("timeout");
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    try {
      const response = await fetcher(url, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        cache: "no-store",
      });
      if (!response.ok)
        throw new TodoistFault(
          classifyResponse(response.status, path, query),
          await retryDelay(response),
        );
      return await boundedJson(response);
    } catch (e) {
      throw normalizedFault(e);
    }
  }
  async function pages<T>(
    path: string,
    token: string,
    item: z.ZodType<T>,
    query: Record<string, string> = {},
  ) {
    const started = Date.now();
    let cursor: string | null = null;
    const seen = new Set<string>();
    const items: T[] = [];
    for (let page = 0; page < 1000; page++) {
      const result = z
        .object({
          results: z.array(item),
          next_cursor: z.string().max(4000).nullable(),
        })
        .safeParse(
          await get(
            path,
            token,
            { ...query, limit: "200", ...(cursor ? { cursor } : {}) },
            started,
          ),
        );
      if (!result.success) throw new TodoistFault("unexpected");
      items.push(...result.data.results);
      cursor = result.data.next_cursor;
      if (!cursor) return items;
      if (seen.has(cursor)) throw new TodoistFault("unexpected");
      seen.add(cursor);
    }
    throw new TodoistFault("unexpected");
  }
  return {
    labels: async (t: string) => {
      const [personal, shared] = await Promise.all([
        pages(
          "labels",
          t,
          z.object({ id: externalId, name: z.string().min(1).max(100) }),
        ),
        pages("labels/shared", t, z.string().min(1).max(100)),
      ]);
      return [
        ...new Set([...personal.map((label) => label.name), ...shared]),
      ].sort((a, b) => a.localeCompare(b));
    },
    projects: (t: string) => pages("projects", t, project),
    project: async (t: string, id: string) => {
      const r = project.safeParse(
        await get("projects/" + encodeURIComponent(id), t),
      );
      if (!r.success) throw new TodoistFault("unexpected");
      return r.data;
    },
    tasks: (t: string, p: string) =>
      pages("tasks", t, todoistTaskSchema, { project_id: p }),
    sections: (t: string, p: string) =>
      pages("sections", t, section, { project_id: p }),
    task: async (t: string, id: string) => {
      const r = todoistTaskSchema.safeParse(
        await get("tasks/" + encodeURIComponent(id), t),
      );
      if (!r.success) throw new TodoistFault("unexpected");
      return r.data;
    },
    comments: async (t: string, id: string) =>
      (await pages("comments", t, comment, { task_id: id }))
        .filter((c) => !c.is_deleted && c.item_id === id)
        .map(({ id, content, posted_at }) => ({ id, content, posted_at })),
  };
}

function classifyResponse(
  status: number,
  path: string,
  query: Record<string, string>,
): ProblemCode {
  if (status === 401) return "auth_error";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "network";
  if (status !== 403 && status !== 404) return "unexpected";
  if (path.startsWith("projects/") || query.project_id)
    return "project_missing";
  if (path.startsWith("tasks/") || query.task_id) return "task_unavailable";
  if (status === 403) return "auth_error";
  return "unexpected";
}
async function retryDelay(response: Response) {
  const header = response.headers.get("retry-after");
  let delay = Number(header);
  if (!Number.isFinite(delay))
    delay = (Date.parse(header ?? "") - Date.now()) / 1000;
  try {
    const body = await boundedJson(response);
    if (
      typeof body === "object" &&
      body !== null &&
      "retry_after" in body &&
      typeof body.retry_after === "number"
    )
      delay = Math.max(delay || 0, body.retry_after);
  } catch {
    /* Status and safe header remain authoritative when the error body is absent or invalid. */
  }
  return Math.min(86400, Math.max(1, Math.ceil(delay || 30)));
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new TodoistFault("unexpected");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) throw new TodoistFault("unexpected");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TodoistFault("unexpected");
  }
}
function normalizedFault(error: unknown) {
  if (error instanceof TodoistFault) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    ["TimeoutError", "AbortError"].includes(String(error.name))
  )
    return new TodoistFault("timeout");
  return new TodoistFault("network");
}
