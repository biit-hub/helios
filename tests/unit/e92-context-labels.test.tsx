import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { LabelPicker } from "../../apps/web/components/label-picker";
import { resolveContext } from "../../apps/web/components/active-context";
import type { ContextView } from "@helios/contracts";
afterEach(() => vi.unstubAllGlobals());
it("retains the explicit central context and never falls back to private for invalid selections", () => {
  const contexts = [
    { id: "private", active: true },
    { id: "work", active: true },
    { id: "inactive", active: false },
  ] as ContextView[];
  expect(resolveContext(contexts, null, "work")).toBe("work");
  expect(resolveContext(contexts, "work", "private")).toBe("work");
  expect(resolveContext(contexts, "inactive", "private")).toBe("");
  expect(resolveContext(contexts, null, "removed")).toBe("");
  expect(resolveContext(contexts, null, null)).toBe("");
});
it("filters real label names and supports keyboard choice, multiple chips and explicit removal", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ labels: ["Dokumentation", "Besorgen", "epic"] }),
    ),
  );
  function Form() {
    const [value, setValue] = useState<string[]>(["epic"]);
    return <LabelPicker value={value} onChange={setValue} />;
  }
  render(<Form />);
  const search = screen.getByRole("combobox", { name: "Labels suchen" });
  fireEvent.focus(search);
  await screen.findByRole("option", { name: "Dokumentation" });
  fireEvent.change(search, { target: { value: "doku" } });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(
    screen.getByRole("button", { name: "Label entfernen: Dokumentation" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Label entfernen: epic" }),
  ).toBeVisible();
  fireEvent.keyDown(search, { key: "Escape" });
  expect(search).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(
    screen.getByRole("button", { name: "Label entfernen: epic" }),
  );
  expect(
    screen.queryByRole("button", { name: "Label entfernen: epic" }),
  ).toBeNull();
  fireEvent.change(search, { target: { value: "invented" } });
  expect(screen.getByText("Keine passenden vorhandenen Labels.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /erstellen/i })).toBeNull();
});
it("retains existing labels when the label catalogue is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 503 })),
  );
  const change = vi.fn();
  render(<LabelPicker value={["Existing shared label"]} onChange={change} />);
  await screen.findByText(/Labeldaten sind momentan nicht verfügbar/);
  expect(
    screen.getByRole("button", {
      name: "Label entfernen: Existing shared label",
    }),
  ).toBeVisible();
  expect(change).not.toHaveBeenCalled();
});
