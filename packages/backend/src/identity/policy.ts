import { z } from "zod";
import type { IdentityConfig } from "./config";
export class AuthFault extends Error {
  constructor(
    public code = "AUTH_FAILED",
    public status = 401,
  ) {
    super(code);
  }
}
export const DURATIONS = {
  normal: 12 * 3600000,
  trusted: 30 * 86400000,
  idle: 30 * 60000,
  stepUp: 5 * 60000,
  enrollment: 10 * 60000,
  challenge: 5 * 60000,
};
export function safeReturnTo(value: unknown) {
  return typeof value === "string" &&
    [
      "/",
      "/tasks",
      "/plan",
      "/mobile",
      "/settings/security",
      "/settings/contexts",
    ].includes(value)
    ? value
    : "/";
}
export function assertRequest(
  headers: Headers,
  config: IdentityConfig,
  mutation = false,
) {
  const host = headers.get("host");
  if (host !== new URL(config.AUTH_ORIGIN).host)
    throw new AuthFault("REQUEST_REJECTED", 403);
  if (
    mutation &&
    (headers.get("origin") !== config.AUTH_ORIGIN ||
      !headers.get("content-type")?.startsWith("application/json") ||
      !["same-origin", "none", null].includes(headers.get("sec-fetch-site")))
  )
    throw new AuthFault("REQUEST_REJECTED", 403);
}
export function assertSessionPolicy(
  policy: {
    purpose: string;
    absoluteExpiresAt: Date;
    lastSeenAt: Date;
    trusted: boolean;
    mfaAt: Date | null;
    stepUpAt: Date | null;
  },
  status: string,
  twoFactorEnabled: boolean,
  now: Date,
  stepUp = false,
) {
  if (
    status !== "active" ||
    !twoFactorEnabled ||
    policy.purpose !== "full" ||
    !policy.mfaAt ||
    policy.absoluteExpiresAt <= now ||
    (!policy.trusted &&
      now.getTime() - policy.lastSeenAt.getTime() >= DURATIONS.idle)
  )
    throw new AuthFault();
  if (
    stepUp &&
    (!policy.stepUpAt ||
      now.getTime() - policy.stepUpAt.getTime() >= DURATIONS.stepUp)
  )
    throw new AuthFault("STEP_UP_REQUIRED", 403);
}
export function deviceLabel(agent: string | null) {
  const text = agent ?? "";
  const browser = /Firefox/.test(text)
    ? "Firefox"
    : /Edg/.test(text)
      ? "Edge"
      : /Chrome|Chromium/.test(text)
        ? "Chrome"
        : /Safari/.test(text)
          ? "Safari"
          : "Browser";
  const platform = /iPhone|iPad/.test(text)
    ? "iOS"
    : /Android/.test(text)
      ? "Android"
      : /Windows/.test(text)
        ? "Windows"
        : /Macintosh/.test(text)
          ? "macOS"
          : /Linux/.test(text)
            ? "Linux"
            : "Gerät";
  return browser + " · " + platform;
}
export const credentials = z.strictObject({
  username: z.string().min(1).max(30),
  password: z.string().min(1).max(128),
  trusted: z.boolean().default(false),
  returnTo: z.string().max(200).optional(),
});
export const passwordInput = z.string().min(12).max(128);
export const codeInput = z.string().regex(/^\d{6}$/);
