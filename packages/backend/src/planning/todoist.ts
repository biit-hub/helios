import { TodoistFault } from "../work/todoist";
export type TodoistMover = ReturnType<typeof createTodoistMover>;
// Separate narrow write adapter: the E2 reader stays structurally GET-only.
export function createTodoistMover(
  fetcher: typeof fetch = fetch,
  base = "https://api.todoist.com/api/v1/",
  timeout = 5000,
) {
  return {
    async move(
      token: string,
      taskId: string,
      sectionId: string,
      requestId: string,
    ) {
      let r: Response;
      try {
        r = await fetcher(
          new URL("tasks/" + encodeURIComponent(taskId) + "/move", base),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
              "X-Request-Id": requestId,
            },
            body: JSON.stringify({ section_id: sectionId }),
            redirect: "error",
            signal: AbortSignal.timeout(timeout),
            cache: "no-store",
          },
        );
      } catch {
        throw new TodoistFault("timeout");
      }
      // Never log or echo a write response. A successful HTTP response still needs GET reconciliation.
      await r.body?.cancel();
      if (r.status === 429) {
        let seconds = Number(r.headers.get("retry-after"));
        if (!Number.isFinite(seconds))
          seconds =
            (Date.parse(r.headers.get("retry-after") ?? "") - Date.now()) /
            1000;
        throw new TodoistFault(
          "rate_limit",
          Math.min(86400, Math.max(30, Math.ceil(seconds || 60))),
        );
      }
      if (r.status === 401 || r.status === 403)
        throw new TodoistFault("auth_error");
      if (r.status === 404) throw new TodoistFault("task_unavailable");
      if (!r.ok)
        throw new TodoistFault(r.status >= 500 ? "network" : "unexpected");
    },
  };
}
