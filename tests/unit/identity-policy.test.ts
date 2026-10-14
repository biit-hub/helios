import { describe, it, expect } from "vitest";
import {
  safeReturnTo,
  assertSessionPolicy,
  assertRequest,
  DURATIONS,
} from "../../packages/backend/src/identity/policy";
import { loadIdentityConfig } from "../../packages/backend/src/identity/config";
const now = new Date("2026-10-14T12:00:00Z");
const policy = {
  purpose: "full",
  trusted: false,
  mfaAt: now,
  stepUpAt: now,
  lastSeenAt: now,
  absoluteExpiresAt: new Date(now.getTime() + DURATIONS.normal),
};
describe("hard session and request boundaries", () => {
  it.each([
    "//evil.invalid",
    "https://evil.invalid",
    "/\\evil",
    "/%2f%2fevil",
    "/login?returnTo=//evil",
    "javascript:alert(1)",
  ])("rejects redirect %s", (target) => expect(safeReturnTo(target)).toBe("/"));
  it("allows only explicit application paths", () => {
    expect(safeReturnTo("/mobile")).toBe("/mobile");
    expect(safeReturnTo("/settings/security")).toBe("/settings/security");
  });
  it.each([
    ["pending", true],
    ["active", false],
  ])("requires active user and MFA (%s)", (status, mfa) =>
    expect(() =>
      assertSessionPolicy(policy, status as string, mfa as boolean, now),
    ).toThrow(),
  );
  it("rejects exact idle, absolute and step-up boundaries", () => {
    expect(() =>
      assertSessionPolicy(
        { ...policy, lastSeenAt: new Date(now.getTime() - DURATIONS.idle) },
        "active",
        true,
        now,
      ),
    ).toThrow();
    expect(() =>
      assertSessionPolicy(
        { ...policy, absoluteExpiresAt: now },
        "active",
        true,
        now,
      ),
    ).toThrow();
    expect(() =>
      assertSessionPolicy(
        { ...policy, stepUpAt: new Date(now.getTime() - DURATIONS.stepUp) },
        "active",
        true,
        now,
        true,
      ),
    ).toThrow();
  });
  it("does not infer trusted-device MFA from a client flag", () =>
    expect(() =>
      assertSessionPolicy(
        { ...policy, trusted: true, mfaAt: null },
        "active",
        true,
        now,
      ),
    ).toThrow());
  it("requires HTTPS in production and loopback for local HTTP", () => {
    const env = {
      HELIOS_ENV: "production",
      DATABASE_URL: "postgresql://helios:synthetic@postgres/helios_prod",
      AUTH_SECRET: "e".repeat(64),
      AUTH_ORIGIN: "http://127.0.0.1:3100",
    };
    expect(() => loadIdentityConfig(env)).toThrow();
    expect(() =>
      loadIdentityConfig({
        ...env,
        HELIOS_ENV: "development",
        AUTH_ORIGIN: "http://example.invalid",
      }),
    ).toThrow();
    const config = loadIdentityConfig({
      ...env,
      AUTH_ORIGIN: "https://helios.example.invalid",
    });
    expect(config.secure).toBe(true);
    expect(() =>
      assertRequest(
        new Headers({ host: "helios.example.invalid" }),
        config,
        true,
      ),
    ).toThrow();
  });
});
