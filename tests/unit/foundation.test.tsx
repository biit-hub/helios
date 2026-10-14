import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Foundation } from "@helios/ui";
import { smokeJobSchema } from "@helios/contracts";
import { loadConfig } from "../../packages/backend/src/config";
describe("technical foundation", () => {
  it("shows scope without fake login", () => {
    render(<Foundation />);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(screen.getByText(/Dein Zugang ist geschützt/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /anmelden/i }),
    ).not.toBeInTheDocument();
  });
  it("offers desktop navigation from mobile", () => {
    render(<Foundation mobile />);
    expect(
      screen.getByRole("link", { name: /Desktop-Grundlayout/ }),
    ).toHaveAttribute("href", "/");
  });
  it("rejects malformed and additional queue payload fields", () => {
    expect(smokeJobSchema.safeParse({ probeId: "invalid" }).success).toBe(
      false,
    );
    expect(
      smokeJobSchema.safeParse({
        probeId: crypto.randomUUID(),
        token: "private",
      }).success,
    ).toBe(false);
  });
  it("fails closed for unsafe test config without leaking credentials", () => {
    const env = {
      HELIOS_ENV: "test",
      DATABASE_URL: "postgresql://helios:synthetic@localhost/production",
    };
    expect(() => loadConfig(env)).toThrow("Test database must end in _test");
    expect(() =>
      loadConfig({ ...env, DATABASE_URL: "private-secret" }),
    ).toThrow("Invalid configuration: DATABASE_URL");
  });
  it("parses booleans rather than treating false as truthy", () => {
    expect(
      loadConfig({
        HELIOS_ENV: "test",
        DATABASE_URL: "postgresql://helios:synthetic@localhost/helios_test",
        WORKER_ENABLED: "false",
        RESTORE_MODE: "true",
      }).WORKER_ENABLED,
    ).toBe(false);
  });
});
