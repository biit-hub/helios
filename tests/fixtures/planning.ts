import { fixture, token } from "./todoist";
export function planningFixture() {
  const f = fixture();
  const control = {
    failTask: "",
    timeoutApplied: "",
    timeoutUnknown: "",
    missingSection: false,
    afterMove: undefined as undefined | (() => Promise<void>),
  };
  const base = f.fetcher;
  const fetcher: typeof fetch = async (input, init) => {
    const u = new URL(String(input));
    const path = decodeURIComponent(u.pathname.replace("/api/v1/", ""));
    const method = init?.method ?? "GET";
    if (method === "GET") {
      const r = await base(input, init);
      if (path !== "sections" || !r.ok || control.missingSection) return r;
      const result = await r.json();
      return Response.json({
        ...result,
        results: [
          ...result.results,
          {
            id: "section:active",
            project_id: u.searchParams.get("project_id"),
            name: "In Arbeit",
          },
        ],
      });
    }
    f.calls.push({ url: u.toString(), method });
    if (new Headers(init?.headers).get("authorization") !== "Bearer " + token)
      return Response.json({}, { status: 401 });
    if (method !== "POST" || !path.endsWith("/move"))
      return Response.json({}, { status: 405 });
    const id = path.slice(6, -5);
    const t = f.state.tasks.find((t) => t.id === id);
    if (!t) return Response.json({}, { status: 404 });
    if (control.failTask === id)
      return Response.json(
        {},
        { status: 429, headers: { "Retry-After": "30" } },
      );
    if (control.timeoutUnknown === id)
      throw new DOMException("synthetic timeout", "TimeoutError");
    const body = JSON.parse(String(init?.body));
    t.section_id = body.section_id;
    for (const child of f.state.tasks.filter((c) => c.parent_id === t.id))
      child.section_id = t.section_id;
    await control.afterMove?.();
    if (control.timeoutApplied === id)
      throw new DOMException("synthetic timeout", "TimeoutError");
    return Response.json(t);
  };
  return { ...f, fetcher, control };
}
