import { expect, it, vi } from "vitest";
import { resetBrowserFixture } from "../fixtures/browser-reset";
it("only retries the atomically rolled-back fixture reset for a PostgreSQL deadlock", async () => {
  const query = vi
    .fn()
    .mockRejectedValueOnce({ code: "40P01" })
    .mockRejectedValueOnce({ code: "40P01" })
    .mockResolvedValue(undefined);
  const wait = vi.fn(async () => {});
  await resetBrowserFixture(query, wait);
  expect(query).toHaveBeenCalledTimes(3);
  expect(new Set(query.mock.calls.map(([sql]) => sql)).size).toBe(1);
  expect(wait.mock.calls).toEqual([[100], [200]]);
});
it("does not retry a successful fixture reset", async () => {
  const query = vi.fn(async () => {}),
    wait = vi.fn(async () => {});
  await resetBrowserFixture(query, wait);
  expect(query).toHaveBeenCalledOnce();
  expect(wait).not.toHaveBeenCalled();
});
it("propagates a continuing deadlock after exactly three reset attempts", async () => {
  const failure = { code: "40P01" };
  const query = vi.fn().mockRejectedValue(failure),
    wait = vi.fn(async () => {});
  await expect(resetBrowserFixture(query, wait)).rejects.toBe(failure);
  expect(query).toHaveBeenCalledTimes(3);
  expect(wait).toHaveBeenCalledTimes(2);
});
it.each([
  { code: "08006" },
  { code: "42501" },
  new Error("Synthetic failure"),
  null,
])("never retries a different reset failure (%j)", async (failure) => {
  const query = vi.fn().mockRejectedValue(failure),
    wait = vi.fn(async () => {});
  await expect(resetBrowserFixture(query, wait)).rejects.toBe(failure);
  expect(query).toHaveBeenCalledOnce();
  expect(wait).not.toHaveBeenCalled();
});
