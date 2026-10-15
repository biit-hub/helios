import { it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRoutineResource } from "../../apps/web/components/routine-resource";
afterEach(() => vi.unstubAllGlobals());
it("keeps the newest routine result when an older request completes later", async () => {
  const pending: ((r: Response) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((r) => pending.push(r))),
  );
  const hook = renderHook(
    ({ version }) =>
      useRoutineResource<{ revision: number }>("/api/routine", version),
    { initialProps: { version: 1 } },
  );
  hook.rerender({ version: 2 });
  await act(async () => pending[1]!(Response.json({ revision: 2 })));
  await act(async () => pending[0]!(Response.json({ revision: 1 })));
  expect(hook.result.current.data?.revision).toBe(2);
});
it("retains the saved routine on a network failure and permits deliberate retry", async () => {
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (++count === 2) throw Error("offline");
      return Response.json({ revision: count });
    }),
  );
  const hook = renderHook(() =>
    useRoutineResource<{ revision: number }>("/api/routine", 1),
  );
  await act(async () => {});
  expect(hook.result.current.data?.revision).toBe(1);
  await act(async () => {
    await expect(hook.result.current.reload()).rejects.toThrow("offline");
  });
  expect(hook.result.current.data?.revision).toBe(1);
  expect(hook.result.current.error).toBe("offline");
  await act(async () => {
    await hook.result.current.reload();
  });
  expect(hook.result.current.data?.revision).toBe(3);
  expect(hook.result.current.error).toBe("");
});
