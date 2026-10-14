import { z } from "zod";
import { loadConfig } from "../config";
const schema = z.object({
  AUTH_SECRET: z
    .string()
    .min(64)
    .regex(/^[a-f0-9]+$/),
  AUTH_ORIGIN: z.url(),
});
export function loadIdentityConfig(env: NodeJS.ProcessEnv = process.env) {
  const base = loadConfig(env);
  const r = schema.safeParse(env);
  if (!r.success)
    throw new Error(
      "Invalid identity configuration: " +
        r.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  const origin = new URL(r.data.AUTH_ORIGIN);
  if (
    origin.origin !== r.data.AUTH_ORIGIN ||
    origin.username ||
    origin.password
  )
    throw new Error("AUTH_ORIGIN must be an exact origin");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
  if (
    origin.protocol !== "https:" &&
    !(base.HELIOS_ENV !== "production" && local && origin.protocol === "http:")
  )
    throw new Error("Production requires HTTPS; HTTP is loopback only");
  return { ...base, ...r.data, secure: origin.protocol === "https:" };
}
export type IdentityConfig = ReturnType<typeof loadIdentityConfig>;
