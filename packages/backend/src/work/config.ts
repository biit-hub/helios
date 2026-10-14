import { loadIdentityConfig } from "../identity/config";
export function loadWorkConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = loadIdentityConfig(env);
  const key = env.INTEGRATION_KEY;
  if (key && !/^[a-f0-9]{64}$/.test(key))
    throw new Error("Invalid integration encryption key");
  let origin = "https://api.todoist.com/api/v1/";
  if (env.TODOIST_TEST_ORIGIN) {
    const u = new URL(env.TODOIST_TEST_ORIGIN);
    if (
      config.HELIOS_ENV !== "test" ||
      u.protocol !== "http:" ||
      u.hostname !== "127.0.0.1" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/api/v1/"
    )
      throw new Error("Todoist fixture origin is test-loopback only");
    origin = u.toString();
  }
  return { ...config, INTEGRATION_KEY: key, TODOIST_ORIGIN: origin };
}
export type WorkConfig = ReturnType<typeof loadWorkConfig>;
