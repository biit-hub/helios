import { z } from "zod";
const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const schema = z.object({
  HELIOS_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:/.test(v)),
  WORKER_ENABLED: bool.default(true),
  RESTORE_MODE: bool.default(false),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success)
    throw new Error(
      "Invalid configuration: " +
        result.error.issues.map((i) => i.path.join(".")).join(", "),
    );
  const config = result.data;
  const db = new URL(config.DATABASE_URL);
  if (config.HELIOS_ENV === "test" && !db.pathname.slice(1).endsWith("_test"))
    throw new Error("Test database must end in _test");
  if (db.password === "REPLACE_WITH_GENERATED_PASSWORD" || !db.password)
    throw new Error("Generate a private database password");
  return config;
}
