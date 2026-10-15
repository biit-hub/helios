import { isIP } from "node:net";
import { WorkFault } from "../work/service";
export function aiConfig(env: NodeJS.ProcessEnv = process.env) {
  const base = env.OLLAMA_BASE_URL;
  const model = env.OLLAMA_MODEL;
  const timeout = Number(env.OLLAMA_TIMEOUT_SECONDS ?? 90);
  if (!Number.isInteger(timeout) || timeout < 5 || timeout > 180)
    throw new Error("Invalid Ollama timeout");
  if (!base || !model)
    return {
      enabled: false,
      base: null,
      model: model ?? "unconfigured",
      timeout: timeout * 1000,
    };
  const u = new URL(base);
  const h = u.hostname.replace(/^\[|\]$/g, "");
  const private4 =
    isIP(h) === 4 &&
    (/^(127\.|10\.|192\.168\.)/.test(h) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h));
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/" ||
    !(
      private4 ||
      h === "::1" ||
      h === "localhost" ||
      h === "host.docker.internal"
    )
  )
    throw new WorkFault("AI_LOCAL_ORIGIN_REQUIRED", 400);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,150}$/.test(model) ||
    /cloud/i.test(model)
  )
    throw new Error("Invalid local Ollama model");
  return { enabled: true, base: u.origin, model, timeout: timeout * 1000 };
}
export type AiConfig = ReturnType<typeof aiConfig>;
