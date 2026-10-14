import { describe, it, expect } from "vitest";
import {
  createTodoistReader,
  TodoistFault,
} from "../../packages/backend/src/work/todoist";
import { loadWorkConfig } from "../../packages/backend/src/work/config";
import { fixture, token, projects } from "../fixtures/todoist";
import { contextInput, themes } from "@helios/contracts";
describe("verified Todoist v1 read-only contract", () => {
  it("loads complete cursor-paginated projects and opaque IDs without write calls", async () => {
    const f = fixture();
    const r = createTodoistReader(f.fetcher);
    const ps = await r.projects(token);
    expect(ps).toHaveLength(5);
    expect(ps[0]!.id).toBe("project:private/alpha");
    expect(f.calls).toHaveLength(2);
    expect(
      f.calls.every(
        (c) =>
          c.method === "GET" &&
          c.url.startsWith("https://api.todoist.com/api/v1/"),
      ),
    ).toBe(true);
    expect(new URL(f.calls[1]!.url).searchParams.get("limit")).toBe("200");
    expect(new URL(f.calls[1]!.url).searchParams.get("cursor")).toBe(
      "page.two",
    );
  });
  it("preserves native parent, planned time and real deadline independently", async () => {
    const f = fixture();
    const r = createTodoistReader(f.fetcher);
    const tasks = await r.tasks(token, projects[0]!.id);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.due?.datetime).toBe("2026-10-20T10:00:00");
    expect(tasks[0]!.deadline?.date).toBe("2026-10-23");
    expect(tasks[1]!.parent_id).toBe(tasks[0]!.id);
    expect(tasks[1]!.deadline).toBeNull();
    expect((await r.project(token, projects[4]!.id)).inbox_project).toBe(true);
    expect((await r.comments(token, tasks[0]!.id))[0]!.content).toBe(
      "Synthetischer Fortschritt.",
    );
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  });
  it.each([
    "auth_error",
    "expired",
    "network",
    "timeout",
    "rate_limit",
    "unexpected",
  ] as const)("classifies %s without disclosing credentials", async (mode) => {
    const f = fixture();
    f.state.mode = mode;
    const r = createTodoistReader(f.fetcher);
    let error: unknown;
    try {
      await r.projects(token);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TodoistFault);
    expect((error as TodoistFault).code).toBe(
      mode === "expired" ? "auth_error" : mode,
    );
    expect(String(error)).not.toContain(token);
    if (mode === "rate_limit")
      expect((error as TodoistFault).retrySeconds).toBe(90);
  });
  it("rejects malformed JSON, repeated cursors and incomplete task shapes", async () => {
    const bad = createTodoistReader(async () => new Response("not JSON"));
    await expect(bad.projects(token)).rejects.toMatchObject({
      code: "unexpected",
    });
    const loop = createTodoistReader(async () =>
      Response.json({ results: [], next_cursor: "same.cursor" }),
    );
    await expect(loop.projects(token)).rejects.toMatchObject({
      code: "unexpected",
    });
    const incomplete = createTodoistReader(async () =>
      Response.json({ results: [{ id: "opaque" }], next_cursor: null }),
    );
    await expect(incomplete.tasks(token, "project")).rejects.toMatchObject({
      code: "unexpected",
    });
  });
  it("uses a real abort timeout and forbids redirects structurally", async () => {
    let redirect: string | undefined;
    const r = createTodoistReader(
      async (_url, options) => {
        redirect = options?.redirect;
        return new Promise((_resolve, reject) =>
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "TimeoutError")),
          ),
        );
      },
      undefined,
      10,
    );
    await expect(r.projects(token)).rejects.toMatchObject({ code: "timeout" });
    expect(redirect).toBe("error");
  });
  it("does not permit production fixture origins or untrusted remote hosts", () => {
    const env = {
      HELIOS_ENV: "test",
      DATABASE_URL: "postgresql://helios:synthetic@127.0.0.1/helios_test",
      AUTH_SECRET: "e".repeat(64),
      AUTH_ORIGIN: "http://127.0.0.1:3100",
      INTEGRATION_KEY: "b".repeat(64),
    };
    expect(() =>
      loadWorkConfig({
        ...env,
        TODOIST_TEST_ORIGIN: "http://169.254.169.254/api/v1/",
      }),
    ).toThrow();
    expect(() =>
      loadWorkConfig({
        ...env,
        HELIOS_ENV: "production",
        AUTH_ORIGIN: "https://helios.invalid",
        TODOIST_TEST_ORIGIN: "http://127.0.0.1:3102/api/v1/",
      }),
    ).toThrow();
    expect(loadWorkConfig(env).TODOIST_ORIGIN).toBe(
      "https://api.todoist.com/api/v1/",
    );
  });
  it("offers exactly six themes and validates context data", () => {
    expect(Object.values(themes)).toEqual([
      "Kupfer",
      "Meerblau",
      "Waldgrün",
      "Pflaume",
      "Terrakotta",
      "Gold",
    ]);
    expect(() =>
      contextInput.parse({
        revision: 0,
        name: "",
        theme: "other",
        active: true,
        projectId: null,
        termihubEmployerId: null,
        termihubInstanceRef: null,
      }),
    ).toThrow();
  });
});
